import * as fs from 'fs';
import * as path from 'path';
import { parseMissionResource, resolveMissionAuthority } from './resource';
import { resolveWorkspaceBinding } from '../project/bindings';
import type { SpecXmlNode } from '../utils/spec-xml';

export type NestedMissionProjection = 'UNBOUND' | 'MISSING' | 'BOUND' | 'DRIFTED';

export interface ChildMissionReference {
  projectRef: string;
  missionRef: string;
  linkRef?: string;
}

export interface SelectedTaskProjection {
  ref: string;
  status: string | undefined;
  exists: boolean;
  leaf: boolean;
}

export interface ChildMissionObservation {
  state: NestedMissionProjection;
  directory?: string;
  authority?: string;
  selectedTasks: SelectedTaskProjection[];
}

function children(node: SpecXmlNode, tag: string): SpecXmlNode[] {
  return node.children.filter((child) => child.tag === tag || child.tag === `cdt:${tag}`);
}

function attr(node: SpecXmlNode, ...names: string[]): string | undefined {
  for (const name of names) {
    if (node.attrs[name] !== undefined) return node.attrs[name];
  }
  return undefined;
}

function descendants(node: SpecXmlNode, predicate: (node: SpecXmlNode) => boolean): SpecXmlNode[] {
  const result: SpecXmlNode[] = [];
  for (const child of node.children) {
    if (predicate(child)) result.push(child);
    result.push(...descendants(child, predicate));
  }
  return result;
}

function missionDirectories(workspace: string): string[] {
  const result: string[] = [];
  for (const stage of ['pending', 'active']) {
    const root = path.join(workspace, 'codument', 'missions', stage);
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory()) result.push(path.join(root, entry.name));
    }
  }
  return result;
}

export function findChildMission(reference: ChildMissionReference, bindingsFile?: string): ChildMissionObservation {
  const workspace = resolveWorkspaceBinding(reference.projectRef, bindingsFile);
  if (!workspace) return { state: 'UNBOUND', selectedTasks: [] };
  const directory = missionDirectories(workspace).find((candidate) => path.basename(candidate) === reference.missionRef);
  if (!directory) return { state: 'MISSING', selectedTasks: [] };
  const authority = resolveMissionAuthority(directory);
  if (!authority) return { state: 'MISSING', directory, selectedTasks: [] };
  const root = parseMissionResource(authority.file);
  const parent = children(root, 'ParentMission')[0];
  if (reference.linkRef && parent && attr(parent, 'link-ref', 'link_ref', 'linkRef') !== reference.linkRef) {
    return { state: 'DRIFTED', directory, authority: authority.file, selectedTasks: [] };
  }
  return { state: 'BOUND', directory, authority: authority.file, selectedTasks: [] };
}

export function projectSelectedTasks(root: SpecXmlNode, refs: string[]): SelectedTaskProjection[] {
  const tasks = descendants(root, (node) => node.tag === 'Task');
  return refs.map((ref) => {
    const task = tasks.find((candidate) => attr(candidate, 'id') === ref);
    if (!task) return { ref, status: undefined, exists: false, leaf: false };
    const subNodes = children(task, 'SubNodes');
    const leaf = !subNodes.some((group) => children(group, 'Task').length > 0 || children(group, 'TaskGroup').length > 0);
    return { ref, status: attr(task, 'status'), exists: true, leaf };
  });
}

export function selectedTasksSatisfied(projections: SelectedTaskProjection[]): boolean {
  return projections.length > 0 && projections.every((projection) =>
    projection.exists && projection.leaf && (projection.status === 'DONE' || projection.status === 'SUPERSEDED')
  );
}
