import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { XnlNode } from 'xnl-core';
import { loadEngineeringRegistry, saveEngineeringFile } from '../../../src/cli/engineering/registry';
import { mergeEngineering } from '../../../src/cli/engineering/merge';

const RES = path.join(__dirname, '..', '..', 'resources', 'engineering-merge');

function treeNodes(dir: string): XnlNode[] {
  return [...loadEngineeringRegistry(dir).files.values()].flat();
}

interface Expected {
  conflicts?: { id: string; type: string }[];
  mergedIds?: string[];
  assert?: Record<string, Record<string, string>>;
}

const caseDirs = fs.readdirSync(RES).filter((d) => fs.statSync(path.join(RES, d)).isDirectory()).sort();

describe('engineering 3-way merge (resource-driven promotion)', () => {
  it('has discovered fixture cases', () => {
    expect(caseDirs.length).toBeGreaterThanOrEqual(4);
  });

  for (const name of caseDirs) {
    it(name, () => {
      const dir = path.join(RES, name);
      const expected = JSON.parse(fs.readFileSync(path.join(dir, 'expected.json'), 'utf-8')) as Expected;
      const { merged, conflicts } = mergeEngineering(
        treeNodes(path.join(dir, 'base')),
        treeNodes(path.join(dir, 'ours')),
        treeNodes(path.join(dir, 'theirs')),
      );

      expect(conflicts.map((c) => ({ id: c.id, type: c.type as string })).sort((a, b) => a.id.localeCompare(b.id))).toEqual(
        (expected.conflicts ?? []).slice().sort((a, b) => a.id.localeCompare(b.id)),
      );
      expect([...merged.keys()].sort()).toEqual((expected.mergedIds ?? []).slice().sort());

      for (const [id, fields] of Object.entries(expected.assert ?? {})) {
        const node = merged.get(id) as { metadata: Record<string, unknown> } | undefined;
        expect(node).toBeDefined();
        for (const [k, v] of Object.entries(fields)) expect(node!.metadata[k]).toBe(v);
      }

      const out = fs.mkdtempSync(path.join(os.tmpdir(), 'engineering-merge-out-'));
      saveEngineeringFile(out, path.join('global', 'combined', 'index.xnl'), [...merged.values()], {
        textMarkerFactory: () => 'm',
      });
      expect([...loadEngineeringRegistry(out).index.keys()].sort()).toEqual([...merged.keys()].sort());
    });
  }
});
