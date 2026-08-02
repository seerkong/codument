import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { validateMissionXml } from '../../src/cli/mission/validate';

const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'src', 'templates', 'codument', 'std');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(TEMPLATES_DIR, relativePath), 'utf-8');
}

function missionExamples(spec: string): string[] {
  return [...spec.matchAll(/```xml\r?\n(<Mission[\s\S]*?<\/Mission>)\r?\n```/g)].map((match) => match[1]);
}

describe('Mission ActorSet release templates', () => {
  it('keeps the two canonical, validator-complete examples in the Mission XML spec', () => {
    const spec = read('spec/mission-xml-spec.md');
    const examples = missionExamples(spec);

    expect(examples).toHaveLength(2);
    expect(examples.map((example) => validateMissionXml(example)
      .filter((finding) => finding.severity === 'error'))).toEqual([[], []]);
    expect(spec).toContain('WorkspaceBinding');
    expect(spec).toContain('UNBOUND');
    expect(spec).toContain('MISSING');
    expect(spec).not.toContain('workspaces.xml');
  });

  it('keeps role protocol and full examples out of mission actions', () => {
    const planMission = read('actions/plan-mission.md');
    const implMission = read('actions/impl-mission.md');

    expect(planMission).toContain('std/spec/mission-xml-spec.md');
    expect(implMission).toContain('std/spec/mission-xml-spec.md');
    expect(planMission).not.toContain('<Mission id=');
    expect(implMission).not.toContain('<Mission id=');
    expect(planMission).toContain('design.md` 只记录');
    expect(implMission).toContain('其他 ready DAG branch 仍可执行');
  });
});
