import { diffNodes, applyMutations, parsePath } from 'xnl-core';
import type { XnlNode, XnlMutation, XnlPath, PathItem } from 'xnl-core';
import { isDataElement, readNodeId } from './registry';

/**
 * Node-level three-way merge for engineering deltas (base + ours + theirs), keyed by
 * namespaced node id. Reuses xnl-core diffNodes/applyMutations. Conservative by
 * default: disjoint changes auto-merge; true conflicts are reported (not silently
 * overwritten) unless a per-type policy overrides. See std/spec/engineering-delta.md.
 */

export type ConflictType = 'same-field' | 'delete-modify' | 'add-add';
export type Resolve = 'human' | 'ours' | 'theirs' | 'base';
export type MergePolicy = Record<ConflictType, Resolve>;

export const DEFAULT_POLICY: MergePolicy = {
  'same-field': 'human',
  'delete-modify': 'human',
  'add-add': 'human',
};

export interface MergeConflict {
  id: string;
  type: ConflictType;
  base?: XnlNode;
  ours?: XnlNode;
  theirs?: XnlNode;
}

export interface MergeResult {
  /** Merged node set keyed by id (excludes unresolved human conflicts). */
  merged: Map<string, XnlNode>;
  conflicts: MergeConflict[];
}

/** Index top-level DataElement nodes by id. */
export function indexById(nodes: XnlNode[]): Map<string, XnlNode> {
  const m = new Map<string, XnlNode>();
  for (const n of nodes) {
    const id = readNodeId(n);
    if (id && isDataElement(n)) m.set(id, n);
  }
  return m;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function nodeEqual(a: XnlNode | undefined, b: XnlNode | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mutationsBetween(from: XnlNode, to: XnlNode): XnlMutation[] {
  return diffNodes(from, to, [], { metadataIdMode: 'identity' });
}

function pathItems(p: string | XnlPath): PathItem[] {
  return Array.isArray(p) ? p : parsePath(p);
}

/** Two paths overlap if one is a prefix of (or equal to) the other. */
function overlaps(a: PathItem[], b: PathItem[]): boolean {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i].type !== b[i].type || a[i].value !== b[i].value) return false; // diverge -> disjoint
  }
  return true; // one is a prefix of the other -> overlap
}

function changesAreDisjoint(oursMut: XnlMutation[], theirsMut: XnlMutation[]): boolean {
  for (const o of oursMut) {
    for (const t of theirsMut) {
      if (overlaps(pathItems(o.path), pathItems(t.path))) return false;
    }
  }
  return true;
}

function resolveConflict(
  conflict: MergeConflict,
  policy: MergePolicy,
  merged: Map<string, XnlNode>,
  conflicts: MergeConflict[],
): void {
  const choice = policy[conflict.type] ?? 'human';
  switch (choice) {
    case 'ours':
      if (conflict.ours !== undefined) merged.set(conflict.id, conflict.ours);
      return;
    case 'theirs':
      if (conflict.theirs !== undefined) merged.set(conflict.id, conflict.theirs);
      return;
    case 'base':
      if (conflict.base !== undefined) merged.set(conflict.id, conflict.base);
      return;
    case 'human':
    default:
      conflicts.push(conflict); // report; leave unresolved
      return;
  }
}

export function mergeEngineering(
  baseNodes: XnlNode[],
  ourNodes: XnlNode[],
  theirNodes: XnlNode[],
  policy: MergePolicy = DEFAULT_POLICY,
): MergeResult {
  const base = indexById(baseNodes);
  const ours = indexById(ourNodes);
  const theirs = indexById(theirNodes);
  const merged = new Map<string, XnlNode>();
  const conflicts: MergeConflict[] = [];

  const ids = new Set<string>([...base.keys(), ...ours.keys(), ...theirs.keys()]);

  for (const id of ids) {
    const b = base.get(id);
    const o = ours.get(id);
    const t = theirs.get(id);

    // Present in all three.
    if (b && o && t) {
      const oChanged = !nodeEqual(b, o);
      const tChanged = !nodeEqual(b, t);
      if (!oChanged && !tChanged) merged.set(id, o);
      else if (oChanged && !tChanged) merged.set(id, o);
      else if (!oChanged && tChanged) merged.set(id, t);
      else if (nodeEqual(o, t)) merged.set(id, o); // same change both sides
      else {
        const oursMut = mutationsBetween(b, o);
        const theirsMut = mutationsBetween(b, t);
        if (changesAreDisjoint(oursMut, theirsMut)) {
          merged.set(id, applyMutations(clone(b), [...oursMut, ...theirsMut], { metadataIdMode: 'identity' }));
        } else {
          resolveConflict({ id, type: 'same-field', base: b, ours: o, theirs: t }, policy, merged, conflicts);
        }
      }
      continue;
    }

    // Added (not in base).
    if (!b) {
      if (o && !t) merged.set(id, o);
      else if (!o && t) merged.set(id, t);
      else if (o && t) {
        if (nodeEqual(o, t)) merged.set(id, o);
        else resolveConflict({ id, type: 'add-add', ours: o, theirs: t }, policy, merged, conflicts);
      }
      continue;
    }

    // In base; deleted on at least one side.
    const oDeleted = !o;
    const tDeleted = !t;
    if (oDeleted && tDeleted) continue; // both deleted -> gone
    if (oDeleted && t) {
      // ours deleted; theirs kept/modified
      if (nodeEqual(b, t)) continue; // theirs unchanged -> honor delete
      resolveConflict({ id, type: 'delete-modify', base: b, theirs: t }, policy, merged, conflicts);
      continue;
    }
    if (tDeleted && o) {
      if (nodeEqual(b, o)) continue; // ours unchanged -> honor delete
      resolveConflict({ id, type: 'delete-modify', base: b, ours: o }, policy, merged, conflicts);
      continue;
    }
  }

  return { merged, conflicts };
}
