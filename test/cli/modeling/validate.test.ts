import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  validateModelingTree,
  idNamespace,
  type ValidateFinding,
} from '../../../src/cli/modeling/validate';

const RES = path.join(__dirname, '..', '..', 'resources', 'modeling-validate');
const SHOW = path.join(__dirname, '..', '..', 'resources', 'modeling-showcase');

function errors(fs: ValidateFinding[]): ValidateFinding[] {
  return fs.filter((f) => f.severity === 'error');
}
function warnings(fs: ValidateFinding[]): ValidateFinding[] {
  return fs.filter((f) => f.severity === 'warning');
}
function layers(fs: ValidateFinding[], layer: ValidateFinding['layer']): ValidateFinding[] {
  return fs.filter((f) => f.layer === layer);
}

describe('idNamespace helper', () => {
  it('drops the trailing name segment', () => {
    expect(idNamespace('domain.resource.skill_tool')).toBe('domain.resource');
    expect(idNamespace('orders.order')).toBe('orders');
  });
  it('handles a bare name (empty namespace)', () => {
    expect(idNamespace('order')).toBe('');
  });
});

describe('validateModelingTree — Layer 1 (syntax)', () => {
  it('reports an XNL syntax error (mismatched text marker) instead of throwing', () => {
    const findings = validateModelingTree(path.join(RES, 'syntax-error'));
    const syn = layers(findings, 'syntax');
    expect(syn.length).toBeGreaterThan(0);
    expect(syn[0].severity).toBe('error');
    expect(syn[0].file).toContain('index.xnl');
    expect(syn[0].line).toBeGreaterThan(0);
  });

  it('a syntactically valid tree produces no syntax findings (showcase base)', () => {
    const findings = validateModelingTree(path.join(SHOW, 'base'));
    expect(layers(findings, 'syntax')).toEqual([]);
  });
});

describe('validateModelingTree — Layer 2 (schema)', () => {
  it('surfaces node-schema violations (entity missing minimal representations)', () => {
    const findings = validateModelingTree(path.join(RES, 'schema-error'));
    const sch = layers(findings, 'schema');
    const msg = sch.map((f) => f.message).join('\n');
    expect(msg).toMatch(/requires a <types>/);
    expect(msg).toMatch(/requires fact_grade/);
    expect(msg).toMatch(/requires single_writer/);
    expect(sch.every((f) => f.severity === 'error')).toBe(true);
  });
});

describe('validateModelingTree — Layer 3 (hierarchy / reference)', () => {
  it('warns, without errors, when the registry is empty', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-empty-modeling-'));
    const findings = validateModelingTree(dir);

    expect(errors(findings)).toEqual([]);
    expect(warnings(findings).length).toBeGreaterThan(0);
  });

  it('warns, without errors, when the registry directory is missing', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-missing-modeling-'));
    const findings = validateModelingTree(path.join(parent, 'modeling'));

    expect(errors(findings)).toEqual([]);
    expect(warnings(findings).length).toBeGreaterThan(0);
  });

  it('flags id↔path misalignment (context mismatch)', () => {
    const findings = validateModelingTree(path.join(RES, 'id-path-mismatch'));
    const hits = layers(findings, 'hierarchy').filter((f) => /context/.test(f.message));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].severity).toBe('error');
  });

  it('flags a dangling modeling:// reference as error', () => {
    const findings = validateModelingTree(path.join(RES, 'dangling-ref'));
    const hits = layers(findings, 'hierarchy').filter((f) => /modeling:\/\//.test(f.message));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].severity).toBe('error');
    expect(hits[0].message).toMatch(/nonexistent_module/);
  });

  it('scans VFS references from attribute blocks', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-modeling-attrs-'));
    const target = path.join(dir, 'domain', 'orders');
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'index.xnl'), `<object #orders.order { kind = "entity" fact_grade = "authoritative_fact" single_writer = "modeling://domain/orders/missing_writer" } [
      <types ?t>interface Order { id: string }</?t>
    ]>`);

    const findings = validateModelingTree(dir);
    const hits = layers(findings, 'hierarchy').filter((f) => /missing_writer/.test(f.message));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].severity).toBe('error');
  });

  it('does NOT verify behavior:// existence (syntax-only), no error for unknown behavior ref', () => {
    const findings = validateModelingTree(path.join(RES, 'behavior-ref-ok'));
    expect(errors(findings)).toEqual([]);
  });

  it('reports duplicate id across files as a finding (not a throw)', () => {
    const findings = validateModelingTree(path.join(RES, 'duplicate-id'));
    const dup = layers(findings, 'hierarchy').filter((f) => /duplicate/i.test(f.message));
    expect(dup.length).toBeGreaterThan(0);
    expect(dup[0].severity).toBe('error');
    // mentions both file locations
    expect(dup[0].message).toMatch(/a\.xnl/);
    expect(dup[0].message).toMatch(/b\.xnl/);
  });

  it('requires a domain plane when a non-empty registry has only a surface plane', () => {
    const findings = validateModelingTree(path.join(RES, 'missing-domain'));
    const hits = layers(findings, 'hierarchy').filter((f) => /domain/i.test(f.message) && f.severity === 'error');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('an unknown derived plane is a warning, not an error', () => {
    const findings = validateModelingTree(path.join(RES, 'unknown-plane'));
    // domain exists -> no missing-domain error
    expect(errors(findings)).toEqual([]);
    const planeWarn = warnings(findings).filter((f) => /plane/i.test(f.message) && /derived/.test(f.message));
    expect(planeWarn.length).toBeGreaterThan(0);
  });
});

describe('validateModelingTree — delta mode', () => {
  it('applies the same rules with id namespace aligned to <plane>/<context>.xnl', () => {
    const good = validateModelingTree(path.join(RES, 'delta-good'), { mode: 'deltas' });
    expect(errors(good)).toEqual([]);

    const bad = validateModelingTree(path.join(RES, 'delta-bad'), { mode: 'deltas' });
    const hits = layers(bad, 'hierarchy').filter((f) => /context/.test(f.message));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].severity).toBe('error');
  });
});

describe('validateModelingTree — happy path', () => {
  it('showcase base validates with 0 errors', () => {
    const findings = validateModelingTree(path.join(SHOW, 'base'));
    expect(errors(findings)).toEqual([]);
  });
});
