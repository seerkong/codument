import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { parseMissionResourceContent } from '../../src/cli/mission/resource';
import { validateMissionNode } from '../../src/cli/mission/validate';

const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'src', 'templates', 'codument', 'std');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(TEMPLATES_DIR, relativePath), 'utf-8');
}

function missionExamples(spec: string): string[] {
  return [...spec.matchAll(/```xnl\r?\n(<Mission[\s\S]*?)\r?\n```/g)].map((match) => match[1]);
}

describe('Mission ActorSet release templates', () => {
  it('keeps a canonical, validator-complete example in the Mission XNL spec', () => {
    const spec = read('spec/mission-xnl-spec.md');
    const examples = missionExamples(spec);

    expect(examples).toHaveLength(1);
    expect(examples.map((example) => validateMissionNode(
      parseMissionResourceContent(example, 'mission.xnl'),
    ).filter((finding) => finding.severity === 'error'))).toEqual([[]]);
    expect(spec).toContain('WorkspaceBinding');
    expect(spec).toContain('UNBOUND');
    expect(spec).toContain('MISSING');
    expect(spec).not.toContain('workspaces.xml');
  });

  it('keeps role protocol and full examples out of mission operations', () => {
    const planMission = read('operations/plan-mission.md');
    const implMission = read('operations/impl-mission.md');

    expect(planMission).toContain('std/spec/mission-xnl-spec.md');
    expect(implMission).toContain('std/spec/mission-xnl-spec.md');
    expect(planMission).not.toContain('<Mission id=');
    expect(implMission).not.toContain('<Mission id=');
    expect(planMission).toContain('design.md` 只记录');
    expect(implMission).toContain('其他 ready DAG branch 仍可执行');
  });
});
