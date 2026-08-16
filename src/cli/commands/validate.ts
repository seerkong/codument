import * as fs from 'fs';
import * as path from 'path';
import {
  ACTIVE_TRACKS_DIR,
  ARCHIVED_TRACKS_DIR,
  BEHAVIORS_DIR,
  CONFIG_DIR,
  PENDING_TRACKS_DIR,
  codumentExists,
  parseOptions,
} from '../utils';
import { parseBehaviorPatchContent, parseSpecXmlContent, type SpecXmlNode } from '../utils/spec-xml';
import { parseTrackResourceContent, resolveTrackAuthority } from '../track/resource';
import { verifyResource } from '../migrations';
import { parseMissionResource, resolveMissionAuthority } from '../mission/resource';
import { validateMissionNode } from '../mission/validate';
import { parseConfigRoot } from '../config/resource';
import { wordToString, type DataElementNode, type XnlNode } from 'xnl-core';
import { validateDecisionsFile } from './decisions';
import { parseBehaviorXnlContent } from '../behavior/resource';

/**
 * `codument validate [track-id]` — validates structured Track resources:
 *   - tracks/{pending,active}/<id>/track.xnl              (root <Track>)
 *   - tracks/{pending,active}/<id>/track.xml              (legacy fallback)
 *   - tracks/{pending,active}/<id>/behavior_deltas/**.xnl (root <BehaviorPatch>)
 *   - tracks/{pending,active}/<id>/behavior_deltas/**.xml (legacy fallback)
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
const COMMIT_MODE = new Set(['auto', 'manual']);
const NODE_STATUS = new Set([
  'NOT_STARTED', 'ACTIVE', 'DELEGATED', 'FORWARDED', 'DONE', 'REFUSED', 'ABANDONED',
]);
const CHILD_MODE = new Set(['sequential', 'dag']);
const PRIORITY = new Set(['P0', 'P1', 'P2']);
const MATERIAL_ROLES = new Set(['input', 'output']);
const MATERIAL_DOMAINS = new Set(['code', 'test', 'behavior', 'docs', 'modeling', 'engineering', 'artifact', 'memory']);
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
function hasTag(node: SpecXmlNode, tag: string): boolean {
  return node.tag === tag || node.tag === `cdt:${tag}`;
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

function parseTrack(content: string, file: string, errors: ValidationError[]): SpecXmlNode | null {
  try {
    return parseTrackResourceContent(content, file);
  } catch (e) {
    errors.push({ file, severity: 'error', message: `Track 格式错误：${e instanceof Error ? e.message : String(e)}` });
    return null;
  }
}

// --- attractor profile names (config/attractor-profiles.xnl) ----------------

function loadProfileNames(): Set<string> | null {
  const xnl = path.join(CONFIG_DIR, 'attractor-profiles.xnl');
  if (fs.existsSync(xnl)) {
    try {
      const root = parseConfigRoot(xnl, 'AttractorProfiles');
      const profiles = root.extend?.children.Profiles;
      if (!isDataElement(profiles)) return new Set();
      return new Set(profiles.body?.filter(isDataElement).map((profile) => wordToString(profile.id)).filter(Boolean) as string[]);
    } catch {
      return null;
    }
  }
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

function isDataElement(value: XnlNode | undefined): value is DataElementNode {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && 'kind' in value && value.kind === 'DataElement');
}

// --- §9.4 per-layer DAG validity (Kahn) -------------------------------------

function validateSchedule(track: SpecXmlNode, file: string, errors: ValidationError[]): void {
  const schedule = firstChild(track, 'Schedule');
  if (!schedule) return;

  const maxConcurrent = schedule.attrs['max-concurrent'];
  if (maxConcurrent !== undefined && (!/^\d+$/.test(maxConcurrent) || Number(maxConcurrent) < 1)) {
    errors.push({ file, severity: 'error', rule: 'track.schedule.max-concurrent', message: `<Schedule max_concurrent="${maxConcurrent}"> 必须是正整数` });
  }
  const spotCheck = schedule.attrs['spot-check'];
  if (spotCheck !== undefined && !['true', 'false'].includes(spotCheck)) {
    errors.push({ file, severity: 'error', rule: 'track.schedule.spot-check', message: `<Schedule spot_check="${spotCheck}"> 必须是 true 或 false` });
  }

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
      errors.push({ file, severity: 'error', message: `<AttractorCheck use="${use}"> 在 config/attractor-profiles.xnl 中找不到对应 profile` });
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

  const rootHooks = firstChild(track, 'Hooks');
  const rootGapLoop = rootHooks?.children.some((hook) => hook.tag === 'Hook'
    && hook.attrs.on === 'track:after'
    && descendants(hook, (node) => node.tag === 'cdt:GapLoop').length > 0) ?? false;
  const taskSpace = firstChild(track, 'TaskSpace');
  const phaseGapLoop = taskSpace
    ? (firstChild(taskSpace, 'SubNodes') ?? taskSpace).children
      .filter((node) => node.tag === 'TaskGroup')
      .some((phase) => descendants(phase, (node) => node.tag === 'Hook'
        && node.attrs.on === 'phase:after'
        && descendants(node, (child) => child.tag === 'cdt:GapLoop').length > 0).length > 0)
    : false;
  if (rootGapLoop && phaseGapLoop) {
    errors.push({
      file,
      severity: 'error',
      rule: 'track.hook.gap-loop-duplicate',
      message: '同一 Track 不得同时配置 track:after GapLoop 与 phase:after GapLoop；默认只在 phase:after 执行',
    });
  }
}

function validatePorts(track: SpecXmlNode, file: string, errors: ValidationError[]): void {
  const ports = firstChild(track, 'Ports');
  if (!ports) {
    if (file.endsWith('.xnl')) {
      errors.push({ file, severity: 'error', rule: 'track.ports.missing', message: '缺少 <Ports { scope = "track" }>' });
    }
    return;
  }
  if (ports.attrs.scope !== 'track') {
    errors.push({ file, severity: 'error', rule: 'track.ports.scope', message: `<Ports scope="${ports.attrs.scope}"> 必须是 track` });
  }
  for (const bundle of childrenByTag(ports, 'MaterialBundle')) {
    const role = bundle.attrs.role;
    const domain = bundle.attrs.domain;
    const bundlePath = bundle.attrs.path;
    if (!role || !MATERIAL_ROLES.has(role)) {
      errors.push({ file, severity: 'error', rule: 'track.ports.role', message: `<MaterialBundle> role="${role}" 非法（input|output）` });
    }
    if (!domain || !MATERIAL_DOMAINS.has(domain)) {
      errors.push({ file, severity: 'error', rule: 'track.ports.domain', message: `<MaterialBundle> domain="${domain}" 非法，Track 不接受 JSON 端口` });
    }
    if (!bundle.attrs.name) {
      errors.push({ file, severity: 'error', rule: 'track.ports.name', message: '<MaterialBundle> 缺少 name' });
    }
    if (!bundlePath || !bundlePath.startsWith('vfs://')) {
      errors.push({ file, severity: 'error', rule: 'track.ports.path', message: `<MaterialBundle> path 必须使用 vfs://（实际：${bundlePath ?? '缺失'}）` });
    }
  }
}

// --- track.xml --------------------------------------------------------------

function validateTrackXml(content: string, file: string, errors: ValidationError[], profiles: Set<string> | null): void {
  const root = parseTrack(content, file, errors);
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
  const rootStatus = status?.text?.trim();
  if (file.endsWith('.xnl')) {
    for (const field of ['Status', 'Goal', 'Description', 'CreatedAt', 'UpdatedAt']) {
      const value = firstChild(metadata, field)?.text?.trim();
      if (!value) errors.push({ file, severity: 'error', rule: `track.root.${field.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`).replace(/^-/, '')}`, message: `<Track> 缺少非空 ${field} 根属性` });
    }
  }
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
  const commitMode = firstChild(metadata, 'CommitMode');
  if (commitMode?.text && !COMMIT_MODE.has(commitMode.text.trim())) {
    errors.push({ file, severity: 'error', rule: 'track.root.commit-mode', message: `<Track> commit_mode="${commitMode.text.trim()}" 非法（auto|manual）` });
  }
  for (const field of ['CreatedAt', 'UpdatedAt']) {
    const value = firstChild(metadata, field)?.text?.trim();
    if (value && Number.isNaN(Date.parse(value))) {
      errors.push({ file, severity: 'error', rule: `track.root.${field === 'CreatedAt' ? 'created-at' : 'updated-at'}`, message: `<Track> ${field} 必须是 ISO 8601 时间` });
    }
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
      const priority = n.attrs.priority;
      if (priority !== undefined && !PRIORITY.has(priority)) {
        errors.push({ file, severity: 'error', rule: 'track.task.priority', message: `<${n.tag} id="${id}"> priority="${priority}" 非法（P0|P1|P2）` });
      }
      if (n.attrs.blocker !== undefined && !n.attrs.blocker.trim()) {
        errors.push({ file, severity: 'error', rule: 'track.task.blocker', message: `<${n.tag} id="${id}"> blocker 不得为空` });
      }
      if (n.attrs.commit !== undefined && !n.attrs.commit.trim()) {
        errors.push({ file, severity: 'error', rule: 'track.task.commit', message: `<${n.tag} id="${id}"> commit 不得为空` });
      }

      const ownedTag = n.tag === 'TaskGroup' ? 'Gate' : 'Acceptance';
      const ownedContainer = n.children.find((child) => hasTag(child, ownedTag));
      const uncheckedOwned = ownedContainer
        ? descendants(ownedContainer, (child) => hasTag(child, 'Criterion') && child.attrs.checked !== 'true')
        : [];
      if (s === 'DONE' && uncheckedOwned.length > 0) {
        errors.push({
          file,
          severity: rootStatus === 'completed' ? 'error' : 'warning',
          rule: 'track.lifecycle.done-criterion',
          message: `<${n.tag} id="${id}"> status="DONE" 但仍有未勾选 Criterion: ${uncheckedOwned.map((criterion) => criterion.attrs.id ?? 'Criterion').join(', ')}`,
        });
      }
    }


    if (rootStatus === 'completed') {
      const unfinished = descendants(taskSpace, (node) => (
        (node.tag === 'Task' || node.tag === 'TaskGroup')
        && !['DONE', 'ABANDONED'].includes(node.attrs.status ?? 'NOT_STARTED')
      ));
      if (unfinished.length > 0) {
        errors.push({
          file,
          severity: 'error',
          rule: 'track.lifecycle.completed-tasks',
          message: `completed Track 仍有未完成任务: ${unfinished.map((node) => `${node.attrs.id ?? node.tag}:${node.attrs.status ?? 'NOT_STARTED'}`).join(', ')}`,
        });
      }
      const unchecked = descendants(taskSpace, (node) => hasTag(node, 'Criterion') && node.attrs.checked !== 'true');
      if (unchecked.length > 0) {
        errors.push({
          file,
          severity: 'error',
          rule: 'track.lifecycle.completed-criteria',
          message: `completed Track 仍有未勾选 Criterion: ${unchecked.map((criterion) => criterion.attrs.id ?? 'Criterion').join(', ')}`,
        });
      }
    }
  }

  validatePorts(root, file, errors);
  validateSchedule(root, file, errors);
  validateHooks(root, file, errors, profiles);
}

// --- behavior_deltas/**.{xnl,xml} ------------------------------------------

function collectBehaviorPatchFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectBehaviorPatchFiles(full));
    else if (entry.isFile() && /\.(xnl|xml)$/i.test(entry.name)) out.push(full);
  }
  return out.sort();
}

function validateBehaviorDeltas(trackDir: string, errors: ValidationError[]): number {
  const files = collectBehaviorPatchFiles(path.join(trackDir, 'behavior_deltas'));
  for (const f of files) {
    let root: SpecXmlNode;
    try {
      root = parseBehaviorPatchContent(fs.readFileSync(f, 'utf-8'));
    } catch (error) {
      errors.push({ file: f, severity: 'error', message: `BehaviorPatch 格式错误：${error instanceof Error ? error.message : String(error)}` });
      continue;
    }
    if (f.endsWith('.xnl')) {
      const verification = verifyResource(f);
      for (const diagnostic of verification.diagnostics) {
        errors.push({ file: f, severity: 'error', message: `BehaviorPatch Kind 校验失败：${diagnostic}` });
      }
    }
    if (root.tag !== 'behavior-patch') {
      errors.push({ file: f, severity: 'error', message: `根节点必须是 <BehaviorPatch>（legacy XML 为 <behavior-patch>；实际：<${root.tag}>）` });
      continue;
    }
    const mutations = descendants(root, (n) => OP_TAGS.has(n.tag));
    if (mutations.length === 0) {
      errors.push({ file: f, severity: 'error', message: `<BehaviorPatch> 至少需要一个变更（<Upsert>|<Delete>|<Move>）` });
    }
    for (const m of mutations) {
      const sel = m.attrs['selector'];
      if (!sel || !sel.startsWith('behavior://')) {
        errors.push({ file: f, severity: 'error', message: `<${m.tag}> 的 selector 必须是 behavior:// （实际：${sel ?? '缺失'}）` });
      }
    }
    validateKnowledgeHints(root, f, errors);
  }
  return files.length;
}

function validateKnowledgeHints(root: SpecXmlNode, file: string, errors: ValidationError[]): void {
  for (const hint of descendants(root, (node) => node.tag === 'knowledge-hint')) {
    if (hint.attrs.target !== 'docs-profile') {
      errors.push({ file, severity: 'error', rule: 'behavior.knowledge-hint.target', message: '<KnowledgeHint> target 必须是 docs-profile' });
    }
    if (!hint.attrs.href?.startsWith('vfs://')) {
      errors.push({ file, severity: 'error', rule: 'behavior.knowledge-hint.href', message: '<KnowledgeHint> href 必须使用 vfs://' });
    }
    if (hint.attrs.strength !== undefined && hint.attrs.strength !== 'hint') {
      errors.push({ file, severity: 'error', rule: 'behavior.knowledge-hint.strength', message: '<KnowledgeHint> strength 只允许 hint' });
    }
  }
}

function behaviorRegistries(): Array<{ id: string; file: string }> {
  if (!fs.existsSync(BEHAVIORS_DIR)) return [];
  return fs.readdirSync(BEHAVIORS_DIR, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isFile() && /\.(xnl|xml)$/i.test(entry.name)) {
      return [{ id: path.basename(entry.name, path.extname(entry.name)), file: path.join(BEHAVIORS_DIR, entry.name) }];
    }
    if (entry.isDirectory()) {
      const index = path.join(BEHAVIORS_DIR, entry.name, 'index.xml');
      if (fs.existsSync(index)) return [{ id: entry.name, file: index }];
    }
    return [];
  });
}

function validateBehaviorRegistry(file: string): ValidationError[] {
  const errors: ValidationError[] = [];
  let root: SpecXmlNode;
  try {
    if (file.endsWith('.xnl')) {
      const verification = verifyResource(file);
      for (const diagnostic of verification.diagnostics) {
        errors.push({ file, severity: 'error', rule: 'behavior.kind', message: diagnostic });
      }
      root = parseBehaviorXnlContent(fs.readFileSync(file, 'utf8'));
    } else {
      root = parseSpecXmlContent(fs.readFileSync(file, 'utf8'));
    }
  } catch (error) {
    return [{ file, severity: 'error', rule: 'behavior.parse', message: error instanceof Error ? error.message : String(error) }];
  }
  if (root.tag !== 'behaviors') {
    errors.push({ file, severity: 'error', rule: 'behavior.root', message: 'Behavior registry 根必须是 <Behavior>' });
    return errors;
  }
  const requirements = childrenByTag(root, 'requirement');
  if (requirements.length === 0) {
    errors.push({ file, severity: 'error', rule: 'behavior.requirement.missing', message: 'Behavior registry 至少需要一个 Requirement' });
  }
  const seen = new Set<string>();
  for (const requirement of requirements) {
    const id = requirement.attrs.id;
    if (!id) errors.push({ file, severity: 'error', rule: 'behavior.requirement.id', message: '<Requirement> 缺少 id' });
    else if (seen.has(id)) errors.push({ file, severity: 'error', rule: 'behavior.requirement.duplicate-id', message: `Requirement id 重复：${id}` });
    else seen.add(id);
    if (!firstChild(requirement, 'statement')?.text?.trim()) {
      errors.push({ file, severity: 'error', rule: 'behavior.requirement.statement', message: `<Requirement id="${id}"> 缺少非空 Statement` });
    }
  }
  validateKnowledgeHints(root, file, errors);
  return errors;
}

/**
 * Validate canonical decisions plus the optional planning working forest so
 * malformed XNL is rejected during track/mission planning, not at archive.
 * The analysis forest is validated independently because it is working memory,
 * not an additional canonical decision source.
 */
function validateProcessDecisions(processDir: string, errors: ValidationError[]): void {
  const root = path.join(processDir, 'decisions.xnl');
  const dir = path.join(processDir, 'decisions');
  const workingForest = path.join(processDir, 'analysis', 'decision-tree.xnl');
  const targets = [root, dir, workingForest].filter((target) => fs.existsSync(target));
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
      .filter((entry) => entry.isDirectory() && (
        fs.existsSync(path.join(parent, entry.name, 'track.xnl'))
        || fs.existsSync(path.join(parent, entry.name, 'track.xml'))
      ))
      .map((entry) => ({ id: entry.name, dir: path.join(parent, entry.name) }));
  });
}

function missionDirectories(): Array<{ id: string; dir: string }> {
  return ['pending', 'active', 'archived'].flatMap((state) => {
    const parent = path.join('codument', 'missions', state);
    if (!fs.existsSync(parent)) return [];
    return fs.readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && (
        fs.existsSync(path.join(parent, entry.name, 'mission.xnl'))
        || fs.existsSync(path.join(parent, entry.name, 'mission.xml'))
      ))
      .map((entry) => ({ id: entry.name, dir: path.join(parent, entry.name) }));
  });
}

function printFinding(e: ValidationError, baseDir: string): void {
  const rule = e.rule ? ` (${e.rule})` : '';
  console.log(`    ${e.severity === 'error' ? '✗' : '⚠'} [${path.relative(baseDir, e.file)}]${rule} ${e.message}`);
}

function applyStrictMode(findings: ValidationError[], strict: boolean): void {
  if (!strict) return;
  for (const finding of findings) {
    if (finding.severity === 'warning') finding.severity = 'error';
  }
}

export async function validateCommand(args: string[]): Promise<void> {
  if (!codumentExists()) {
    console.error('Codument is not initialized. Run codument init first.');
    process.exit(1);
  }
  const json = args.includes('--json');
  const { positional, options } = parseOptions(args);
  const strict = options.strict === true;
  const target = positional[0];
  const tracks = trackDirectories();
  const missions = missionDirectories();
  const behaviors = behaviorRegistries();
  const trackTargets = !target || target === 'all'
    ? tracks
    : tracks.filter((track) => track.id === target);
  const missionTargets = !target || target === 'all'
    ? missions
    : (missions.some((m) => m.id === target) ? missions.filter((m) => m.id === target) : []);
  const behaviorTargets = !target || target === 'all'
    ? behaviors
    : behaviors.filter((behavior) => behavior.id === target);

  if (trackTargets.length === 0 && missionTargets.length === 0 && behaviorTargets.length === 0) {
    console.log('No tracks or missions to validate.');
    return;
  }

  const profiles = loadProfileNames();
  let hadError = false;
  const allFindings: ValidationError[] = [];

  for (const { id, dir: trackDir } of trackTargets) {
    const errors: ValidationError[] = [];
    let authority;
    try {
      authority = resolveTrackAuthority(trackDir);
    } catch (error) {
      console.log(`✗ ${id}: ${error instanceof Error ? error.message : String(error)}`);
      hadError = true;
      continue;
    }

    if (!authority) {
      console.log(`✗ ${id}: track.xnl 或 legacy track.xml 不存在`);
      hadError = true;
      continue;
    }
    if (authority.format === 'xnl') {
      const verification = verifyResource(authority.file);
      for (const diagnostic of verification.diagnostics) {
        errors.push({ file: authority.file, severity: 'error', rule: 'track.kind', message: diagnostic });
      }
      for (const required of ['proposal.md', 'design.md']) {
        const requiredFile = path.join(trackDir, required);
        if (!fs.existsSync(requiredFile)) {
          errors.push({ file: requiredFile, severity: 'error', rule: 'track.required-file', message: `Track Kind required file is missing: ${required}` });
        }
      }
    }
    validateTrackXml(fs.readFileSync(authority.file, 'utf-8'), authority.file, errors, profiles);
    const deltaCount = validateBehaviorDeltas(trackDir, errors);
    if (authority.format === 'xnl' && deltaCount === 0) {
      errors.push({
        file: path.join(trackDir, 'behavior_deltas'),
        severity: 'error',
        rule: 'track.behavior-delta.missing',
        message: '当前 Track 至少需要一个由 CLI scaffold 的 BehaviorPatch XNL',
      });
    }
    validateProcessDecisions(trackDir, errors);
    applyStrictMode(errors, strict);

    const errs = errors.filter((e) => e.severity === 'error');
    const warns = errors.filter((e) => e.severity === 'warning');
    if (errs.length === 0) {
      console.log(`✓ ${id}: ${authority.fileName} OK${deltaCount ? ` + ${deltaCount} behavior delta(s)` : ''}${warns.length ? ` (${warns.length} warning)` : ''}`);
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
    let authority;
    try {
      authority = resolveMissionAuthority(missionDir);
    } catch (error) {
      console.log(`✗ mission ${id}: ${error instanceof Error ? error.message : String(error)}`);
      hadError = true;
      continue;
    }
    if (!authority) {
      console.log(`✗ mission ${id}: mission.xnl 或 legacy mission.xml 不存在`);
      hadError = true;
      continue;
    }
    const errors: ValidationError[] = [];
    if (authority.format === 'xnl') {
      const verification = verifyResource(authority.file);
      for (const diagnostic of verification.diagnostics) {
        errors.push({ file: authority.file, severity: 'error', rule: 'mission.kind', message: diagnostic });
      }
      for (const required of ['proposal.md', 'design.md']) {
        const requiredFile = path.join(missionDir, required);
        if (!fs.existsSync(requiredFile)) {
          errors.push({ file: requiredFile, severity: 'error', rule: 'mission.required-file', message: `Mission Kind required file is missing: ${required}` });
        }
      }
    }
    try {
      errors.push(...validateMissionNode(parseMissionResource(authority.file), { currentXnl: authority.format === 'xnl' }).map((f) => ({
        file: authority.file,
        severity: f.severity,
        message: f.message,
        rule: f.rule,
      })));
    } catch (error) {
      errors.push({
        file: authority.file,
        severity: 'error',
        rule: 'mission.parse',
        message: `Mission 格式错误：${error instanceof Error ? error.message : String(error)}`,
      });
    }
    validateProcessDecisions(missionDir, errors);
    applyStrictMode(errors, strict);

    const errs = errors.filter((e) => e.severity === 'error');
    const warns = errors.filter((e) => e.severity === 'warning');
    if (errs.length === 0) {
      console.log(`✓ mission ${id}: ${authority.fileName} OK${warns.length ? ` (${warns.length} warning)` : ''}`);
    } else {
      hadError = true;
      console.log(`✗ mission ${id}: ${errs.length} error(s)`);
    }
    for (const e of errors) {
      printFinding(e, missionDir);
    }
    allFindings.push(...errors);
  }

  for (const { id, file } of behaviorTargets) {
    const errors = validateBehaviorRegistry(file);
    applyStrictMode(errors, strict);
    if (errors.some((finding) => finding.severity === 'error')) {
      hadError = true;
      console.log(`✗ behavior ${id}: ${errors.length} error(s)`);
    } else {
      console.log(`✓ behavior ${id}: ${path.basename(file)} OK`);
    }
    for (const finding of errors) printFinding(finding, path.dirname(file));
    allFindings.push(...errors);
  }

  if (json) {
    console.log(JSON.stringify(allFindings, null, 2));
  }

  if (hadError) process.exit(1);
}
