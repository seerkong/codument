import { parseSpecXmlContent, type SpecXmlNode } from '../utils/spec-xml';

export interface MissionValidationFinding {
  severity: 'error' | 'warning';
  message: string;
  /** Stable rule id for machine-readable findings (see T1.5 unified output). */
  rule?: string;
}

const ACTOR_ROLES = new Set([
  'MissionPlanner',
  'MissionObserver',
  'MissionReconciler',
  'MissionApplier',
]);

/** Metadata.Status vocabulary (mission-xml-spec §5). */
const MISSION_STATUS = new Set(['pending', 'active', 'completed', 'cancelled', 'superseded', 'archived']);
const QUESTION_MODE = new Set(['decision-tree']);
const QUESTION_SEVERITY = new Set(['auto', 'light', 'normal', 'deep']);
/** TaskGroup/Task status vocabulary (mission-xml-spec §6, mission-specific). */
const MISSION_NODE_STATUS = new Set([
  'NOT_STARTED', 'ACTIVE', 'DONE', 'BLOCKED', 'ABANDONED', 'SUPERSED',
]);
/** Hook on values: track points plus the mission-specific mission:after-node (mission-xml-spec §3/§8.1). */
const MISSION_HOOK_POINTS = new Set([
  'track:before', 'track:after',
  'phase:before', 'phase:after',
  'task:before', 'task:after',
  'mission:after-node',
]);
const RECONCILE_ON_LIMIT = new Set(['checkpoint', 'continue', 'block']);
const RECONCILE_ON_DRIFT = new Set(['replan-or-block', 'replan', 'block']);
const MISSION_CHILD_MODE = new Set(['sequential', 'dag']);

function childrenByTag(node: SpecXmlNode, tag: string): SpecXmlNode[] {
  return node.children.filter((child) => child.tag === tag);
}

function firstChild(node: SpecXmlNode, tag: string): SpecXmlNode | undefined {
  return node.children.find((child) => child.tag === tag);
}

function descendants(node: SpecXmlNode, predicate: (child: SpecXmlNode) => boolean): SpecXmlNode[] {
  const result: SpecXmlNode[] = [];
  for (const child of node.children) {
    if (predicate(child)) result.push(child);
    result.push(...descendants(child, predicate));
  }
  return result;
}

function persistedPathAttributes(node: SpecXmlNode): string[] {
  return Object.keys(node.attrs).filter((name) => {
    if (/^(?:workspace(?:-|_)?path|workspace)$/i.test(name)) return true;
    // Mission Ports use virtual material addresses such as vfs://./reports/.
    // Logical mission references must never cache a filesystem location.
    return /^(path|archive-path)$/i.test(name) && node.tag !== 'MaterialBundle';
  });
}

function validateMissionMetadata(root: SpecXmlNode, findings: MissionValidationFinding[], currentXnl: boolean): void {
  const metadata = firstChild(root, 'Metadata') ?? root;
  const status = firstChild(metadata, 'Status');
  if (currentXnl) {
    for (const field of ['Status', 'Goal', 'Description', 'CreatedAt', 'UpdatedAt']) {
      const value = firstChild(metadata, field)?.text?.trim();
      if (!value) {
        findings.push({
          severity: 'error',
          rule: `mission.root.${field.replace(/([A-Z])/g, (match) => `-${match.toLowerCase()}`).replace(/^-/, '')}`,
          message: `<Mission> 缺少非空 ${field} 根属性`,
        });
      }
    }
  }
  if (status && status.text && !MISSION_STATUS.has(status.text.trim())) {
    findings.push({
      severity: 'error',
      rule: 'mission.metadata.status',
      message: `<Mission> status="${status.text.trim()}" 非法（pending|active|completed|cancelled|superseded|archived）`,
    });
  }
  const questionMode = firstChild(metadata, 'QuestionMode')?.text?.trim();
  if (questionMode && !QUESTION_MODE.has(questionMode)) {
    findings.push({ severity: 'error', rule: 'mission.root.question-mode', message: `<Mission> question_mode="${questionMode}" 非法（decision-tree）` });
  }
  const questionSeverity = firstChild(metadata, 'QuestionSeverity')?.text?.trim();
  if (questionSeverity && !QUESTION_SEVERITY.has(questionSeverity)) {
    findings.push({ severity: 'error', rule: 'mission.root.question-severity', message: `<Mission> question_severity="${questionSeverity}" 非法（auto|light|normal|deep）` });
  }
  for (const field of ['CreatedAt', 'UpdatedAt']) {
    const value = firstChild(metadata, field)?.text?.trim();
    if (value && Number.isNaN(Date.parse(value))) {
      findings.push({
        severity: 'error',
        rule: `mission.root.${field === 'CreatedAt' ? 'created-at' : 'updated-at'}`,
        message: `<Mission> ${field} 必须是 ISO 8601 时间`,
      });
    }
  }
}

function validateMissionTaskSpace(root: SpecXmlNode, findings: MissionValidationFinding[]): void {
  const taskSpace = firstChild(root, 'TaskSpace');
  if (!taskSpace) {
    findings.push({ severity: 'error', rule: 'mission.taskspace.missing', message: '缺少 <TaskSpace>' });
    return;
  }
  const firstLevel = firstChild(taskSpace, 'SubNodes') ?? taskSpace;
  if (childrenByTag(firstLevel, 'TaskGroup').length === 0) {
    findings.push({
      severity: 'error',
      rule: 'mission.taskspace.phase-missing',
      message: '<TaskSpace> 第一层至少需要一个 <TaskGroup>',
    });
  }
  const seen = new Set<string>();
  for (const n of descendants(taskSpace, (x) => x.tag === 'TaskGroup' || x.tag === 'Task')) {
    const id = n.attrs['id'];
    if (!id) {
      findings.push({ severity: 'error', rule: 'mission.taskspace.id', message: `<${n.tag}> 缺少 id 属性` });
      continue;
    }
    if (seen.has(id)) {
      findings.push({ severity: 'error', rule: 'mission.taskspace.duplicate-id', message: `节点 id 重复：${id}` });
    }
    seen.add(id);

    const s = n.attrs['status'];
    if (s && !MISSION_NODE_STATUS.has(s)) {
      findings.push({
        severity: 'error',
        rule: 'mission.taskspace.status',
        message: `<${n.tag} id="${id}"> status="${s}" 非法（NOT_STARTED|ACTIVE|DONE|BLOCKED|ABANDONED|SUPERSED）`,
      });
    }
    const cm = n.attrs['cdt:child-mode'];
    if (cm && !MISSION_CHILD_MODE.has(cm)) {
      findings.push({
        severity: 'error',
        rule: 'mission.taskspace.child-mode',
        message: `<${n.tag} id="${id}"> cdt:child-mode="${cm}" 非法（sequential|dag）`,
      });
    }
    // cdt:TrackLink is a leaf-Task-only binding pointer (mission-xml-spec §6.1).
    if (n.tag === 'TaskGroup' && childrenByTag(n, 'cdt:TrackLink').length > 0) {
      findings.push({
        severity: 'error',
        rule: 'mission.tracklink.group',
        message: `<TaskGroup id="${id}"> 不允许挂 <cdt:TrackLink>（只允许挂在叶子 <Task> 上）`,
      });
    }
  }
}

function validateMissionSchedule(root: SpecXmlNode, findings: MissionValidationFinding[]): void {
  const schedule = firstChild(root, 'Schedule');
  if (!schedule) return;
  const byId = new Map<string, SpecXmlNode>();
  const taskSpace = firstChild(root, 'TaskSpace');
  if (taskSpace) {
    for (const n of [taskSpace, ...descendants(taskSpace, (x) => x.tag === 'TaskGroup' || x.tag === 'Task')]) {
      if (n.attrs['id']) byId.set(n.attrs['id'], n);
    }
  }
  const directChildIds = (n: SpecXmlNode): Set<string> => {
    const sub = firstChild(n, 'SubNodes') ?? n;
    return new Set(
      sub.children
        .filter((c) => c.tag === 'TaskGroup' || c.tag === 'Task')
        .map((c) => c.attrs['id'])
        .filter((v): v is string => Boolean(v)),
    );
  };

  for (const dag of childrenByTag(schedule, 'Dag')) {
    const forId = dag.attrs['for'];
    const owner = forId ? byId.get(forId) : undefined;
    if (!owner) {
      findings.push({
        severity: 'error',
        rule: 'mission.schedule.dag-target',
        message: `<Schedule><Dag for="${forId}"> 引用了不存在的节点`,
      });
      continue;
    }
    if (owner.attrs['cdt:child-mode'] !== 'dag') {
      findings.push({
        severity: 'error',
        rule: 'mission.schedule.dag-mode',
        message: `<Dag for="${forId}"> 的目标节点未声明 cdt:child-mode="dag"`,
      });
    }
    const layer = directChildIds(owner);
    const nodes = childrenByTag(dag, 'Node');
    const ids = nodes.map((n) => n.attrs['id']).filter((v): v is string => Boolean(v));
    const preds = new Map<string, string[]>();

    for (const node of nodes) {
      const nid = node.attrs['id'];
      if (!nid || !layer.has(nid)) {
        findings.push({
          severity: 'error',
          rule: 'mission.schedule.node-layer',
          message: `<Dag for="${forId}"><Node id="${nid}"> 不是该层的直接下层`,
        });
        continue;
      }
      const afters = childrenByTag(node, 'After').map((a) => a.attrs['ref']).filter((v): v is string => Boolean(v));
      for (const ref of afters) {
        if (!layer.has(ref)) {
          findings.push({
            severity: 'error',
            rule: 'mission.schedule.after-layer',
            message: `<Node id="${nid}"><After ref="${ref}"> 不是该层的直接下层`,
          });
        }
      }
      preds.set(nid, afters);
    }

    // Kahn cycle detection.
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
      findings.push({
        severity: 'error',
        rule: 'mission.schedule.cycle',
        message: `<Dag for="${forId}"> 存在环（依赖不可拓扑排序）`,
      });
    }
  }
}

function validateMissionHooks(root: SpecXmlNode, findings: MissionValidationFinding[]): void {
  for (const hook of descendants(root, (n) => n.tag === 'Hook')) {
    const on = hook.attrs['on'];
    if (!on || !MISSION_HOOK_POINTS.has(on)) {
      findings.push({
        severity: 'error',
        rule: 'mission.hook.on',
        message: `<Hook on="${on}"> 取值非法（track:before|after、phase:before|after、task:before|after、mission:after-node）`,
      });
    }
  }
  for (const rec of descendants(root, (n) => n.tag === 'cdt:MissionReconcile')) {
    const maxTracks = rec.attrs['max-tracks'];
    if (maxTracks !== undefined && (!/^\d+$/.test(maxTracks) || Number(maxTracks) < 1)) {
      findings.push({
        severity: 'error',
        rule: 'mission.reconcile.max-tracks',
        message: `<cdt:MissionReconcile max-tracks="${maxTracks}"> 必须是正整数`,
      });
    }
    const onLimit = rec.attrs['on-limit'];
    if (onLimit !== undefined && !RECONCILE_ON_LIMIT.has(onLimit)) {
      findings.push({
        severity: 'error',
        rule: 'mission.reconcile.on-limit',
        message: `<cdt:MissionReconcile on-limit="${onLimit}"> 非法（checkpoint|continue|block）`,
      });
    }
    const onDrift = rec.attrs['on-drift'];
    if (onDrift !== undefined && !RECONCILE_ON_DRIFT.has(onDrift)) {
      findings.push({
        severity: 'error',
        rule: 'mission.reconcile.on-drift',
        message: `<cdt:MissionReconcile on-drift="${onDrift}"> 非法（replan-or-block|replan|block）`,
      });
    }
  }
}

/**
 * Validates the ActorSet/ProjectRef extension independently from Track XML.
 * Older missions remain readable: absence of the new extension is a warning
 * until a plan/revise operation materializes the default structure.
 */
export function validateMissionXml(content: string): MissionValidationFinding[] {
  let root: SpecXmlNode;
  try {
    root = parseSpecXmlContent(content);
  } catch (error) {
    return [{
      severity: 'error',
      message: `Mission XML syntax error: ${error instanceof Error ? error.message : String(error)}`,
    }];
  }
  return validateMissionNode(root);
}

export function validateMissionNode(root: SpecXmlNode, options: { currentXnl?: boolean } = {}): MissionValidationFinding[] {
  const findings: MissionValidationFinding[] = [];

  if (root.tag !== 'Mission') {
    return [{ severity: 'error', message: `Mission root must be <Mission>, received <${root.tag}>` }];
  }
  if (!root.attrs.id) findings.push({ severity: 'error', message: '<Mission> requires an id attribute' });
  if (root.attrs['xmlns:cdt'] === undefined) {
    findings.push({ severity: 'error', message: '<Mission> requires the cdt namespace declaration' });
  }

  // Structural validation runs for every mission, including legacy ones, so the
  // state/schedule/hook rules are never silently skipped by the early return below.
  validateMissionMetadata(root, findings, options.currentXnl === true);
  validateMissionTaskSpace(root, findings);
  validateMissionSchedule(root, findings);
  validateMissionHooks(root, findings);

  for (const node of [root, ...descendants(root, () => true)]) {
    for (const name of persistedPathAttributes(node)) {
      findings.push({
        severity: 'error',
        message: `<${node.tag}> must not persist ${name}; WorkspaceBinding is session runtime data`,
      });
    }
    if (node.tag === 'cdt:WorkspaceBinding') {
      findings.push({
        severity: 'error',
        message: 'WorkspaceBinding must not be persisted in mission.xml',
      });
    }
  }

  const projectRefs = firstChild(root, 'cdt:ProjectRefs');
  const actorSets = firstChild(root, 'cdt:ActorSets');
  if (!projectRefs && !actorSets) {
    findings.push({
      severity: 'warning',
      message: 'legacy mission has no ProjectRefs or ActorSets; materialize the default structure on plan/revise',
    });
    return findings;
  }
  if (!projectRefs) {
    findings.push({ severity: 'error', message: 'ActorSets require <cdt:ProjectRefs>' });
    return findings;
  }
  if (!actorSets) {
    findings.push({ severity: 'error', message: 'ProjectRefs require <cdt:ActorSets>' });
    return findings;
  }

  const projectIds = new Set<string>();
  let hostCount = 0;
  for (const projectRef of childrenByTag(projectRefs, 'cdt:ProjectRef')) {
    const id = projectRef.attrs.id;
    if (!id) {
      findings.push({ severity: 'error', message: '<cdt:ProjectRef> requires id' });
      continue;
    }
    if (projectIds.has(id)) {
      findings.push({ severity: 'error', message: `ProjectRef id is duplicated: ${id}` });
    }
    projectIds.add(id);
    if (projectRef.attrs.kind !== 'host' && projectRef.attrs.kind !== 'external') {
      findings.push({
        severity: 'error',
        message: `ProjectRef ${id} requires kind="host" or kind="external"`,
      });
    }
    if (projectRef.attrs.kind === 'host') hostCount++;
  }
  if (projectIds.size === 0) findings.push({ severity: 'error', message: 'Mission requires at least one ProjectRef' });
  if (hostCount !== 1) findings.push({ severity: 'error', message: 'Mission requires exactly one host ProjectRef' });

  const sets = childrenByTag(actorSets, 'cdt:ActorSet');
  const setsById = new Set<string>();
  for (const set of sets) {
    const id = set.attrs.id;
    if (!id) {
      findings.push({ severity: 'error', message: '<cdt:ActorSet> requires id' });
      continue;
    }
    if (setsById.has(id)) findings.push({ severity: 'error', message: `ActorSet id is duplicated: ${id}` });
    setsById.add(id);

    const roleCounts = new Map<string, number>();
    for (const actor of childrenByTag(set, 'cdt:Actor')) {
      const role = actor.attrs.role;
      if (!role || !ACTOR_ROLES.has(role)) {
        findings.push({ severity: 'error', message: `ActorSet ${id} has unknown actor role: ${role ?? 'missing'}` });
        continue;
      }
      roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
      const projectRef = actor.attrs['project-ref'];
      if (!projectRef || !projectIds.has(projectRef)) {
        findings.push({ severity: 'error', message: `ActorSet ${id} actor ${role} references unknown ProjectRef: ${projectRef ?? 'missing'}` });
      }
      const work = firstChild(actor, 'Description')?.text?.trim();
      if (!work) {
        findings.push({
          severity: 'error',
          message: `ActorSet ${id} actor ${role} requires a mission-specific <Description>`,
        });
      }
    }
    for (const role of ACTOR_ROLES) {
      const count = roleCounts.get(role) ?? 0;
      if (count !== 1) {
        findings.push({ severity: 'error', message: `ActorSet ${id} must contain ${role} exactly once (received ${count})` });
      }
    }
  }

  const defaultActorSet = actorSets.attrs.default;
  if (!defaultActorSet || !setsById.has(defaultActorSet)) {
    findings.push({ severity: 'error', message: `ActorSets default references unknown ActorSet: ${defaultActorSet ?? 'missing'}` });
  }

  for (const group of descendants(root, (node) => node.tag === 'TaskGroup')) {
    const override = group.attrs['cdt:actor-set'];
    if (override && !setsById.has(override)) {
      findings.push({ severity: 'error', message: `TaskGroup ${group.attrs.id ?? 'missing'} actor-set references unknown ActorSet: ${override}` });
    }
  }
  for (const link of descendants(root, (node) => node.tag === 'cdt:TrackLink')) {
    const projectRef = link.attrs['project-ref'];
    if (!projectRef || !projectIds.has(projectRef)) {
      findings.push({ severity: 'error', message: `TrackLink ${link.attrs.id ?? 'missing'} references unknown ProjectRef: ${projectRef ?? 'missing'}` });
    }
  }

  return findings;
}
