import { describe, expect, it } from 'bun:test';
import * as path from 'path';
import { validateEngineeringTree } from '../../../src/cli/engineering/validate';

const SHOW = path.join(__dirname, '..', '..', 'resources', 'engineering-showcase', 'base');

describe('validateEngineeringTree', () => {
  it('validates the showcase base with no errors', () => {
    const findings = validateEngineeringTree(SHOW);
    expect(findings.filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('flags id path mismatch', () => {
    const dir = path.join(__dirname, '..', '..', 'resources', 'engineering-validate', 'id-path-mismatch');
    const findings = validateEngineeringTree(dir);
    expect(findings.some((f) => f.layer === 'hierarchy' && f.severity === 'error')).toBe(true);
  });
});
