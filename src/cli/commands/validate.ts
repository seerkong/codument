import * as fs from 'fs';
import * as path from 'path';
import { parseOptions, codumentExists, TRACKS_DIR, CONFIG_DIR } from '../utils';
import { parseSpecXmlContent, type SpecXmlNode } from '../utils/spec-xml';

/**
 * `codument validate [track-id]` — validates the new XML standard:
 *   - tracks/<id>/track.xml                (root <Track>, per std/spec/track-xml-spec.md §9)
 *   - tracks/<id>/behavior_deltas/**.xml   (root <behavior-patch>)
 * No args (or `all`) validates every track under codument/tracks/.
 */

interface ValidationError {
  file: string;
  message: string;
  severity: 'error' | 'warning';
}

const METADATA_STATUS = new Set(['new', 'in_progress', 'completed', 'cancelled']);
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
      errors.push({ file, severity: 'warning', message: `<cdt:GapLoop on-exhausted="${onEx}"> 非常见取值（block|continue|fail）` });
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

  const status = firstChild(firstChild(root, 'Metadata') ?? root, 'Status');
  if (status && status.text && !METADATA_STATUS.has(status.text.trim())) {
    errors.push({ file, severity: 'error', message: `<Metadata><Status>${status.text.trim()}</Status> 非法（new|in_progress|completed|cancelled）` });
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

// --- command ----------------------------------------------------------------

function trackIds(): string[] {
  if (!fs.existsSync(TRACKS_DIR)) return [];
  return fs.readdirSync(TRACKS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(TRACKS_DIR, e.name, 'track.xml')))
    .map((e) => e.name);
}

export async function validateCommand(args: string[]): Promise<void> {
  if (!codumentExists()) {
    console.error('Codument is not initialized. Run codument init first.');
    process.exit(1);
  }
  const { positional } = parseOptions(args);
  const target = positional[0];
  const ids = !target || target === 'all' ? trackIds() : [target];

  if (ids.length === 0) {
    console.log('No tracks to validate.');
    return;
  }

  const profiles = loadProfileNames();
  let hadError = false;

  for (const id of ids) {
    const trackDir = path.join(TRACKS_DIR, id);
    const trackXml = path.join(trackDir, 'track.xml');
    const errors: ValidationError[] = [];

    if (!fs.existsSync(trackXml)) {
      console.log(`✗ ${id}: track.xml 不存在`);
      hadError = true;
      continue;
    }
    validateTrackXml(fs.readFileSync(trackXml, 'utf-8'), trackXml, errors, profiles);
    const deltaCount = validateBehaviorDeltas(trackDir, errors);

    const errs = errors.filter((e) => e.severity === 'error');
    const warns = errors.filter((e) => e.severity === 'warning');
    if (errs.length === 0) {
      console.log(`✓ ${id}: track.xml OK${deltaCount ? ` + ${deltaCount} behavior delta(s)` : ''}${warns.length ? ` (${warns.length} warning)` : ''}`);
    } else {
      hadError = true;
      console.log(`✗ ${id}: ${errs.length} error(s)`);
    }
    for (const e of errors) {
      console.log(`    ${e.severity === 'error' ? '✗' : '⚠'} [${path.relative(trackDir, e.file)}] ${e.message}`);
    }
  }

  if (hadError) process.exit(1);
}
