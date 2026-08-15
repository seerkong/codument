import * as fs from 'fs';
import * as path from 'path';
import {
  ACTIVE_TRACKS_DIR,
  ARCHIVED_TRACKS_DIR,
  CONFIG_DIR,
  PENDING_TRACKS_DIR,
  codumentExists,
  parseOptions,
} from '../utils';
import { parseSpecXmlContent, type SpecXmlNode } from '../utils/spec-xml';
import { validateMissionXml } from '../mission/validate';
import { validateDecisionsFile } from './decisions';

/**
 * `codument validate [track-id]` — validates the new XML standard:
 *   - tracks/{pending,active}/<id>/track.xml              (root <Track>)
 *   - tracks/{pending,active}/<id>/behavior_deltas/**.xml (root <behavior-patch>)
 * No args (or `all`) validates every pending and active track.
 */

interface ValidationError {
  file: string;
  message: string;
  severity: 'error' | 'warning';
  /** Stable rule id (see T1.5 unified AI-friendly output). */
  rule?: string;
}

const METADATA_STATUS = new Set(['new', 'in_progress', 'completed', 'cancelled']);
const QUESTION_MODE = new Set(['decision-tree']);
const QUESTION_SEVERITY = new Set(['auto', 'light', 'normal', 'deep']);
const NODE_STATUS = new Set([
  'NOT_STARTED', 'ACTIVE', 'DELEGATED', 'FORWARDED', 'DONE', 'REFUSED', 'ABANDONED',
]);
const CHILD_MODE = new Set(['sequential', 'dag']);
const HOOK_POINTS = new Set([
  'track:before', 'track:after', 'phase:before', 'phase:after', 'task:before', 'task:after',
]);
const ON_EXHAUSTED = new Set(['block', 'continue', 'fail']);
const OP_TAGS = new Set(['upsert', 'delete', 'move']);

// --- tiny tree helpers over SpecXmlNode -------------------------------------

function childrenByTag(node: SpecXmlNode, tag: string): SpecXmlNode[] {
  return node.children.filter((c) => c.tag === tag);
}
function firstChild(node: SpecXmlNode, tag: string): SpecXmlNode | undefined {
  return node.children.find((c) => c.tag === tag);
}
function descendants(node: SpecXmlNode, pred: (n: SpecXmlNode) => boolean, acc: SpecXmlNode[] = []): SpecXmlNode[] {
  for (const c of node.children) {
    if (pred(c)) acc.push(c);
    descendants(c, pred, acc);
  }
  return acc;
}

function parse(content: string, file: string, errors: ValidationError[]): SpecXmlNode | null {
  try {
    return parseSpecXmlContent(content);
  } catch (e) {
    errors.push({ file, severity: 'error', message: `格式错误 XML：${e instanceof Error ? e.message : String(e)}` });
    return null;
  }
}

// --- attractor profile names (config/attractor-profiles.xml) ----------------

function loadProfileNames(): Set<string> | null {
  const file = path.join(CONFIG_DIR, 'attractor-profiles.xml');
  if (!fs.existsSync(file)) return null;
  try {
    const root = parseSpecXmlContent(fs.readFileSync(file, 'utf-8'));
    return new Set(
      descendants(root, (n) => n.tag === 'Profile').map((p) => p.attrs['name']).filter(Boolean)
    );
  } catch {
    return null;
  }
}

// --- §9.4 per-layer DAG validity (Kahn) -------------------------------------

function validateSchedule(track: SpecXmlNode, file: string, errors: ValidationError[]): void {
  const schedule = firstChild(track, 'Schedule');
  if (!schedule) return;

  const allNodes = descendants(track, (n) => n.tag === 'TaskGroup' || n.tag === 'Task' || n.tag === 'TaskSpace');
  const byId = new Map<string, SpecXmlNode>();
  for (const n of allNodes) {
    const id = n.attrs['id'];
    if (id) byId.set(id, n);
  }
  const directChildIds = (n: SpecXmlNode): Set<string> => {
    const sub = firstChild(n, 'SubNodes') ?? n;
    return new Set(
      sub.children
        .filter((c) => c.tag === 'TaskGroup' || c.tag === 'Task')
        .map((c) => c.attrs['id'])
        .filter(Boolean)
    );
  };

  for (const dag of childrenByTag(schedule, 'Dag')) {
    const forId = dag.attrs['for'];
    const owner = forId ? byId.get(forId) : undefined;
    if (!owner) {
      errors.push({ file, severity: 'error', message: `<Schedule><Dag for="${forId}"> 引用了不存在的节点` });
      continue;
    }
    if (owner.attrs['cdt:child-mode'] !== 'dag') {
      errors.push({ file, severity: 'error', message: `<Dag for="${forId}"> 的目标节点未声明 cdt:child-mode="dag"` });
    }
    const layer = directChildIds(owner);
    const nodes = childrenByTag(dag, 'Node');
    const ids = nodes.map((n) => n.attrs['id']).filter(Boolean);
    const preds = new Map<string, string[]>(); // node -> predecessors (After ref)

    for (const node of nodes) {
      const nid = node.attrs['id'];
      if (!nid || !layer.has(nid)) {
        errors.push({ file, severity: 'error', message: `<Dag for="${forId}"><Node id="${nid}"> 不是该层的直接下层` });
        continue;
      }
      const afters = childrenByTag(node, 'After').map((a) => a.attrs['ref']).filter(Boolean);
      for (const ref of afters) {
        if (!layer.has(ref)) {
          errors.push({ file, severity: 'error', message: `<Node id="${nid}"><After ref="${ref}"> 不是该层的直接下层` });
        }
      }
      preds.set(nid, afters);
    }

    // Kahn cycle detection
    const indeg = new Map<string, number>();
    for (const id of ids) indeg.set(id, (preds.get(id) ?? []).filter((p) => ids.includes(p)).length);
    const queue = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
    let visited = 0;
    while (queue.length) {
      const cur = queue.shift()!;
      visited++;
      for (const [node, ps] of preds) {
        if (ps.includes(cur)) {
          indeg.set(node, (indeg.get(node) ?? 1) - 1);
          if (indeg.get(node) === 0) queue.push(node);
        }
      }
    }
    if (visited < ids.length) {
      errors.push({ file, severity: 'error', message: `<Dag for="${forId}"> 存在环（依赖不可拓扑排序）` });
    }
  }
}

// --- §9.5 Hooks -------------------------------------------------------------

function validateHooks(track: SpecXmlNode, file: string, errors: ValidationError[], profiles: Set<string> | null): void {
  for (const hook of descendants(track, (n) => n.tag === 'Hook')) {
    const on = hook.attrs['on'];
    if (!on || !HOOK_POINTS.has(on)) {
      errors.push({ file, severity: 'error', message: `<Hook on="${on}"> 非法生命周期点` });
    }
  }
  for (const ac of descendants(track, (n) => n.tag === 'cdt:AttractorCheck')) {
    const use = ac.attrs['use'];
    if (!use) {
      errors.push({ file, severity: 'error', message: `<cdt:AttractorCheck> 缺少 use 属性` });
    } else if (profiles && !profiles.has(use)) {
      errors.push({ file, severity: 'error', message: `<cdt:AttractorCheck use="${use}"> 在 config/attractor-profiles.xml 中找不到对应 profile` });
    }
  }
  for (const gl of descendants(track, (n) => n.tag === 'cdt:GapLoop')) {
    const max = gl.attrs['max-rounds'];
    if (max !== undefined && !/^\d+$/.test(max)) {
      errors.push({ file, severity: 'error', message: `<cdt:GapLoop max-rounds="${max}"> 必须是整数` });
    }
    const onEx = gl.attrs['on-exhausted'];
    if (onEx !== undefined && !ON_EXHAUSTED.has(onEx)) {
      errors.push({ file, severity: 'error', rule: 'gap-loop.on-exhausted-illegal', message: `<cdt:GapLoop on-exhausted="${onEx}"> 非法（block|continue|fail）` });
    }
    const verifyRound = gl.attrs['verify-round'];
    if (verifyRound !== undefined && verifyRound !== 'true' && verifyRound !== 'false') {
      errors.push({ file, severity: 'error', message: `<cdt:GapLoop verify-round="${verifyRound}"> 必须是 true 或 false` });
    }
  }
}

// --- track.xml --------------------------------------------------------------

function validateTrackXml(content: string, file: string, errors: ValidationError[], profiles: Set<string> | null): void {
  const root = parse(content, file, errors);
  if (!root) return;

  if (root.tag !== 'Track') {
    errors.push({ file, severity: 'error', message: `根节点必须是 <Track>（实际：<${root.tag}>）` });
    return;
  }
  if (!root.attrs['id']) errors.push({ file, severity: 'error', message: `<Track> 缺少 id 属性` });
  if (root.attrs['xmlns:cdt'] === undefined) {
    errors.push({ file, severity: 'error', message: `<Track> 未声明 xmlns:cdt 命名空间` });
  }

  const metadata = firstChild(root, 'Metadata') ?? root;
  const status = firstChild(metadata, 'Status');
  if (status && status.text && !METADATA_STATUS.has(status.text.trim())) {
    errors.push({ file, severity: 'error', message: `<Metadata><Status>${status.text.trim()}</Status> 非法（new|in_progress|completed|cancelled）` });
  }
  const questionMode = firstChild(metadata, 'QuestionMode');
  if (questionMode?.text && !QUESTION_MODE.has(questionMode.text.trim())) {
    errors.push({ file, severity: 'error', message: `<Metadata><QuestionMode>${questionMode.text.trim()}</QuestionMode> 非法（decision-tree）` });
  }
  const questionSeverity = firstChild(metadata, 'QuestionSeverity');
  if (questionSeverity?.text && !QUESTION_SEVERITY.has(questionSeverity.text.trim())) {
    errors.push({ file, severity: 'error', message: `<Metadata><QuestionSeverity>${questionSeverity.text.trim()}</QuestionSeverity> 非法（auto|light|normal|deep）` });
  }

  const taskSpace = firstChild(root, 'TaskSpace');
  if (!taskSpace) {
    errors.push({ file, severity: 'error', message: `缺少 <TaskSpace>` });
  } else {
    const firstLevel = firstChild(taskSpace, 'SubNodes') ?? taskSpace;
    const phases = childrenByTag(firstLevel, 'TaskGroup');
    if (phases.length === 0) {
      errors.push({ file, severity: 'error', message: `<TaskSpace> 第一层至少需要一个 <TaskGroup>（phase）` });
    }
    const seen = new Set<string>();
    for (const n of descendants(taskSpace, (x) => x.tag === 'TaskGroup' || x.tag === 'Task')) {
      const id = n.attrs['id'];
      if (!id) {
        errors.push({ file, severity: 'error', message: `<${n.tag}> 缺少 id 属性` });
        continue;
      }
      if (seen.has(id)) errors.push({ file, severity: 'error', message: `节点 id 重复：${id}` });
      seen.add(id);

      const s = n.attrs['status'];
      if (s && !NODE_STATUS.has(s)) {
        errors.push({ file, severity: 'error', message: `<${n.tag} id="${id}"> status="${s}" 非 sparrow 枚举` });
      }
      const cm = n.attrs['cdt:child-mode'];
      if (cm && !CHILD_MODE.has(cm)) {
        errors.push({ file, severity: 'error', message: `<${n.tag} id="${id}"> cdt:child-mode="${cm}" 非法（sequential|dag）` });
      }
    }
  }

  validateSchedule(root, file, errors);
  validateHooks(root, file, errors, profiles);
}

// --- behavior_deltas/**.xml -------------------------------------------------

function collectXml(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectXml(full));
    else if (entry.isFile() && entry.name.endsWith('.xml')) out.push(full);
  }
  return out;
}

function validateBehaviorDeltas(trackDir: string, errors: ValidationError[]): number {
  const files = collectXml(path.join(trackDir, 'behavior_deltas'));
  for (const f of files) {
    const root = parse(fs.readFileSync(f, 'utf-8'), f, errors);
    if (!root) continue;
    if (root.tag !== 'behavior-patch') {
      errors.push({ file: f, severity: 'error', message: `根节点必须是 <behavior-patch>（实际：<${root.tag}>）` });
      continue;
    }
    const mutations = descendants(root, (n) => OP_TAGS.has(n.tag));
    if (mutations.length === 0) {
      errors.push({ file: f, severity: 'error', message: `<behavior-patch> 至少需要一个变更（<upsert>|<delete>|<move>）` });
    }
    for (const m of mutations) {
      const sel = m.attrs['selector'];
      if (!sel || !sel.startsWith('behavior://')) {
        errors.push({ file: f, severity: 'error', message: `<${m.tag}> 的 selector 必须是 behavior:// （实际：${sel ?? '缺失'}）` });
      }
    }
  }
  return files.length;
}

/**
 * Validate a track's decision source set (root decisions.xnl + recursive
 * decisions/**) the same way `codument decisions validate` does, so XNL
 * authoring errors are caught at plan/impl time instead of the archive gate.
 * Absence of both targets is a pass (legacy tracks are not false-flagged).
 */
function validateTrackDecisions(trackDir: string, errors: ValidationError[]): void {
  const root = path.join(trackDir, 'decisions.xnl');
  const dir = path.join(trackDir, 'decisions');
  const targets = [root, dir].filter((t) => fs.existsSync(t));
  for (const target of targets) {
    for (const f of validateDecisionsFile(target)) {
      errors.push({
        file: f.file,
        message: f.message,
        severity: f.severity,
        rule: f.layer ? `decision.${f.layer}` : undefined,
      });
    }
  }
}

// --- command ----------------------------------------------------------------

function trackDirectories(): Array<{ id: string; dir: string }> {
  return [PENDING_TRACKS_DIR, ACTIVE_TRACKS_DIR].flatMap((parent) => {
    if (!fs.existsSync(parent)) return [];
    return fs.readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(parent, entry.name, 'track.xml')))
      .map((entry) => ({ id: entry.name, dir: path.join(parent, entry.name) }));
  });
}

function missionDirectories(): Array<{ id: string; dir: string }> {
  return ['pending', 'active', 'archived'].flatMap((state) => {
    const parent = path.join('codument', 'missions', state);
    if (!fs.existsSync(parent)) return [];
    return fs.readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(parent, entry.name, 'mission.xml')))
      .map((entry) => ({ id: entry.name, dir: path.join(parent, entry.name) }));
  });
}

function printFinding(e: ValidationError, baseDir: string): void {
  const rule = e.rule ? ` (${e.rule})` : '';
  console.log(`    ${e.severity === 'error' ? '✗' : '⚠'} [${path.relative(baseDir, e.file)}]${rule} ${e.message}`);
}

export async function validateCommand(args: string[]): Promise<void> {
  if (!codumentExists()) {
    console.error('Codument is not initialized. Run codument init first.');
    process.exit(1);
  }
  const json = args.includes('--json');
  const { positional } = parseOptions(args);
  const target = positional[0];
  const tracks = trackDirectories();
  const missions = missionDirectories();
  const trackTargets = !target || target === 'all'
    ? tracks
    : tracks.filter((track) => track.id === target);
  const missionTargets = !target || target === 'all'
    ? missions
    : (missions.some((m) => m.id === target) ? missions.filter((m) => m.id === target) : []);

  if (trackTargets.length === 0 && missionTargets.length === 0) {
    console.log('No tracks or missions to validate.');
    return;
  }

  const profiles = loadProfileNames();
  let hadError = false;
  const allFindings: ValidationError[] = [];

  for (const { id, dir: trackDir } of trackTargets) {
    const trackXml = path.join(trackDir, 'track.xml');
    const errors: ValidationError[] = [];

    if (!fs.existsSync(trackXml)) {
      console.log(`✗ ${id}: track.xml 不存在`);
      hadError = true;
      continue;
    }
    validateTrackXml(fs.readFileSync(trackXml, 'utf-8'), trackXml, errors, profiles);
    const deltaCount = validateBehaviorDeltas(trackDir, errors);
    validateTrackDecisions(trackDir, errors);

    const errs = errors.filter((e) => e.severity === 'error');
    const warns = errors.filter((e) => e.severity === 'warning');
    if (errs.length === 0) {
      console.log(`✓ ${id}: track.xml OK${deltaCount ? ` + ${deltaCount} behavior delta(s)` : ''}${warns.length ? ` (${warns.length} warning)` : ''}`);
    } else {
      hadError = true;
      console.log(`✗ ${id}: ${errs.length} error(s)`);
    }
    for (const e of errors) {
      printFinding(e, trackDir);
    }
    allFindings.push(...errors);
  }

  for (const { id, dir: missionDir } of missionTargets) {
    const missionXml = path.join(missionDir, 'mission.xml');
    const errors: ValidationError[] = validateMissionXml(fs.readFileSync(missionXml, 'utf-8')).map((f) => ({
      file: missionXml,
      severity: f.severity,
      message: f.message,
      rule: f.rule,
    }));

    const errs = errors.filter((e) => e.severity === 'error');
    const warns = errors.filter((e) => e.severity === 'warning');
    if (errs.length === 0) {
      console.log(`✓ mission ${id}: mission.xml OK${warns.length ? ` (${warns.length} warning)` : ''}`);
    } else {
      hadError = true;
      console.log(`✗ mission ${id}: ${errs.length} error(s)`);
    }
    for (const e of errors) {
      printFinding(e, missionDir);
    }
    allFindings.push(...errors);
  }

  if (json) {
    console.log(JSON.stringify(allFindings, null, 2));
  }

  if (hadError) process.exit(1);
}
