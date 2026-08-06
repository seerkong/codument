import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');

function readTemplate(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, 'src', 'templates', ...relativePath.split('/')), 'utf-8');
}

describe('mission execution stop-points', () => {
  it('removes the pending-approval structural break between plan-track and impl-track', () => {
    const planTrack = readTemplate('codument/std/actions/plan-track.md');
    const implTrack = readTemplate('codument/std/actions/impl-track.md');
    const implMission = readTemplate('codument/std/actions/impl-mission.md');

    expect(planTrack).toContain('由 `codument-impl-mission` 以 `QuestionSeverity=auto` 调用时，创建直接落在 `tracks/active/<id>/`');
    expect(planTrack).toContain('mission 层代为批准、创建即激活');
    expect(implTrack).toContain('### 1.4 mission 语境候选激活');
    expect(implTrack).toContain('先把该 track 激活到 `tracks/active/<id>/`');
    expect(implTrack).toContain('mission 语境下则向 MissionApplier 返回“无可激活 track”');
    expect(implMission).toContain('不等待用户批准');
  });

  it('keeps plan-time question budgets out of the execution loop', () => {
    const questioning = readTemplate('codument/std/protocols/questioning.md');
    const planMission = readTemplate('codument/std/actions/plan-mission.md');
    const implMission = readTemplate('codument/std/actions/impl-mission.md');

    expect(questioning).toContain('**执行期继承（mission/track 实现阶段）**');
    expect(questioning).toContain('问答预算**只作用于 plan / discuss 等规划期**');
    expect(questioning).toContain('**规划期问不完的问题不构成执行期停点**');
    expect(planMission).toContain('mission 建议默认 `auto`');
    expect(implMission).toContain('规划期问答预算（`light`/`normal`/`deep`）不构成执行期停点');
    expect(implMission).toContain('显式确认 gate');
  });

  it('defaults sub-track failures, resume, and delegation to autonomous handling in mission context', () => {
    const implTrack = readTemplate('codument/std/actions/impl-track.md');
    const dagExecution = readTemplate('codument/std/methods/dag-execution.md');
    const archiveTrack = readTemplate('codument/std/actions/archive-track.md');

    expect(implTrack).toContain('**mission 子 track 语境**');
    expect(implTrack).toContain('**不默认 ask-single-question-closed**');
    expect(implTrack).toContain('`QuestionSeverity=auto` 或由 mission 连续执行调用时**默认选「A. 继续此任务」直接续跑，不提问**');
    expect(implTrack).toContain('完成即返回产物与证据（stop 仅限子流程边界，调用方决定是否继续）');
    expect(implTrack).not.toContain('完成即停；');
    expect(dagExecution).toContain('完成即返回产物与证据（stop 仅限子流程边界，调用方决定是否继续）');
    expect(dagExecution).not.toContain('完成即停、不要开启超长会话');
    expect(archiveTrack).toContain('未完成 track 的裁决交还 MissionApplier');
  });
});
