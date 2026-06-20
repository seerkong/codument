import { describe, expect, it } from 'bun:test';
import { parseXnl } from 'xnl-core';
import { validateModelingNode } from '../../../src/cli/modeling/schema';

function node(src: string) {
  return parseXnl(src).nodes[0];
}

describe('modeling node schema validation', () => {
  it('passes a complete entity', () => {
    const n = node(
      `<object #resource.skill_tool kind="entity" fact_grade="authoritative_fact" single_writer="resource.store" [ <types ?t>interface X {}</?t> ]>`,
    );
    expect(validateModelingNode(n)).toEqual([]);
  });

  it('rejects entity missing fact_grade / single_writer / types', () => {
    const n = node(`<object #resource.bad kind="entity" [ <desc ?>x</?> ]>`);
    const errs = validateModelingNode(n);
    expect(errs.join('\n')).toMatch(/requires a <types>/);
    expect(errs.join('\n')).toMatch(/requires fact_grade/);
    expect(errs.join('\n')).toMatch(/requires single_writer/);
  });

  it('rejects invalid fact_grade', () => {
    const n = node(
      `<object #r.x kind="entity" fact_grade="nope" single_writer="r.s" [ <types ?t>x</?t> ]>`,
    );
    expect(validateModelingNode(n).join('\n')).toMatch(/invalid fact_grade/);
  });

  it('requires mermaid on state-machine', () => {
    const ok = node(`<state-machine #r.sm kind="state-machine" [ <mermaid ?m>stateDiagram-v2</?m> ]>`);
    expect(validateModelingNode(ok)).toEqual([]);
    const bad = node(`<state-machine #r.sm2 kind="state-machine" [ <desc ?>x</?> ]>`);
    expect(validateModelingNode(bad).join('\n')).toMatch(/requires a <mermaid>/);
  });

  it('requires depends_on + capsule-tree on module', () => {
    const ok = node(
      `<module #m.resource kind="module" depends_on="[]" [ <capsule-tree ?>resource/</?> ]>`,
    );
    expect(validateModelingNode(ok)).toEqual([]);
    const bad = node(`<module #m.bad kind="module" [ <desc ?>x</?> ]>`);
    const e = validateModelingNode(bad).join('\n');
    expect(e).toMatch(/requires depends_on/);
    expect(e).toMatch(/requires a <capsule-tree>/);
  });

  it('requires runtime/input/config/output on component', () => {
    const bad = node(`<component #c.x kind="component" [ <runtime ?r>x</?r> ]>`);
    const e = validateModelingNode(bad).join('\n');
    expect(e).toMatch(/<input> block/);
    expect(e).toMatch(/<config> block/);
    expect(e).toMatch(/<output> block/);
  });

  it('accepts bare-tag IO blocks on component (canonical)', () => {
    const ok = node(
      `<component #c.ok kind="component" [ <runtime ?r>x</?r> <input ?i>x</?i> <config ?cf>x</?cf> <output ?o>x</?o> ]>`,
    );
    expect(validateModelingNode(ok)).toEqual([]);
  });

  it('accepts role-tagged <types role="..."> IO blocks on component (compat)', () => {
    const ok = node(
      `<component #c.role kind="component" [ <types role="runtime" ?r>x</?r> <types role="input" ?i>x</?i> <types role="config" ?cf>x</?cf> <types role="output" ?o>x</?o> ]>`,
    );
    const e = validateModelingNode(ok).join('\n');
    expect(e).not.toMatch(/requires a <runtime> block/);
    expect(e).not.toMatch(/requires a <input> block/);
    expect(e).not.toMatch(/requires a <config> block/);
    expect(e).not.toMatch(/requires a <output> block/);
    expect(validateModelingNode(ok)).toEqual([]);
  });

  it('still flags a missing block when using role-tagged IO (only some slots present)', () => {
    const bad = node(
      `<component #c.rolebad kind="component" [ <types role="runtime" ?r>x</?r> <types role="input" ?i>x</?i> ]>`,
    );
    const e = validateModelingNode(bad).join('\n');
    expect(e).toMatch(/<config> block/);
    expect(e).toMatch(/<output> block/);
    expect(e).not.toMatch(/<runtime> block/);
    expect(e).not.toMatch(/<input> block/);
  });

  it('accepts namespaced shell kinds, rejects unknown bare kinds', () => {
    expect(validateModelingNode(node(`<route #ui.home kind="surface:route">`))).toEqual([]);
    expect(validateModelingNode(node(`<x #a.b kind="bogus">`)).join('\n')).toMatch(/unknown kernel kind/);
  });

  it('flags a node without an id', () => {
    expect(validateModelingNode(node(`<object kind="enum" [ <types ?t>x</?t> ]>`)).join('\n')).toMatch(
      /has no id/,
    );
  });
});
