import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  convertLegacyTrackXml,
  parseTrackResourceContent,
  resolveTrackAuthority,
} from '../../../src/cli/track/resource';

const legacyTrack = `<Track id="codec-example" version="1" xmlns:cdt="urn:codument:v1">
  <Metadata>
    <ApiVersion>codument.tech/v1alpha1</ApiVersion>
    <Status>in_progress</Status>
    <Goal>Exercise the Track codec.</Goal>
    <Description>Preserve structured semantics.</Description>
    <QuestionMode>decision-tree</QuestionMode>
    <QuestionSeverity>auto</QuestionSeverity>
    <CommitMode>manual</CommitMode>
    <CreatedAt>2026-08-15T00:00:00Z</CreatedAt>
    <UpdatedAt>2026-08-15T01:00:00Z</UpdatedAt>
  </Metadata>
  <Ports scope="track"><MaterialBundle role="input" name="source" domain="code" path="vfs://@/src/"/></Ports>
  <TaskSpace id="space_codec-example" name="codec-example" version="1" cdt:child-mode="dag"><SubNodes>
    <TaskGroup id="P1" name="codec" status="ACTIVE" order="0"><SubNodes>
      <Task id="T1.1" name="round trip" status="ACTIVE" order="0"><Description>Keep this text.</Description></Task>
    </SubNodes></TaskGroup>
    <TaskGroup id="P2" name="verify" status="NOT_STARTED" order="1"/>
  </SubNodes></TaskSpace>
  <Schedule><Dag for="space_codec-example"><Node id="P2"><After ref="P1"/></Node></Dag></Schedule>
  <Hooks><Hook on="phase:after"><cdt:GapLoop max-rounds="2" verify-round="true" on-exhausted="block"/></Hook></Hooks>
</Track>
`;

function child(node: ReturnType<typeof parseTrackResourceContent>, tag: string) {
  return node.children.find((item) => item.tag === tag);
}

describe('Track XNL resource codec', () => {
  it('converts legacy XML into canonical XNL without a Metadata wrapper', () => {
    const xnl = convertLegacyTrackXml(legacyTrack);

    expect(xnl).toContain('<Track #codec-example apiVersion="codument.tech/v1alpha1" version="1" {');
    expect(xnl).toContain('status = "in_progress"');
    expect(xnl).not.toContain('<Metadata');
    expect(xnl).toContain('<SubNodes [');
    expect(xnl).toContain('<TaskGroup #P1');
    expect(xnl).toContain('<Task { id = "T1.1"');
    expect(xnl).toContain('<Hooks [');
  });

  it('projects converted XNL into the same normalized Track tree', () => {
    const root = parseTrackResourceContent(convertLegacyTrackXml(legacyTrack), 'track.xnl');
    const metadata = child(root, 'Metadata');
    const taskSpace = child(root, 'TaskSpace');
    const schedule = child(root, 'Schedule');

    expect(root.tag).toBe('Track');
    expect(root.attrs.id).toBe('codec-example');
    expect(child(metadata!, 'Status')?.text).toBe('in_progress');
    expect(child(metadata!, 'Goal')?.text).toBe('Exercise the Track codec.');
    expect(taskSpace?.attrs).toMatchObject({ id: 'space_codec-example', 'cdt:child-mode': 'dag' });
    expect(taskSpace?.children[0]?.children[0]?.children[0]?.children[0]?.attrs.id).toBe('T1.1');
    expect(schedule?.children[0]?.tag).toBe('Dag');
    expect(schedule?.children[0]?.children[0]?.attrs.id).toBe('P2');
    expect(root.children.find((item) => item.tag === 'Hooks')?.children[0]?.children[0]).toMatchObject({
      tag: 'cdt:GapLoop',
      attrs: { 'max-rounds': '2', 'verify-round': 'true', 'on-exhausted': 'block' },
    });
  });

  it('prefers one authority and rejects track.xnl plus track.xml conflicts', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-track-authority-'));
    fs.writeFileSync(path.join(dir, 'track.xml'), legacyTrack);
    expect(resolveTrackAuthority(dir)).toMatchObject({ format: 'xml', fileName: 'track.xml' });

    fs.writeFileSync(path.join(dir, 'track.xnl'), convertLegacyTrackXml(legacyTrack));
    expect(() => resolveTrackAuthority(dir)).toThrow('multiple Track authority files');

    fs.rmSync(path.join(dir, 'track.xml'));
    expect(resolveTrackAuthority(dir)).toMatchObject({ format: 'xnl', fileName: 'track.xnl' });
  });
});
