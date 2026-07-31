import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');

function readTemplate(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, 'src', 'templates', ...relativePath.split('/')), 'utf-8');
}

describe('continuous mission execution templates', () => {
  it('continues after activation with action-local verification', () => {
    const action = readTemplate('codument/std/actions/impl-mission.md');

    expect(action).toContain('调用 `codument-impl-mission <id>` 就是开始实现 mission');
    expect(action).toContain('每个 logical mission action 必须有与影响相称的完成判定');
    expect(action).toContain('完成判定通过且无前提、依赖、范围或目标的失效信号时，直接继续下一个 planned ready action');
    expect(action).toContain('子流程的返回边界不得冒充 mission 主循环返回边界');
    expect(action).toContain('mission 父层必须读取子流程结果、更新 `mission.xml` / report、执行当前 action 完成判定，然后继续 mission 主循环');
    expect(action).toContain('#continue ?next_ready');
    expect(action).toContain('#continue ?next_after_replan');
    expect(action).toContain('ready leaf 是推进粒度，不是 invocation 返回边界');
    expect(action).toContain('不生成独立回执格式');
    expect(action).not.toContain('动作完成后必须重新 observe -> reconcile');
    expect(action).not.toContain('重规划后必须重新 observe -> reconcile');
    expect(action).toContain('需要用户确认的 ready pending decision');
    expect(action).toContain('视为已经确认启动');
    expect(action).not.toContain('#exit ?reload_active');
    expect(action).not.toContain('#exit ?wait_after_action');
    expect(action).not.toContain('#exit ?wait_replan');
    expect(action).not.toContain('bounded action');
    expect(action).not.toContain('有界动作');
  });

  it('uses ten completed tracks as the only execution-session budget', () => {
    const action = readTemplate('codument/std/actions/impl-mission.md');
    const spec = readTemplate('codument/std/spec/mission-xml-spec.md');
    const skill = readTemplate('skills/codument-impl-mission/SKILL.md');

    expect(action).toContain('最多连续完成 10 个 linked track 生命周期');
    expect(action).toContain('不得把 mission 改为 `blocked` 或 `completed`');
    expect(spec).toContain('max-tracks="10" on-limit="checkpoint"');
    expect(spec).toContain('不是通用 action 计数器');
    expect(spec).toContain('`mission:after-node` 上的 `<cdt:MissionReconcile>` 是 mission 连续循环内部的 reconcile/checkpoint gate');
    expect(spec).toContain('这些子流程的 `return` / “完成即停” / “收口”只返回到 `MissionApplier`');
    expect(skill).toContain('十条 track checkpoint');
    expect(skill).not.toContain('一个有界动作');
  });

  it('scopes child track and gap-loop stopping rules under mission execution', () => {
    const implTrack = readTemplate('codument/std/actions/impl-track.md');
    const gapLoop = readTemplate('codument/std/actions/gap-loop.md');
    const dagExecution = readTemplate('codument/std/methods/dag-execution.md');

    expect(implTrack).toContain('如果当前 `codument-impl-track` 是由 `codument-impl-mission` 为某个 mission 子 track 调用的');
    expect(implTrack).toContain('不得把 track 完成当作 mission invocation 的默认停止点');
    expect(implTrack).toContain('如果本 track 是 mission 子 track，这里的“父层编排者”首先是 track 实现编排器');
    expect(gapLoop).toContain('如果 gap-loop 是 mission 执行中的子流程');
    expect(gapLoop).toContain('gap-loop 收口后必须把结果交回 `codument-impl-mission` 的 `MissionApplier`');
    expect(dagExecution).toContain('若该 DAG 执行发生在 `codument-impl-mission` 的子 track / 子流程内');
  });

  it('does not bind fresh subagents to model or reasoning settings', () => {
    const files = [
      readTemplate('codument/std/actions/impl-track.md'),
      readTemplate('codument/std/actions/gap-loop.md'),
      readTemplate('codument/std/actions/verify.md'),
    ];

    for (const content of files) {
      expect(content).not.toMatch(/gpt[- ]?5\.5/i);
      expect(content).not.toContain('effort=high');
      expect(content).not.toContain('注入模型/档位');
      expect(content).not.toContain('高能力档');
      expect(content).not.toContain('reasoning effort');
    }
  });

  it('keeps the live behavior contract aligned with the continuous prompt', () => {
    const behavior = fs.readFileSync(path.join(ROOT, 'codument', 'behaviors', 'codument-core.xml'), 'utf-8');

    expect(behavior).toContain('continuous cybernetic DEPA actor loop');
    expect(behavior).toContain('continuous-implementation');
    expect(behavior).toContain('max-tracks-checkpoint');
    expect(behavior).toContain('rather than a common receipt format');
    expect(behavior).toContain('without a mandatory full re-observe/reconcile pass');
    expect(behavior).toContain('child command returns from impl-track, archive-track, verify, gap-loop, or fresh subagents as local results for MissionApplier');
    expect(behavior).not.toContain('bounded-action');
    expect(behavior).not.toContain('one bounded action per turn');
  });
});
