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
    expect(action).toContain('不生成独立回执格式');
    expect(action).not.toContain('动作完成后必须重新 observe -> reconcile');
    expect(action).not.toContain('重规划后必须重新 observe -> reconcile');
    expect(action).toContain('需要用户确认的 ready pending decision');
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
    expect(skill).toContain('十条 track checkpoint');
    expect(skill).not.toContain('一个有界动作');
  });

  it('keeps the live behavior contract aligned with the continuous prompt', () => {
    const behavior = fs.readFileSync(path.join(ROOT, 'codument', 'behaviors', 'codument-core.xml'), 'utf-8');

    expect(behavior).toContain('continuous cybernetic DEPA actor loop');
    expect(behavior).toContain('continuous-implementation');
    expect(behavior).toContain('max-tracks-checkpoint');
    expect(behavior).toContain('rather than a common receipt format');
    expect(behavior).toContain('without a mandatory full re-observe/reconcile pass');
    expect(behavior).not.toContain('bounded-action');
    expect(behavior).not.toContain('one bounded action per turn');
  });
});
