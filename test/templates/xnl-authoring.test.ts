import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('XNL authoring guidance', () => {
  it('keeps modeling and engineering schema examples on attribute-block syntax', () => {
    const modeling = read('src/templates/codument/std/spec/modeling-node-schema.md');
    const engineering = read('src/templates/codument/std/spec/engineering-node-schema.md');

    for (const content of [modeling, engineering]) {
      expect(content).not.toContain('<object #resource.skill_tool kind=');
      expect(content).not.toContain('<component #orders.place_order_proc kind=');
      expect(content).not.toContain('<endpoint #orders.place_order kind=');
      expect(content).not.toContain('<route #shop.checkout kind=');
      expect(content).not.toContain('<rule #runtime.rules.state.no_derived_writeback kind=');
      expect(content).not.toContain('<types role=');
    }
  });

  it('documents extend/body semantics for singleton slots and child collections', () => {
    const xnlFormat = read('src/templates/codument/std/spec/xnl-format.md');

    expect(xnlFormat).toContain('单例语义槽位');
    expect(xnlFormat).toContain('同类集合 / 有序列表');
    expect(xnlFormat).toContain('<question ?>是否采用 decisions.xnl？</?>');
    expect(xnlFormat).toContain('<options { } [');
    expect(xnlFormat).toContain('<description ?>新建 track/mission 使用 XNL 保存结构化决策。</?>');
    expect(xnlFormat).toContain('decision` 自身的 `[]` **只承载下级 `<decision>`**');
    expect(xnlFormat).toContain('<raw-answer ?>待确认。</?>');
    expect(xnlFormat).toContain('`<answer>` 是 decision 唯一的回答反馈容器');
    expect(xnlFormat).toContain('<decision #track.foo.child');
    expect(xnlFormat).not.toContain('<decision-tree');
  });

  it('keeps canonical XNL examples free of ordinary metadata attributes', () => {
    const xnlFormat = read('src/templates/codument/std/spec/xnl-format.md');

    expect(xnlFormat).toContain('<item #x { count=3 active=true note="hi" }>');
    expect(xnlFormat).toContain('<SetVariable #SetVariable-a {');
    expect(xnlFormat).toContain('<no_body_node2 { a=[1] b={c=3} }>');
    expect(xnlFormat).not.toContain('<item id="x"');
    expect(xnlFormat).not.toContain('<SetVariable id=');
    expect(xnlFormat).not.toContain('<div id=');
    expect(xnlFormat).not.toContain('<my_text id=');
    expect(xnlFormat).not.toContain('<no_body_node2 a=');
  });
});
