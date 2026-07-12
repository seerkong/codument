import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { XnlNode } from 'xnl-core';
import { loadModelingRegistry, saveModelingFile } from '../../../src/cli/modeling/registry';
import { mergeModeling } from '../../../src/cli/modeling/merge';

/**
 * Resource-driven end-to-end test of the modeling delta promotion (3-way merge):
 * load base / ours / theirs registry trees from test/resources/modeling-merge/<case>/,
 * merge, assert conflicts + merged set against expected.json, then write the merged
 * result back and reload to exercise the full load -> merge -> save -> reload pipeline.
 */

const RES = path.join(__dirname, '..', '..', 'resources', 'modeling-merge');

function treeNodes(dir: string): XnlNode[] {
  return [...loadModelingRegistry(dir).files.values()].flat();
}

function detFactory(): () => string {
  let i = 0;
  return () => `m${i++}`;
}

interface Expected {
  conflicts?: { id: string; type: string }[];
  mergedIds?: string[];
  assert?: Record<string, Record<string, string>>;
}

const caseDirs = fs
  .readdirSync(RES)
  .filter((d) => fs.statSync(path.join(RES, d)).isDirectory())
  .sort();

describe('modeling 3-way merge (resource-driven promotion)', () => {
  it('has discovered fixture cases', () => {
    expect(caseDirs.length).toBeGreaterThanOrEqual(4);
  });

  for (const name of caseDirs) {
    it(name, () => {
      const dir = path.join(RES, name);
      const base = treeNodes(path.join(dir, 'base'));
      const ours = treeNodes(path.join(dir, 'ours'));
      const theirs = treeNodes(path.join(dir, 'theirs'));
      const expected = JSON.parse(fs.readFileSync(path.join(dir, 'expected.json'), 'utf-8')) as Expected;

      const { merged, conflicts } = mergeModeling(base, ours, theirs);

      // conflicts match by id+type
      const gotConflicts = conflicts
        .map((c) => ({ id: c.id, type: c.type as string }))
        .sort((a, b) => a.id.localeCompare(b.id));
      const expConflicts = (expected.conflicts ?? []).slice().sort((a, b) => a.id.localeCompare(b.id));
      expect(gotConflicts).toEqual(expConflicts);

      // merged node id set
      expect([...merged.keys()].sort()).toEqual((expected.mergedIds ?? []).slice().sort());

      // per-node field assertions
      for (const [id, fields] of Object.entries(expected.assert ?? {})) {
        const node = merged.get(id) as { attributes: Record<string, unknown> } | undefined;
        expect(node).toBeDefined();
        for (const [k, v] of Object.entries(fields)) {
          expect(node!.attributes[k]).toBe(v);
        }
      }

      // promotion writeback: save merged -> reload -> same node set
      const out = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-merge-out-'));
      saveModelingFile(out, path.join('domain', 'resource', 'index.xnl'), [...merged.values()], {
        textMarkerFactory: detFactory(),
      });
      const reloaded = loadModelingRegistry(out);
      expect([...reloaded.index.keys()].sort()).toEqual([...merged.keys()].sort());
    });
  }
});
