import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');

function template(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, 'src', 'templates', 'codument', ...relativePath.split('/')), 'utf-8');
}

describe('topological decision questioning templates', () => {
  it('defines a dependency-aware topological frontier in the shared protocol', () => {
    const protocol = template('std/protocols/decision-tree.md');

    expect(protocol).toContain('## Decision Forest And Dependencies');
    expect(protocol).toContain('depends_on = ["decision-id" ...]');
    expect(protocol).toContain('## Topological Question Batches');
    expect(protocol).toContain('Find every pending decision whose parent and every `depends_on` target are resolved');
    expect(protocol).toContain('Do not descend one root while another ready root remains unasked');
    expect(protocol).toContain('Recompute the graph; newly unlocked children join the next batch');
    expect(protocol).toContain('## Conditional Decision Activation');
    expect(protocol).toContain('`activation` says which selected values make a candidate decision applicable');
    expect(protocol).toContain('`derived_from` is written when the node is materialized');
    expect(protocol).toContain('same-level peer');
    expect(protocol).toContain('all = [');
    expect(protocol).toContain('mission.example.deployment=self_hosted');
    expect(protocol).toContain('mission.example.compliance=regulated');
    expect(protocol).toContain('mission.example.key_management');
    expect(protocol).toContain('evaluate declared activation rules using resolved answers');
  });

  it('routes track and mission planning through one bounded ready batch', () => {
    const questioning = template('std/protocols/questioning.md');
    const planTrack = template('std/actions/plan-track.md');
    const planMission = template('std/actions/plan-mission.md');

    expect(questioning).toContain('### ask-multi-question-closed');
    expect(planTrack).toContain('计算当前拓扑 ready set 并一次询问该批次');
    expect(planTrack).toContain('不得为单独确认 id 打断其他独立问题');
    expect(planTrack).toContain('不做逐产物确认');
    expect(planMission).toContain('一次询问整个 ready batch');
    expect(planMission).toContain('Dependency Graph、Topological Ready Batch');
  });
});
