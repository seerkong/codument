import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { loadModelingRegistry } from '../../../src/cli/modeling/registry';
import { validateModelingNode } from '../../../src/cli/modeling/schema';
import { computeMergedFiles } from '../../resources/modeling-showcase/generate';

const SHOW = path.join(__dirname, '..', '..', 'resources', 'modeling-showcase');

describe('modeling showcase (all kinds + delta + apply effect)', () => {
  it('all base nodes (every kind) pass schema validation', () => {
    const reg = loadModelingRegistry(path.join(SHOW, 'base'));
    const errs: string[] = [];
    for (const nodes of reg.files.values()) for (const n of nodes) errs.push(...validateModelingNode(n));
    expect(errs).toEqual([]);
    expect(reg.index.size).toBe(11); // entity×2, enum, state-machine, policy, module, component, actor, port, backend:endpoint, surface:route
  });

  it('committed merged/ matches a fresh compute (run generate.ts if this fails)', () => {
    const { files } = computeMergedFiles();
    expect(files.size).toBeGreaterThan(0);
    for (const [rel, content] of files) {
      const committed = fs.readFileSync(path.join(SHOW, 'merged', rel), 'utf-8');
      expect(committed).toBe(content);
    }
  });

  it('apply effect: add/modify/delete across kinds, disjoint auto-merge (0 conflicts)', () => {
    const { added, deleted, conflicts } = computeMergedFiles();
    expect(conflicts).toEqual([]);
    expect(added).toContain('orders.refund_policy'); // policy added (theirs)
    expect(deleted).toContain('orders.pricing'); // policy deleted (theirs omits; ours unchanged)

    const orderFile = fs.readFileSync(path.join(SHOW, 'merged', 'domain/orders/index.xnl'), 'utf-8');
    expect(orderFile).toContain('couponId'); // entity field added (theirs)
    expect(orderFile).toContain('Refunded'); // enum value added (theirs)
    expect(orderFile).toContain('paid --> refunded'); // state-machine transition added (theirs)

    const stockFile = fs.readFileSync(path.join(SHOW, 'merged', 'domain/inventory/index.xnl'), 'utf-8');
    expect(stockFile).toContain('warehouse'); // entity field added (ours concurrent) auto-merged disjointly
  });

  it('writes text elements in block style (content on its own indented line)', () => {
    const moduleFile = fs.readFileSync(path.join(SHOW, 'merged', 'domain/orders/module.xnl'), 'utf-8');
    // even a single-line IO block renders as: <input ?m>\n  interface...\n  </?m>
    expect(moduleFile).toMatch(/<input \?\w+>\n\s+interface PlaceOrderInput/);
    // not the legacy inline-open form
    expect(moduleFile).not.toMatch(/<input \?\w+>interface/);
  });
});
