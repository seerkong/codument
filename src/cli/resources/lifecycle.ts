import * as fs from 'fs';
import * as path from 'path';
import {
  MakeWord,
  parseXnl,
  wordToString,
  type DataElementNode,
  type ElementNode,
  type TextElementNode,
  type XnlNode,
} from 'xnl-core';
import { serializeXnlFile } from '../xnl/registry';

export type ResourceKind = 'track' | 'mission';

const TRACK_STATES = new Set(['new', 'in_progress', 'completed', 'cancelled']);
const MISSION_STATES = new Set(['pending', 'active', 'completed', 'cancelled', 'superseded']);
const TRACK_TASK_STATES = new Set(['NOT_STARTED', 'ACTIVE', 'DELEGATED', 'FORWARDED', 'DONE', 'REFUSED', 'ABANDONED']);
const MISSION_TASK_STATES = new Set(['NOT_STARTED', 'ACTIVE', 'DONE', 'BLOCKED', 'ABANDONED', 'SUPERSEDED']);

interface LocatedResource {
  dir: string;
  stage: 'pending' | 'active' | 'archived';
  file: string;
}

export interface TransitionReceipt {
  kind: ResourceKind;
  id: string;
  from: string;
  to: string;
  directory: string;
}

export interface ReadyTrackTask {
  id: string;
  kind: 'Task' | 'TaskGroup';
  name?: string;
  status: string;
  parent?: string;
  criteria: { checked: number; total: number };
}

export function transitionResource(kind: ResourceKind, id: string, status: string): TransitionReceipt {
  const allowed = kind === 'track' ? TRACK_STATES : MISSION_STATES;
  if (!allowed.has(status)) throw new Error(`Invalid ${kind} status '${status}'.`);

  const located = locateTransitionResource(kind, id, status);
  const { root } = readRoot(located.file, kind === 'track' ? 'Track' : 'Mission');
  const from = scalar(root.attributes?.status) ?? located.stage;
  assertRootTransition(kind, from, status);
  if (status === 'completed') assertCompletionReady(kind, root);

  const targetStage = status === 'active' || (kind === 'track' && status === 'in_progress')
    ? 'active'
    : located.stage;
  const targetDir = targetStage === located.stage
    ? located.dir
    : path.join('codument', kind === 'track' ? 'tracks' : 'missions', targetStage, id);
  if (targetDir !== located.dir && fs.existsSync(targetDir)) {
    throw new Error(`${kind} transition target already exists: ${targetDir}`);
  }

  const now = new Date().toISOString();
  root.attributes = { ...(root.attributes ?? {}), status, updated_at: now };
  if (kind === 'mission') incrementRevision(root);

  let moved = false;
  try {
    if (targetDir !== located.dir) {
      fs.mkdirSync(path.dirname(targetDir), { recursive: true });
      fs.renameSync(located.dir, targetDir);
      moved = true;
    }
    writeRootAtomic(path.join(targetDir, path.basename(located.file)), root);
  } catch (error) {
    if (moved && !fs.existsSync(located.dir) && fs.existsSync(targetDir)) {
      fs.renameSync(targetDir, located.dir);
    }
    throw error;
  }

  return { kind, id, from, to: status, directory: targetDir };
}

export function transitionTask(kind: ResourceKind, id: string, taskId: string, status: string): TransitionReceipt {
  const allowed = kind === 'track' ? TRACK_TASK_STATES : MISSION_TASK_STATES;
  if (!allowed.has(status)) throw new Error(`Invalid ${kind} task status '${status}'.`);
  if (kind === 'track' && status === 'DONE') {
    throw new Error('Track tasks must use `codument track task complete <id> <task-id> -- <verification-command>` to enter DONE.');
  }
  const located = locateResource(kind, id);
  const { root } = readRoot(located.file, kind === 'track' ? 'Track' : 'Mission');
  const task = findById(root, taskId);
  if (!task || (task.tag !== 'Task' && task.tag !== 'TaskGroup')) {
    throw new Error(`${kind} '${id}' has no Task or TaskGroup '${taskId}'.`);
  }
  const from = scalar(task.attributes?.status) ?? 'NOT_STARTED';
  task.attributes = { ...(task.attributes ?? {}), status };
  root.attributes = { ...(root.attributes ?? {}), updated_at: new Date().toISOString() };
  if (kind === 'mission') incrementRevision(root);
  writeRootAtomic(located.file, root);
  return { kind, id: `${id}:${taskId}`, from, to: status, directory: located.dir };
}

export function completeTrackTask<T>(
  id: string,
  taskId: string,
  verify: () => T,
): TransitionReceipt & { verification: T } {
  const located = locateResource('track', id);
  const { root } = readRoot(located.file, 'Track');
  const task = findById(root, taskId);
  if (!task || (task.tag !== 'Task' && task.tag !== 'TaskGroup')) {
    throw new Error(`track '${id}' has no Task or TaskGroup '${taskId}'.`);
  }
  if (task.tag === 'TaskGroup') assertTaskGroupReady(task);
  const verification = verify();

  const from = scalar(task.attributes?.status) ?? 'NOT_STARTED';
  task.attributes = { ...(task.attributes ?? {}), status: 'DONE' };
  markOwnedCriteriaChecked(task);
  rollUpReadyTaskGroups(root);
  root.attributes = { ...(root.attributes ?? {}), updated_at: new Date().toISOString() };
  writeRootAtomic(located.file, root);
  return { kind: 'track', id: `${id}:${taskId}`, from, to: 'DONE', directory: located.dir, verification };
}

export function readyTrackTasks(id: string): { track: string; ready: ReadyTrackTask[] } {
  const located = locateResource('track', id);
  const { root } = readRoot(located.file, 'Track');
  const taskSpace = children(root).find((child) => child.tag === 'TaskSpace');
  if (!taskSpace) return { track: id, ready: [] };
  const dependencies = scheduleDependencies(root);
  return { track: id, ready: readyFromContainer(taskSpace, dependencies) };
}

export function setGapRound(kind: ResourceKind, id: string, round: number): TransitionReceipt {
  if (!Number.isSafeInteger(round) || round < 0) throw new Error('Gap round must be a non-negative integer.');
  const located = locateResource(kind, id);
  const { root } = readRoot(located.file, kind === 'track' ? 'Track' : 'Mission');
  const from = scalar(root.attributes?.gap_round) ?? '0';
  root.attributes = {
    ...(root.attributes ?? {}),
    gap_round: round,
    updated_at: new Date().toISOString(),
  };
  if (kind === 'mission') incrementRevision(root);
  writeRootAtomic(located.file, root);
  return { kind, id, from, to: String(round), directory: located.dir };
}

export function bindMissionTrack(missionId: string, taskId: string, trackId: string): TransitionReceipt {
  const mission = locateResource('mission', missionId);
  const track = locateAnyTrack(trackId);
  const { root } = readRoot(mission.file, 'Mission');
  const task = findById(root, taskId);
  if (!task || task.tag !== 'Task') throw new Error(`Mission '${missionId}' has no leaf Task '${taskId}'.`);
  const link = children(task).find((node) => node.tag === 'TrackLink');
  if (!link) throw new Error(`Mission task '${taskId}' has no TrackLink.`);
  const from = `${wordToString(link.id) ?? ''}:${scalar(link.attributes?.state) ?? 'candidate'}`;
  link.id = MakeWord(trackId);
  link.attributes = { ...(link.attributes ?? {}), state: 'bound' };
  task.attributes = { ...(task.attributes ?? {}), status: 'ACTIVE' };
  root.attributes = { ...(root.attributes ?? {}), updated_at: new Date().toISOString() };
  incrementRevision(root);

  const reportsDir = path.join(mission.dir, 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = nextReportPath(reportsDir, 'track-bind-cli');
  fs.writeFileSync(report, [
    '# Track Bind CLI Receipt', '',
    `- Mission task: \`${taskId}\``,
    `- Track: \`${trackId}\``,
    `- Track authority: \`${track.file}\``,
    '- State: `bound`',
    `- Bound at: \`${new Date().toISOString()}\``, '',
  ].join('\n'), 'utf8');
  try {
    writeRootAtomic(mission.file, root);
  } catch (error) {
    fs.rmSync(report, { force: true });
    throw error;
  }
  return { kind: 'mission', id: `${missionId}:${taskId}`, from, to: `${trackId}:bound`, directory: mission.dir };
}

export function markMissionArchived(file: string): void {
  const { root } = readRoot(file, 'Mission');
  root.attributes = { ...(root.attributes ?? {}), status: 'archived', updated_at: new Date().toISOString() };
  incrementRevision(root);
  writeRootAtomic(file, root);
}

function locateResource(kind: ResourceKind, id: string): LocatedResource {
  const plural = kind === 'track' ? 'tracks' : 'missions';
  const authority = kind === 'track' ? 'track.xnl' : 'mission.xnl';
  for (const stage of ['active', 'pending'] as const) {
    const dir = path.join('codument', plural, stage, id);
    const file = path.join(dir, authority);
    if (fs.existsSync(file)) return { dir, stage, file };
  }
  throw new Error(`${kind} '${id}' was not found in pending or active lifecycle directories.`);
}

function locateTransitionResource(kind: ResourceKind, id: string, status: string): LocatedResource {
  try {
    return locateResource(kind, id);
  } catch (error) {
    const reopensActive = status === 'active' || (kind === 'track' && status === 'in_progress');
    if (!reopensActive) throw error;
    const archived = locateArchivedResource(kind, id);
    if (archived) return archived;
    throw error;
  }
}

function locateArchivedResource(kind: ResourceKind, id: string): LocatedResource | undefined {
  const plural = kind === 'track' ? 'tracks' : 'missions';
  const authority = kind === 'track' ? 'track.xnl' : 'mission.xnl';
  const expectedTag = kind === 'track' ? 'Track' : 'Mission';
  const root = path.join('codument', plural, 'archived');
  const candidates: LocatedResource[] = [];

  const visit = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const candidate = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(candidate);
        continue;
      }
      if (!entry.isFile() || entry.name !== authority) continue;
      const { root: resource } = readRoot(candidate, expectedTag);
      if (wordToString(resource.id) === id) {
        candidates.push({ dir: path.dirname(candidate), stage: 'archived', file: candidate });
      }
    }
  };
  visit(root);

  if (candidates.length > 1) {
    throw new Error(`${kind} '${id}' has multiple archived authorities: ${candidates.map((candidate) => candidate.dir).join(', ')}`);
  }
  return candidates[0];
}

function locateAnyTrack(id: string): { file: string } {
  try {
    return { file: locateResource('track', id).file };
  } catch {
    const archived = locateArchivedResource('track', id);
    if (archived) return { file: archived.file };
    throw new Error(`Track '${id}' has no active, pending or archived authority.`);
  }
}

function readRoot(file: string, expectedTag: string): { root: DataElementNode } {
  const parsed = parseXnl(fs.readFileSync(file, 'utf8'), { textBlockStyle: true });
  if (parsed.warnings?.length) throw new Error(parsed.warnings.map((warning) => warning.message).join('; '));
  const root = parsed.nodes[0];
  if (parsed.nodes.length !== 1 || !isDataElement(root) || root.tag !== expectedTag) {
    throw new Error(`${file} must contain exactly one <${expectedTag}> root.`);
  }
  return { root };
}

function writeRootAtomic(file: string, root: DataElementNode): void {
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, serializeXnlFile([root]), 'utf8');
  try {
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

function assertRootTransition(kind: ResourceKind, from: string, to: string): void {
  if (from === to) return;
  const allowed = kind === 'track'
    ? new Map([
      ['new', new Set(['in_progress', 'cancelled'])],
      ['in_progress', new Set(['completed', 'cancelled'])],
      ['completed', new Set(['in_progress'])],
      ['cancelled', new Set(['in_progress'])],
    ])
    : new Map([
      ['pending', new Set(['active', 'cancelled', 'superseded'])],
      ['active', new Set(['completed', 'cancelled', 'superseded'])],
      ['completed', new Set(['active'])],
      ['cancelled', new Set(['active'])],
      ['superseded', new Set(['active'])],
      ['archived', new Set(['active'])],
    ]);
  if (!allowed.get(from)?.has(to)) throw new Error(`Invalid ${kind} transition '${from}' -> '${to}'.`);
}

function assertCompletionReady(kind: ResourceKind, root: DataElementNode): void {
  const terminal = kind === 'track'
    ? new Set(['DONE', 'ABANDONED'])
    : new Set(['DONE', 'ABANDONED', 'SUPERSEDED']);
  const unfinished: string[] = [];
  const visit = (node: DataElementNode): void => {
    if (node.tag === 'Task' || node.tag === 'TaskGroup') {
      const status = scalar(node.attributes?.status) ?? 'NOT_STARTED';
      if (!terminal.has(status)) unfinished.push(`${wordToString(node.id) ?? node.tag}:${status}`);
    }
    for (const child of children(node)) visit(child);
  };
  visit(root);
  if (unfinished.length > 0) {
    throw new Error(`${kind} completion gate has unfinished tasks: ${unfinished.join(', ')}`);
  }
  if (kind === 'track') {
    const unchecked = collectCriteria(root).filter((criterion) => scalar(criterion.attributes?.checked) !== 'true');
    if (unchecked.length > 0) {
      throw new Error(`track completion gate has unchecked criteria: ${unchecked.map(elementLabel).join(', ')}`);
    }
  }
}

function assertTaskGroupReady(group: DataElementNode): void {
  const unfinished = taskChildren(group).filter((child) => !TRACK_COMPLETED_TASK_STATES.has(taskStatus(child)));
  if (unfinished.length > 0) {
    throw new Error(`TaskGroup '${elementLabel(group)}' has unfinished children: ${unfinished.map((child) => `${elementLabel(child)}:${taskStatus(child)}`).join(', ')}`);
  }
}

const TRACK_COMPLETED_TASK_STATES = new Set(['DONE', 'ABANDONED']);

function markOwnedCriteriaChecked(task: DataElementNode): void {
  for (const child of elementChildren(task)) {
    if (!isDataElement(child) || (child.tag !== 'Acceptance' && child.tag !== 'Gate')) continue;
    for (const criterion of collectCriteria(child)) {
      criterion.attributes = { ...(criterion.attributes ?? {}), checked: true };
    }
  }
}

function rollUpReadyTaskGroups(root: DataElementNode): void {
  const visit = (node: DataElementNode): void => {
    for (const child of children(node)) visit(child);
    if (node.tag !== 'TaskGroup' || taskStatus(node) === 'DONE') return;
    const directTasks = taskChildren(node);
    if (directTasks.length === 0 || directTasks.some((child) => !TRACK_COMPLETED_TASK_STATES.has(taskStatus(child)))) return;
    const uncheckedOwned = ownedCriteria(node).some((criterion) => scalar(criterion.attributes?.checked) !== 'true');
    if (!uncheckedOwned) node.attributes = { ...(node.attributes ?? {}), status: 'DONE' };
  };
  visit(root);
}

function readyFromContainer(
  container: DataElementNode,
  dependencies: Map<string, Map<string, string[]>>,
): ReadyTrackTask[] {
  const direct = taskChildren(container);
  if (direct.length === 0) return [];
  const byId = new Map(direct.map((child) => [elementLabel(child), child]));
  const ownerId = elementLabel(container);
  const childMode = scalar(container.attributes?.child_mode) ?? 'sequential';
  const eligible = childMode === 'dag'
    ? direct.filter((child) => (dependencies.get(ownerId)?.get(elementLabel(child)) ?? [])
      .every((predecessor) => {
        const dependency = byId.get(predecessor);
        return dependency ? TRACK_COMPLETED_TASK_STATES.has(taskStatus(dependency)) : false;
      }))
    : direct.slice(0, Math.max(0, direct.findIndex((child) => !TRACK_COMPLETED_TASK_STATES.has(taskStatus(child))) + 1))
      .filter((child) => !TRACK_COMPLETED_TASK_STATES.has(taskStatus(child)));

  return eligible.flatMap((child) => {
    const status = taskStatus(child);
    if (TRACK_COMPLETED_TASK_STATES.has(status) || ['REFUSED', 'DELEGATED', 'FORWARDED'].includes(status)) return [];
    if (child.tag === 'TaskGroup') {
      const nested = taskChildren(child);
      if (nested.length > 0 && nested.every((task) => TRACK_COMPLETED_TASK_STATES.has(taskStatus(task)))) {
        return [readySummary(child, container)];
      }
      return readyFromContainer(child, dependencies);
    }
    return [readySummary(child, container)];
  });
}

function readySummary(node: DataElementNode, parent: DataElementNode): ReadyTrackTask {
  const criteria = ownedCriteria(node);
  return {
    id: elementLabel(node),
    kind: node.tag as 'Task' | 'TaskGroup',
    ...(scalar(node.attributes?.name) ? { name: scalar(node.attributes?.name) } : {}),
    status: taskStatus(node),
    parent: elementLabel(parent),
    criteria: {
      checked: criteria.filter((criterion) => scalar(criterion.attributes?.checked) === 'true').length,
      total: criteria.length,
    },
  };
}

function scheduleDependencies(root: DataElementNode): Map<string, Map<string, string[]>> {
  const result = new Map<string, Map<string, string[]>>();
  const visit = (node: DataElementNode): void => {
    if (node.tag === 'Dag') {
      const owner = scalar(node.attributes?.for);
      if (owner) {
        const nodes = new Map<string, string[]>();
        for (const child of children(node).filter((candidate) => candidate.tag === 'Node')) {
          nodes.set(elementLabel(child), children(child)
            .filter((candidate) => candidate.tag === 'After')
            .map((after) => scalar(after.attributes?.ref))
            .filter((ref): ref is string => Boolean(ref)));
        }
        result.set(owner, nodes);
      }
    }
    for (const child of children(node)) visit(child);
  };
  visit(root);
  return result;
}

function ownedCriteria(node: DataElementNode): ElementNode[] {
  return elementChildren(node).flatMap((child) => {
    if (!isDataElement(child) || (child.tag !== 'Acceptance' && child.tag !== 'Gate')) return [];
    return collectCriteria(child);
  });
}

function collectCriteria(root: DataElementNode): ElementNode[] {
  const out: ElementNode[] = [];
  const visit = (node: ElementNode): void => {
    if (node.tag === 'Criterion') out.push(node);
    if (isDataElement(node)) for (const child of elementChildren(node)) visit(child);
  };
  visit(root);
  return out;
}

function taskChildren(node: DataElementNode): DataElementNode[] {
  const direct = children(node);
  const subNodes = direct.find((child) => child.tag === 'SubNodes');
  const candidates = subNodes ? children(subNodes) : direct;
  return candidates.filter((child) => child.tag === 'Task' || child.tag === 'TaskGroup');
}

function taskStatus(node: DataElementNode): string {
  return scalar(node.attributes?.status) ?? 'NOT_STARTED';
}

function elementLabel(node: ElementNode): string {
  return wordToString(node.id) ?? node.tag;
}

function incrementRevision(root: DataElementNode): void {
  const current = Number(scalar(root.attributes?.revision) ?? '0');
  root.attributes = { ...(root.attributes ?? {}), revision: Number.isFinite(current) ? current + 1 : 1 };
}

function findById(root: DataElementNode, id: string): DataElementNode | undefined {
  if (wordToString(root.id) === id) return root;
  for (const child of children(root)) {
    const found = findById(child, id);
    if (found) return found;
  }
  return undefined;
}

function children(node: DataElementNode): DataElementNode[] {
  return elementChildren(node).filter(isDataElement);
}

function elementChildren(node: DataElementNode): ElementNode[] {
  const out: ElementNode[] = [];
  for (const key of node.extend?.order ?? []) {
    const child = node.extend?.children[key];
    if (isElement(child)) out.push(child);
  }
  for (const child of node.body ?? []) if (isElement(child)) out.push(child);
  return out;
}

function nextReportPath(dir: string, prefix: string): string {
  let index = 1;
  while (fs.existsSync(path.join(dir, `${prefix}-${String(index).padStart(3, '0')}.md`))) index += 1;
  return path.join(dir, `${prefix}-${String(index).padStart(3, '0')}.md`);
}

function scalar(value: XnlNode | undefined): string | undefined {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : undefined;
}

function isDataElement(value: XnlNode | undefined): value is DataElementNode {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && 'kind' in value
    && (value as DataElementNode | TextElementNode).kind === 'DataElement');
}

function isElement(value: XnlNode | undefined): value is ElementNode {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && 'kind' in value
    && ((value as ElementNode).kind === 'DataElement' || (value as ElementNode).kind === 'TextElement'));
}
