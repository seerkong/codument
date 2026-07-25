import { parseSpecXmlContent, type SpecXmlNode } from '../utils/spec-xml';

export interface MissionValidationFinding {
  severity: 'error' | 'warning';
  message: string;
}

const ACTOR_ROLES = new Set([
  'MissionPlanner',
  'MissionObserver',
  'MissionReconciler',
  'MissionApplier',
]);

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

/**
 * Validates the ActorSet/ProjectRef extension independently from Track XML.
 * Older missions remain readable: absence of the new extension is a warning
 * until a plan/revise action materializes the default structure.
 */
export function validateMissionXml(content: string): MissionValidationFinding[] {
  const findings: MissionValidationFinding[] = [];
  let root: SpecXmlNode;
  try {
    root = parseSpecXmlContent(content);
  } catch (error) {
    return [{
      severity: 'error',
      message: `Mission XML syntax error: ${error instanceof Error ? error.message : String(error)}`,
    }];
  }

  if (root.tag !== 'Mission') {
    return [{ severity: 'error', message: `Mission root must be <Mission>, received <${root.tag}>` }];
  }
  if (!root.attrs.id) findings.push({ severity: 'error', message: '<Mission> requires an id attribute' });
  if (root.attrs['xmlns:cdt'] === undefined) {
    findings.push({ severity: 'error', message: '<Mission> requires the cdt namespace declaration' });
  }

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
