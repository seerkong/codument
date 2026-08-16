import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');

function readTemplate(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, 'src', 'templates', ...relativePath.split('/')), 'utf-8');
}

describe('continuous mission execution templates', () => {
  it('continues after activation with operation-local verification', () => {
    const operation = readTemplate('codument/std/operations/impl-mission.md');

    expect(operation).toContain('调用 `codument-impl-mission <id>` 就是开始实现 mission');
    expect(operation).toContain('每个 logical mission operation 必须有与影响相称的完成判定');
    expect(operation).toContain('完成判定通过且无前提、依赖、范围或目标的失效信号时，直接继续下一个 planned ready operation');
    expect(operation).toContain('子流程的返回边界不得冒充 mission 主循环返回边界');
    expect(operation).toContain('mission 父层读取结果、通过 CLI 更新状态、执行当前 operation 完成判定，然后继续 mission 主循环');
    expect(operation).toContain('#continue ?next_ready');
    expect(operation).toContain('#continue ?next_after_replan');
    expect(operation).toContain('ready leaf 是推进粒度，不是 invocation 返回边界');
    expect(operation).toContain('不生成独立回执格式');
    expect(operation).not.toContain('操作完成后必须重新 observe -> reconcile');
    expect(operation).not.toContain('重规划后必须重新 observe -> reconcile');
    expect(operation).toContain('显式确认 gate');
    expect(operation).toContain('规划期问答预算（`light`/`normal`/`deep`）不构成执行期停点');
    expect(operation).toContain('视为已授权启动');
    expect(operation).not.toContain('#exit ?reload_active');
    expect(operation).not.toContain('#exit ?wait_after_operation');
    expect(operation).not.toContain('#exit ?wait_replan');
    expect(operation).not.toContain('bounded operation');
    expect(operation).not.toContain('有界操作');
  });

  it('uses ten completed tracks as the only execution-session budget', () => {
    const operation = readTemplate('codument/std/operations/impl-mission.md');
    const spec = readTemplate('codument/std/spec/mission-xnl-spec.md');
    const skill = readTemplate('skills/codument-impl-mission/SKILL.md');

    expect(operation).toContain('最多连续完成 10 个 linked track 生命周期');
    expect(operation).toContain('不得把 mission 改为 `blocked` 或 `completed`');
    expect(spec).toContain('max_tracks = 10');
    expect(spec).toContain('不是通用 operation 计数器');
    expect(spec).toContain('`mission:after-node` 上的 `MissionReconcile` 是 mission 连续循环内部的 reconcile/checkpoint gate');
    expect(spec).toContain('这些子流程的 `return` / “完成即停” / “收口”只返回到 `MissionApplier`');
    expect(skill).toContain('十条 track checkpoint');
    expect(skill).not.toContain('一个有界操作');
  });

  it('scopes child track and gap-loop stopping rules under mission execution', () => {
    const implTrack = readTemplate('codument/std/operations/impl-track.md');
    const gapLoop = readTemplate('codument/std/operations/gap-loop.md');
    const dagExecution = readTemplate('codument/std/methods/dag-execution.md');

    expect(implTrack).toContain('如果当前 `codument-impl-track` 是由 `codument-impl-mission` 为某个 mission 子 track 调用的');
    expect(implTrack).toContain('不得把 track 完成当作 mission invocation 的默认停止点');
    expect(implTrack).toContain('如果本 track 是 mission 子 track，这里的“父层编排者”首先是 track 实现编排器');
    expect(gapLoop).toContain('Mission 调用 Track GapLoop 时');
    expect(gapLoop).toContain('Track 父层收口后把结果交还 MissionApplier');
    expect(dagExecution).toContain('若该 DAG 执行发生在 `codument-impl-mission` 的子 track / 子流程内');
  });

  it('activates candidate tracks without an approval wait and inherits auto severity during execution', () => {
    const operation = readTemplate('codument/std/operations/impl-mission.md');
    const planTrack = readTemplate('codument/std/operations/plan-track.md');
    const spec = readTemplate('codument/std/spec/mission-xnl-spec.md');

    expect(operation).toContain('候选 track 激活（candidate activation）');
    expect(operation).toContain('codument track transition <track-id> in_progress');
    expect(operation).toContain('codument mission bind-track <mission-id> <task-id> <track-id>');
    expect(operation).toContain('命令成功后继续下一个 planned ready operation');
    expect(operation).toContain('若该 operation 含 `TrackLink { state = "candidate" }`');
    expect(planTrack).toContain('codument track create <track_id> --stage active');
    expect(planTrack).toContain('mission 层代为批准、创建即激活');
    expect(planTrack).toContain('调用方上下文（mission 连续执行）');
    expect(spec).toContain('`TrackLink { state = "candidate" }` 的激活是 mission logical operation 的一部分');
    expect(spec).toContain('不等待用户批准');
  });

  it('does not bind fresh subagents to model or reasoning settings', () => {
    const files = [
      readTemplate('codument/std/operations/impl-track.md'),
      readTemplate('codument/std/operations/gap-loop.md'),
      readTemplate('codument/std/operations/verify.md'),
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
    const behavior = fs.readFileSync(path.join(ROOT, 'codument', 'behaviors', 'codument-core.xnl'), 'utf-8');

    expect(behavior).toContain('continuous cybernetic DEPA actor loop');
    expect(behavior).toContain('continuous-implementation');
    expect(behavior).toContain('max-tracks-checkpoint');
    expect(behavior).toContain('candidate-track-auto-activation');
    expect(behavior).toContain('execution-severity-inheritance');
    expect(behavior).toContain('sub-track-failure-returns-to-applier');
    expect(behavior).toContain('rather than a common receipt format');
    expect(behavior).toContain('without a mandatory full re-observe/reconcile pass');
    expect(behavior).toContain('child command returns from impl-track, archive-track, verify, gap-loop, or fresh subagents as local results for MissionApplier');
    expect(behavior).not.toContain('bounded-operation');
    expect(behavior).not.toContain('one bounded operation per turn');
  });
});
