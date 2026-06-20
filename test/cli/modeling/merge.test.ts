import { describe, expect, it } from 'bun:test';
import { parseXnl } from 'xnl-core';
import { mergeModeling, DEFAULT_POLICY } from '../../../src/cli/modeling/merge';

function nodes(src: string) {
  return parseXnl(src).nodes;
}

describe('modeling 3-way merge', () => {
  it('takes the changed side when only one side changed', () => {
    const base = nodes(`<object #r.x kind="entity" fact_grade="surface_view" single_writer="r.s" [ <types ?t>v1</?t> ]>`);
    const ours = base;
    const theirs = nodes(`<object #r.x kind="entity" fact_grade="surface_view" single_writer="r.s" [ <types ?t>v2</?t> ]>`);
    const { merged, conflicts } = mergeModeling(base, ours, theirs);
    expect(conflicts).toEqual([]);
    expect(JSON.stringify(merged.get('r.x'))).toContain('v2');
  });

  it('auto-merges disjoint changes (different metadata keys)', () => {
    const base = nodes(`<object #r.x kind="entity" a="1" b="1">`);
    const ours = nodes(`<object #r.x kind="entity" a="2" b="1">`);
    const theirs = nodes(`<object #r.x kind="entity" a="1" b="2">`);
    const { merged, conflicts } = mergeModeling(base, ours, theirs);
    expect(conflicts).toEqual([]);
    const m: any = merged.get('r.x');
    expect(m.metadata.a).toBe('2');
    expect(m.metadata.b).toBe('2');
  });

  it('reports a same-field conflict (default human), not silently overwritten', () => {
    const base = nodes(`<object #r.x kind="entity" a="1">`);
    const ours = nodes(`<object #r.x kind="entity" a="2">`);
    const theirs = nodes(`<object #r.x kind="entity" a="3">`);
    const { merged, conflicts } = mergeModeling(base, ours, theirs);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].type).toBe('same-field');
    expect(merged.has('r.x')).toBe(false); // unresolved, not auto-picked
  });

  it('policy override resolves same-field to theirs', () => {
    const base = nodes(`<object #r.x kind="entity" a="1">`);
    const ours = nodes(`<object #r.x kind="entity" a="2">`);
    const theirs = nodes(`<object #r.x kind="entity" a="3">`);
    const { merged, conflicts } = mergeModeling(base, ours, theirs, {
      ...DEFAULT_POLICY,
      'same-field': 'theirs',
    });
    expect(conflicts).toEqual([]);
    expect((merged.get('r.x') as any).metadata.a).toBe('3');
  });

  it('adds a node introduced only on theirs side', () => {
    const base = nodes(`<object #r.x kind="entity">`);
    const ours = base;
    const theirs = nodes(`<object #r.x kind="entity">\n<object #r.y kind="enum">`);
    const { merged, conflicts } = mergeModeling(base, ours, theirs);
    expect(conflicts).toEqual([]);
    expect(merged.has('r.y')).toBe(true);
  });

  it('flags delete-modify (theirs deleted, ours modified)', () => {
    const base = nodes(`<object #r.x kind="entity" a="1">`);
    const ours = nodes(`<object #r.x kind="entity" a="2">`);
    const theirs = nodes(`<doc>`); // r.x absent on theirs -> deleted
    const { conflicts } = mergeModeling(base, ours, theirs);
    expect(conflicts.some((c) => c.type === 'delete-modify')).toBe(true);
  });

  it('honors a delete when the other side did not touch the node', () => {
    const base = nodes(`<object #r.x kind="entity" a="1">`);
    const ours = base; // unchanged
    const theirs = nodes(`<doc>`); // deleted
    const { merged, conflicts } = mergeModeling(base, ours, theirs);
    expect(conflicts).toEqual([]);
    expect(merged.has('r.x')).toBe(false);
  });
});
