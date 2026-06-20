/**
 * Showcase generator: materialize merged/ (the archive 3-way apply result) from
 * base/ (current registry) + ours/ (a concurrent track already merged) + theirs/
 * (this track's modeling_delta target). Re-run with:  bun run test/resources/modeling-showcase/generate.ts
 *
 * Deterministic markers are used so merged/ is committable and human-readable.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { XnlNode } from 'xnl-core';
import { loadModelingRegistry, serializeModelingFile } from '../../../src/cli/modeling/registry';
import { mergeModeling } from '../../../src/cli/modeling/merge';

const ROOT = __dirname;

function treeNodes(name: string): XnlNode[] {
  return [...loadModelingRegistry(path.join(ROOT, name)).files.values()].flat();
}
function fileIndex(name: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const [id, ref] of loadModelingRegistry(path.join(ROOT, name)).index) m.set(id, ref.file);
  return m;
}

export interface ComputedMerge {
  files: Map<string, string>; // relPath -> file content
  mergedIds: string[];
  added: string[];
  deleted: string[];
  conflicts: { id: string; type: string }[];
}

/** Pure: compute the merged file set (no disk writes) — shared by generate() and the test. */
export function computeMergedFiles(): ComputedMerge {
  const base = treeNodes('base');
  const ours = treeNodes('ours');
  const theirs = treeNodes('theirs');
  const baseIds = new Set(loadModelingRegistry(path.join(ROOT, 'base')).index.keys());

  const { merged, conflicts } = mergeModeling(base, ours, theirs);

  const theirsIdx = fileIndex('theirs');
  const baseIdx = fileIndex('base');
  const fileOf = (id: string): string => theirsIdx.get(id) ?? baseIdx.get(id) ?? path.join('domain', '_misc', 'index.xnl');

  const byFile = new Map<string, { id: string; node: XnlNode }[]>();
  for (const [id, node] of merged) {
    const f = fileOf(id);
    if (!byFile.has(f)) byFile.set(f, []);
    byFile.get(f)!.push({ id, node });
  }

  // empty markers preserved (prose only; matches the hand-authored fixtures + expected style)
  const factory = () => '';
  const files = new Map<string, string>();
  for (const f of [...byFile.keys()].sort()) {
    const nodes = byFile.get(f)!.sort((a, b) => a.id.localeCompare(b.id)).map((x) => x.node);
    files.set(f, serializeMergedFile(nodes, factory));
  }

  const mergedIds = [...merged.keys()].sort();
  const added = mergedIds.filter((id) => !baseIds.has(id));
  const deleted = [...baseIds].filter((id) => !merged.has(id)).sort();
  return { files, mergedIds, added, deleted, conflicts: conflicts.map((c) => ({ id: c.id, type: c.type })) };
}

function serializeMergedFile(nodes: XnlNode[], factory: () => string): string {
  return serializeModelingFile(nodes, { textMarkerFactory: factory });
}

export function generate(): { mergedIds: string[]; conflicts: { id: string; type: string }[] } {
  const { files, mergedIds, added, deleted, conflicts } = computeMergedFiles();

  const outDir = path.join(ROOT, 'merged');
  fs.rmSync(outDir, { recursive: true, force: true });
  for (const [rel, content] of files) {
    const abs = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
  }
  const changes = [
    '# Showcase merge result (CHANGES)',
    '',
    '> base + ours (concurrent track) + theirs (this track’s modeling_delta) → merged (archive 3-way apply).',
    '',
    `- merged node count: ${mergedIds.length}`,
    `- added: ${added.length ? added.join(', ') : '(none)'}`,
    `- deleted: ${deleted.length ? deleted.join(', ') : '(none)'}`,
    `- conflicts: ${conflicts.length ? conflicts.map((c) => `${c.id}:${c.type}`).join(', ') : '(none — disjoint auto-merge)'}`,
    '',
    'What changed vs base:',
    '- `orders.order`        — modified: +couponId field + invariant (theirs)',
    '- `orders.order_status` — modified: +Refunded (theirs)',
    '- `orders.order_lifecycle` — modified: +paid→refunded transition (theirs)',
    '- `orders.refund_policy` — added (theirs)',
    '- `orders.pricing`      — deleted (theirs omits it; ours unchanged → honored)',
    '- `inventory.stock`     — modified: +warehouse field (ours, concurrent) — auto-merged disjointly',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'CHANGES.md'), changes, 'utf-8');

  return { mergedIds, conflicts: conflicts.map((c) => ({ id: c.id, type: c.type })) };
}

if (import.meta.main) {
  const r = generate();
  console.log('merged ids:', r.mergedIds.join(', '));
  console.log('conflicts:', r.conflicts.length ? r.conflicts : '(none)');
}
