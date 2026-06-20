import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { lintModelingRegistry, DEFAULT_THRESHOLDS } from '../../../src/cli/modeling/lint';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codument-modeling-lint-'));
}

function entity(id: string): string {
  return `<object #resource.${id} kind="entity" fact_grade="surface_view" single_writer="r.s" [ <types ?t>x</?t> ]>`;
}

describe('modeling lint (fractal-split)', () => {
  it('returns no findings for a small file', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'domain', 'resource'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'domain', 'resource', 'index.xnl'), entity('a'));
    expect(lintModelingRegistry(dir)).toEqual([]);
  });

  it('flags a file exceeding the node-count threshold', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'domain', 'resource'), { recursive: true });
    const many = Array.from({ length: 10 }, (_, i) => entity(`n${i}`)).join('\n');
    fs.writeFileSync(path.join(dir, 'domain', 'resource', 'index.xnl'), many);

    const findings = lintModelingRegistry(dir, { maxLines: 10000, maxNodes: 8 });
    expect(findings.length).toBe(1);
    expect(findings[0].nodeCount).toBe(10);
    expect(findings[0].reasons.join()).toMatch(/nodes > 8/);
  });

  it('flags a file exceeding the line threshold', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'domain', 'resource'), { recursive: true });
    // one entity with a long prose block (many lines), few nodes
    const longProse = '<object #r.big kind="entity" fact_grade="surface_view" single_writer="r.s" [ <desc ?p>\n' +
      Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n') +
      '\n</?p> <types ?t>x</?t> ]>';
    fs.writeFileSync(path.join(dir, 'domain', 'resource', 'index.xnl'), longProse);

    const findings = lintModelingRegistry(dir, { maxLines: 20, maxNodes: 100 });
    expect(findings.length).toBe(1);
    expect(findings[0].reasons.join()).toMatch(/lines > 20/);
  });

  it('uses default thresholds (400 lines / 8 nodes)', () => {
    expect(DEFAULT_THRESHOLDS).toEqual({ maxLines: 400, maxNodes: 8 });
  });

  it('returns empty for a missing dir', () => {
    expect(lintModelingRegistry(path.join(tmpDir(), 'nope'))).toEqual([]);
  });
});
