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
    expect(protocol).toContain('codument decisions frontier <file> --json');
    expect(protocol).toContain('Let the CLI validate dependencies, parent readiness and cycles');
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
    expect(protocol).toContain('retain each CLI-generated `apiVersion`');
    expect(protocol).toContain('evaluate declared activation rules using resolved answers');
  });

  it('routes track and mission planning through one bounded ready batch', () => {
    const questioning = template('std/protocols/questioning.md');
    const planTrack = template('std/operations/plan-track.md');
    const planMission = template('std/operations/plan-mission.md');

    expect(questioning).toContain('### ask-multi-question-closed');
    expect(planTrack).toContain('codument decisions frontier <file> --json');
    expect(planTrack).toContain('不做逐产物确认');
    expect(planMission).toContain('codument decisions create <mission-dir>/analysis/decision-tree.xnl <decision-id>');
    expect(planMission).toContain('codument decisions frontier <file> --json');
    expect(planMission).toContain('按 CLI 返回的 ready batch 继续');
  });
});
