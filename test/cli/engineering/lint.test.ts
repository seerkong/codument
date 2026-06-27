import { describe, expect, it } from 'bun:test';
import * as path from 'path';
import { lintEngineeringRegistry } from '../../../src/cli/engineering/lint';

const SHOW = path.join(__dirname, '..', '..', 'resources', 'engineering-showcase', 'base');

describe('engineering lint', () => {
  it('returns no findings for normal thresholds', () => {
    expect(lintEngineeringRegistry(SHOW)).toEqual([]);
  });

  it('flags files over a tiny node threshold', () => {
    const findings = lintEngineeringRegistry(SHOW, { maxLines: 999, maxNodes: 0 });
    expect(findings.length).toBeGreaterThan(0);
  });
});
