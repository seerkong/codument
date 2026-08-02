import { applyMutations, diffNodes, parsePath } from 'xnl-core';
import type { PathItem, XnlMutation, XnlNode, XnlPath } from 'xnl-core';
import { isDataElement, readStableNodeId } from './registry';

export type XnlMergeConflictType = 'same-field' | 'delete-modify' | 'add-add';
export type XnlMergeResolution = 'human' | 'ours' | 'theirs' | 'base';
export type XnlMergePolicy = Record<XnlMergeConflictType, XnlMergeResolution>;

export const DEFAULT_XNL_MERGE_POLICY: XnlMergePolicy = {
  'same-field': 'human',
  'delete-modify': 'human',
  'add-add': 'human',
};

export interface XnlMergeConflict {
  id: string;
  type: XnlMergeConflictType;
  base?: XnlNode;
  ours?: XnlNode;
  theirs?: XnlNode;
}

export interface XnlMergeResult {
  merged: Map<string, XnlNode>;
  conflicts: XnlMergeConflict[];
}

export function indexXnlNodesById(nodes: XnlNode[]): Map<string, XnlNode> {
  const indexed = new Map<string, XnlNode>();
  for (const node of nodes) {
    if (!isDataElement(node)) continue;
    const id = readStableNodeId(node);
    if (!id) continue;
    const existing = indexed.get(id);
    if (existing) {
      throw new Error(`Duplicate XNL node id '${id}' in merge input`);
    }
    indexed.set(id, node);
  }
  return indexed;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function equal(a: XnlNode | undefined, b: XnlNode | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mutationsBetween(from: XnlNode, to: XnlNode): XnlMutation[] {
  return diffNodes(from, to, [], { metadataIdMode: 'identity' });
}

function pathItems(value: string | XnlPath): PathItem[] {
  return Array.isArray(value) ? value : parsePath(value);
}

function pathsOverlap(a: PathItem[], b: PathItem[]): boolean {
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index].type !== b[index].type || a[index].value !== b[index].value) {
      return false;
    }
  }
  return true;
}

function disjoint(ours: XnlMutation[], theirs: XnlMutation[]): boolean {
  return ours.every((ourMutation) =>
    theirs.every((theirMutation) =>
      !pathsOverlap(pathItems(ourMutation.path), pathItems(theirMutation.path))));
}

function resolve(
  conflict: XnlMergeConflict,
  policy: XnlMergePolicy,
  merged: Map<string, XnlNode>,
  conflicts: XnlMergeConflict[],
): void {
  const selected = policy[conflict.type] ?? 'human';
  if (selected === 'human') {
    conflicts.push(conflict);
    return;
  }
  const node = conflict[selected];
  if (node !== undefined) merged.set(conflict.id, node);
}

export function mergeXnlNodes(
  baseNodes: XnlNode[],
  ourNodes: XnlNode[],
  theirNodes: XnlNode[],
  policy: XnlMergePolicy = DEFAULT_XNL_MERGE_POLICY,
): XnlMergeResult {
  const base = indexXnlNodesById(baseNodes);
  const ours = indexXnlNodesById(ourNodes);
  const theirs = indexXnlNodesById(theirNodes);
  const merged = new Map<string, XnlNode>();
  const conflicts: XnlMergeConflict[] = [];
  const ids = new Set([...base.keys(), ...ours.keys(), ...theirs.keys()]);

  for (const id of ids) {
    const b = base.get(id);
    const o = ours.get(id);
    const t = theirs.get(id);

    if (b && o && t) {
      const oursChanged = !equal(b, o);
      const theirsChanged = !equal(b, t);
      if (!oursChanged && !theirsChanged) merged.set(id, o);
      else if (oursChanged && !theirsChanged) merged.set(id, o);
      else if (!oursChanged && theirsChanged) merged.set(id, t);
      else if (equal(o, t)) merged.set(id, o);
      else {
        const ourMutations = mutationsBetween(b, o);
        const theirMutations = mutationsBetween(b, t);
        if (disjoint(ourMutations, theirMutations)) {
          merged.set(id, applyMutations(
            clone(b),
            [...ourMutations, ...theirMutations],
            { metadataIdMode: 'identity' },
          ));
        } else {
          resolve({ id, type: 'same-field', base: b, ours: o, theirs: t }, policy, merged, conflicts);
        }
      }
      continue;
    }

    if (!b) {
      if (o && !t) merged.set(id, o);
      else if (!o && t) merged.set(id, t);
      else if (o && t) {
        if (equal(o, t)) merged.set(id, o);
        else resolve({ id, type: 'add-add', ours: o, theirs: t }, policy, merged, conflicts);
      }
      continue;
    }

    if (!o && !t) continue;
    if (!o && t) {
      if (!equal(b, t)) {
        resolve({ id, type: 'delete-modify', base: b, theirs: t }, policy, merged, conflicts);
      }
      continue;
    }
    if (!t && o) {
      if (!equal(b, o)) {
        resolve({ id, type: 'delete-modify', base: b, ours: o }, policy, merged, conflicts);
      }
    }
  }

  return { merged, conflicts };
}
