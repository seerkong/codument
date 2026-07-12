import { describe, expect, it } from 'bun:test';
import * as path from 'path';
import { loadEngineeringRegistry } from '../../../src/cli/engineering/registry';
import { validateEngineeringTree } from '../../../src/cli/engineering/validate';
import { mergeEngineering } from '../../../src/cli/engineering/merge';

const SHOW = path.join(__dirname, '..', '..', 'resources', 'engineering-showcase');

function nodes(name: string) {
  return [...loadEngineeringRegistry(path.join(SHOW, name)).files.values()].flat();
}

describe('engineering showcase (all kinds + delta + apply effect)', () => {
  it('all base nodes validate', () => {
    expect(validateEngineeringTree(path.join(SHOW, 'base')).filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('covers all default engineering kinds', () => {
    const reg = loadEngineeringRegistry(path.join(SHOW, 'base'));
    const kinds = new Set([...reg.index.values()].map((r) => r.node.attributes?.kind));
    for (const kind of ['overview', 'howto', 'rule', 'example', 'reference', 'troubleshooting', 'runbook', 'code-map']) {
      expect(kinds.has(kind)).toBe(true);
    }
  });

  it('apply effect: disjoint concurrent changes auto-merge', () => {
    const { merged, conflicts } = mergeEngineering(nodes('base'), nodes('ours'), nodes('theirs'));
    expect(conflicts).toEqual([]);
    expect(merged.has('global.reference.routes.backend_route_map')).toBe(true);
    expect(merged.has('global.rules.state.single_writer')).toBe(true);
  });
});
