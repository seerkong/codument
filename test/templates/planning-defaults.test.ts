import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');

function template(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, 'src', 'templates', 'codument', ...relativePath.split('/')), 'utf-8');
}

describe('planning template defaults', () => {
  it('creates versioned core skeletons and leaves decision forests on demand', () => {
    const trackSpec = template('std/spec/track-xnl-spec.md');
    const planTrack = template('std/operations/plan-track.md');
    const planMission = template('std/operations/plan-mission.md');

    expect(trackSpec).toContain('`proposal.md` 与 `design.md` 是 Track Kind 的 required files');
    expect(trackSpec).toContain('根 `decisions.xnl` 仅在首次出现真实决策时创建');
    expect(planTrack).toContain('| `design.md`（+`design/`） | ★必有 |');
    expect(planTrack).toContain('| `decisions.xnl` | 有决策时 |');
    expect(planTrack).toContain('| `decisions/**/*.xnl` | 按需 |');
    expect(planMission).toContain('codument decisions create <mission-dir>/decisions.xnl <decision-id>');
    expect(planMission).toContain('无 decision 时不落空文件');
  });

  it('keeps decision-tree rules in the shared protocol and defaults ordinary tracks to no fresh check', () => {
    const protocol = template('std/protocols/decision-tree.md');
    const questioning = template('std/protocols/questioning.md');
    const planTrack = template('std/operations/plan-track.md');

    expect(protocol).toContain('Decision-tree is the shared planning protocol');
    expect(questioning).toContain('Decision-tree structure, storage, dependency graph, conditional activation, and topological frontier handling are owned');
    expect(planTrack).toContain('也不默认挂 `HumanConfirm`、`AttractorCheck` 或 `GapLoop`');
    expect(planTrack).toContain('架构、安全或数据一致性高风险');
  });

  it('keeps planning analysis on the canonical decision forest DSL', () => {
    const protocol = template('std/protocols/decision-tree.md');
    const questioning = template('std/protocols/questioning.md');
    const planTrack = template('std/operations/plan-track.md');
    const planMission = template('std/operations/plan-mission.md');

    expect(protocol).toContain('author it with the current Decision Kind spec');
    expect(protocol).toContain('codument decisions validate <file>');
    expect(protocol).toContain('codument decisions frontier <file> --json');
    expect(questioning).toContain('普通假设写入 `analysis/findings.md`');
    expect(planTrack).toContain('命名依据不是决策节点');
    expect(planTrack).toContain('按 CLI 返回的 ready batch 继续');
    expect(planMission).toContain('按当前 Decision spec 填写语义');
    expect(planMission).toContain('按 CLI 返回的 ready batch 继续');
  });
});
