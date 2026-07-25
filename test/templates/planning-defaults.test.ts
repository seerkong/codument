import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');

function template(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, 'src', 'templates', 'codument', ...relativePath.split('/')), 'utf-8');
}

describe('planning template defaults', () => {
  it('creates design and decisions roots while leaving durable directories on demand', () => {
    const trackSpec = template('std/spec/track-xml-spec.md');
    const planTrack = template('std/actions/plan-track.md');
    const planMission = template('std/actions/plan-mission.md');

    expect(trackSpec).toContain('`track.xml`、`proposal.md`、`design.md`、`decisions.xnl` 与 `behavior_deltas` 必有');
    expect(trackSpec).toContain('`decisions/`、`memory/`、`analysis/` 和 `reports/` 按需');
    expect(planTrack).toContain('| `design.md`（+`design/`） | ★必有 |');
    expect(planTrack).toContain('| `decisions.xnl` | ★必有 |');
    expect(planMission).toContain('`design.md` 和 `decisions.xnl` 无条件创建');
  });

  it('keeps decision-tree rules in the shared protocol and defaults ordinary tracks to no fresh check', () => {
    const protocol = template('std/protocols/decision-tree.md');
    const questioning = template('std/protocols/questioning.md');
    const planTrack = template('std/actions/plan-track.md');

    expect(protocol).toContain('Decision-tree is the shared planning protocol');
    expect(questioning).toContain('Decision-tree structure, storage, and frontier handling are owned');
    expect(planTrack).toContain('也不默认挂 `HumanConfirm`、`AttractorCheck` 或 `GapLoop`');
    expect(planTrack).toContain('架构、安全或数据一致性高风险');
  });
});
