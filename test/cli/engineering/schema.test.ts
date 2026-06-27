import { describe, expect, it } from 'bun:test';
import { parseXnl } from 'xnl-core';
import { validateEngineeringNode } from '../../../src/cli/engineering/schema';

function first(src: string) {
  return parseXnl(src, { textBlockStyle: true }).nodes[0];
}

describe('engineering node schema validation', () => {
  it('passes a complete howto', () => {
    const errors = validateEngineeringNode(first(`<howto #global.howto.orders.add_endpoint kind="howto" [
      <when-to-use ?>新增 endpoint。</?>
      <steps ?>写代码。</?>
      <verification ?>跑测试。</?>
    ]>`));
    expect(errors).toEqual([]);
  });

  it('rejects howto missing steps / verification', () => {
    const errors = validateEngineeringNode(first(`<howto #global.howto.orders.add_endpoint kind="howto" [
      <when-to-use ?>新增 endpoint。</?>
    ]>`));
    expect(errors.some((e) => e.includes('<steps>'))).toBe(true);
    expect(errors.some((e) => e.includes('<verification>'))).toBe(true);
  });

  it('rejects unknown bare kind but allows namespaced shell kind', () => {
    expect(validateEngineeringNode(first(`<thing #global.howto.x.y kind="thing">`)).length).toBeGreaterThan(0);
    expect(validateEngineeringNode(first(`<check #global.howto.x.y kind="security:checklist">`))).toEqual([]);
  });
});
