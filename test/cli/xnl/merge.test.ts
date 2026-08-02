import { describe, expect, it } from 'bun:test';
import { parseXnl } from 'xnl-core';
import { mergeXnlNodes } from '../../../src/cli/xnl/merge';
import { serializeXnlFile } from '../../../src/cli/xnl/registry';

function nodes(source: string) {
  return parseXnl(source, { textBlockStyle: true }).nodes;
}

function mergedText(result: ReturnType<typeof mergeXnlNodes>): string {
  return serializeXnlFile([...result.merged.values()]);
}

describe('generic conservative XNL node merge', () => {
  it('merges disjoint changes to a complete decision node', () => {
    const base = nodes('<decision #decision.a { status = "accepted" confidence = 0.8 }>');
    const ours = nodes('<decision #decision.a { status = "resolved" confidence = 0.8 }>');
    const theirs = nodes('<decision #decision.a { status = "accepted" confidence = 0.9 }>');
    const result = mergeXnlNodes(base, ours, theirs);
    expect(result.conflicts).toEqual([]);
    expect(mergedText(result)).toContain('status = "resolved"');
    expect(mergedText(result)).toContain('confidence = 0.9');
  });

  it('reports same-field, add-add, and delete-modify conflicts', () => {
    const sameField = mergeXnlNodes(
      nodes('<decision #decision.a { status = "accepted" }>'),
      nodes('<decision #decision.a { status = "resolved" }>'),
      nodes('<decision #decision.a { status = "deferred" }>'),
    );
    expect(sameField.conflicts.map(({ type }) => type)).toEqual(['same-field']);

    const addAdd = mergeXnlNodes(
      [],
      nodes('<decision #decision.a { status = "resolved" }>'),
      nodes('<decision #decision.a { status = "deferred" }>'),
    );
    expect(addAdd.conflicts.map(({ type }) => type)).toEqual(['add-add']);

    const deleteModify = mergeXnlNodes(
      nodes('<decision #decision.a { status = "accepted" }>'),
      [],
      nodes('<decision #decision.a { status = "resolved" }>'),
    );
    expect(deleteModify.conflicts.map(({ type }) => type)).toEqual(['delete-modify']);
  });

  it('is idempotent for equivalent repeated nodes and rejects duplicate input ids', () => {
    const source = nodes('<decision #decision.a { status = "accepted" }>');
    const result = mergeXnlNodes([], source, source);
    expect(result.conflicts).toEqual([]);
    expect(result.merged.size).toBe(1);
    expect(() => mergeXnlNodes([], [...source, ...source], [])).toThrow(/Duplicate XNL node id/);
  });
});
