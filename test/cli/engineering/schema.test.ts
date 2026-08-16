import { describe, expect, it } from 'bun:test';
import { parseXnl } from 'xnl-core';
import { validateEngineeringNode } from '../../../src/cli/engineering/schema';

function first(src: string) {
  return parseXnl(src, { textBlockStyle: true }).nodes[0];
}

describe('engineering node schema validation', () => {
  it('passes a complete howto', () => {
    const errors = validateEngineeringNode(first(`<howto #global.howto.orders.add_endpoint { kind = "howto" } (
      <when-to-use ?>新增 endpoint。</?>
      <steps ?>写代码。</?>
      <verification ?>跑测试。</?>
    )>`));
    expect(errors).toEqual([]);
  });

  it('rejects howto missing steps / verification', () => {
    const errors = validateEngineeringNode(first(`<howto #global.howto.orders.add_endpoint { kind = "howto" } [
      <when-to-use ?>新增 endpoint。</?>
    ]>`));
    expect(errors.some((e) => e.includes('<steps>'))).toBe(true);
    expect(errors.some((e) => e.includes('<verification>'))).toBe(true);
  });

  it('rejects unknown bare kind but allows namespaced shell kind', () => {
    expect(validateEngineeringNode(first(`<thing #global.howto.x.y { kind = "thing" }>`)).length).toBeGreaterThan(0);
    expect(validateEngineeringNode(first(`<check #global.howto.x.y { kind = "security:checklist" }>`))).toEqual([]);
  });

  it('keeps accepting explicit legacy metadata kind during migration', () => {
    const errors = validateEngineeringNode(first(`<howto #global.howto.orders.legacy kind="howto" [
      <when-to-use ?>新增 endpoint。</?>
      <steps ?>写代码。</?>
      <verification ?>跑测试。</?>
    ]>`));
    expect(errors).toEqual([]);
  });

  it('keeps accepting legacy body sections during migration', () => {
    const errors = validateEngineeringNode(first(`<howto #global.howto.orders.legacy_body { kind = "howto" } [
      <when-to-use ?>新增 endpoint。</?>
      <steps ?>写代码。</?>
      <verification ?>跑测试。</?>
    ]>`));
    expect(errors).toEqual([]);
  });

  it('accepts canonical rule slots from extend', () => {
    const errors = validateEngineeringNode(first(`<rule #global.rule.xnl.singleton_slots { kind = "rule" } (
      <rule ?>单例表征放在 extend。</?>
      <rationale ?>保留唯一语义。</?>
      <enforcement ?>由 schema 校验。</?>
    )>`));
    expect(errors).toEqual([]);
  });
});
