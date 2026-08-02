import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(import.meta.dir, '../..');

function template(relative: string): string {
  return fs.readFileSync(path.join(root, 'src', 'templates', relative), 'utf-8');
}

describe('autonomous ordinary-task delegation', () => {
  it('lets the current AI choose local or delegated execution', () => {
    const impl = template('codument/std/actions/impl-track.md');
    const workflow = template('codument/std/methods/workflow.md');
    const dag = template('codument/std/methods/dag-execution.md');
    const skill = template('skills/codument-impl-track/SKILL.md');

    expect(impl).toContain('选择 `local` 或 `delegated`');
    expect(impl).toContain('leaf/DAG 本身不意味着必须 fresh-spawn');
    expect(impl).toContain('track executor 唯一拥有 `track.xml`');
    expect(impl).not.toContain('不亲自写代码');
    expect(impl).not.toContain('对每个叶 `Task`，编排器 fresh-spawn');
    expect(workflow).toContain('普通叶任务由当前 AI');
    expect(dag).toContain('DAG 决定哪些节点 ready，不决定由谁执行');
    expect(skill).toContain('AI 自主选择本地或委派执行');
  });

  it('keeps mandatory isolation explicit', () => {
    const impl = template('codument/std/actions/impl-track.md');
    const validation = template('codument/std/protocols/validation.md');
    const verify = template('codument/std/actions/verify.md');

    expect(impl).toContain('`cdt:GapLoop`、`cdt:AttractorCheck`、`codument-verify`');
    expect(validation).toContain('每轮 **fresh-spawn** 一个独立子代理');
    expect(validation).toContain('执行器固定 fresh-subagent');
    expect(verify).toContain('verify 必须用 fresh-subagent');
  });
});
