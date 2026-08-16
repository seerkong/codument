import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  convertLegacyMissionXml,
  parseMissionResourceContent,
  resolveMissionAuthority,
} from '../../../src/cli/mission/resource';

const legacyMission = `<Mission id="mission-codec" version="1" xmlns:cdt="urn:codument:v1">
  <Metadata><ApiVersion>codument.tech/v1alpha1</ApiVersion><Status>active</Status><Goal>Exercise codec.</Goal><Description>Preserve mission semantics.</Description><QuestionMode>decision-tree</QuestionMode><QuestionSeverity>auto</QuestionSeverity><Revision>2</Revision><CreatedAt>2026-08-15T00:00:00Z</CreatedAt><UpdatedAt>2026-08-15T01:00:00Z</UpdatedAt></Metadata>
  <cdt:ProjectRefs><cdt:ProjectRef id="host" kind="host"/></cdt:ProjectRefs>
  <TaskSpace id="space_mission-codec" name="mission-codec" version="1" cdt:child-mode="dag"><SubNodes>
    <TaskGroup id="G1" name="work" status="ACTIVE" order="0"><SubNodes><Task id="G1-T1" name="operation" status="ACTIVE" order="0"><cdt:TrackLink state="bound" id="child-track" project-ref="host"/></Task></SubNodes></TaskGroup>
  </SubNodes></TaskSpace>
  <Schedule/><Hooks><Hook on="mission:after-node"><cdt:MissionReconcile max-tracks="10" on-limit="checkpoint" on-drift="replan-or-block"/></Hook></Hooks>
</Mission>`;

describe('Mission XNL resource codec', () => {
  it('converts XML metadata and cdt extensions into canonical XNL channels', () => {
    const xnl = convertLegacyMissionXml(legacyMission);

    expect(xnl).toContain('<Mission #mission-codec apiVersion="codument.tech/v1alpha1" version="1" {');
    expect(xnl).toContain('revision = 2');
    expect(xnl).toContain('<ProjectRefs [');
    expect(xnl).toContain('<TrackLink #child-track');
    expect(xnl).not.toContain('<Metadata');
    expect(xnl).not.toContain('cdt:');
  });

  it('projects Mission XNL back into the validator normalized tree', () => {
    const root = parseMissionResourceContent(convertLegacyMissionXml(legacyMission), 'mission.xnl');

    expect(root.tag).toBe('Mission');
    expect(root.attrs).toMatchObject({ id: 'mission-codec', 'xmlns:cdt': 'urn:codument:v1' });
    expect(root.children.find((node) => node.tag === 'Metadata')?.children.find((node) => node.tag === 'Revision')?.text).toBe('2');
    expect(root.children.flatMap((node) => node.children).some((node) => node.tag === 'cdt:ProjectRef')).toBe(true);
  });

  it('rejects mission.xnl plus mission.xml authority conflicts', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-mission-authority-'));
    fs.writeFileSync(path.join(dir, 'mission.xml'), legacyMission);
    fs.writeFileSync(path.join(dir, 'mission.xnl'), convertLegacyMissionXml(legacyMission));
    expect(() => resolveMissionAuthority(dir)).toThrow('multiple Mission authority files');
  });
});
