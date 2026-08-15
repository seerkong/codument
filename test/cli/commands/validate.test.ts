import { expect, test } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const repoRoot = path.resolve(import.meta.dir, '../../..');
const cli = path.join(repoRoot, 'src/cli/index.ts');

function tmpWorkspace(): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-validate-'));
  fs.mkdirSync(path.join(ws, 'codument'), { recursive: true });
  return ws;
}

function writeTrack(ws: string, id: string, xml: string): void {
  const dir = path.join(ws, 'codument', 'tracks', 'active', id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'track.xml'), xml);
}

function writePendingTrack(ws: string, id: string, xml: string): void {
  const dir = path.join(ws, 'codument', 'tracks', 'pending', id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'track.xml'), xml);
}

async function runValidate(ws: string, args: string[] = []) {
  const proc = Bun.spawn(['bun', 'run', cli, 'validate', ...args], { cwd: ws, stdout: 'pipe', stderr: 'pipe' });
  const code = await proc.exited;
  const out = await new Response(proc.stdout).text();
  return { code, out };
}

const GOOD_TRACK = `<Track id="t1" version="1" xmlns:cdt="urn:codument:v1">
  <Metadata><Status>in_progress</Status></Metadata>
  <TaskSpace id="s" name="s">
    <SubNodes>
      <TaskGroup id="P1" name="p1" status="ACTIVE" order="0" cdt:child-mode="dag">
        <SubNodes>
          <Task id="T1.1" name="a" status="DONE" order="0"/>
          <Task id="T1.2" name="b" status="NOT_STARTED" order="1"/>
        </SubNodes>
      </TaskGroup>
    </SubNodes>
  </TaskSpace>
  <Schedule>
    <Dag for="P1"><Node id="T1.2"><After ref="T1.1"/></Node></Dag>
  </Schedule>
  <Hooks><Hook on="track:after"><cdt:GapLoop max-rounds="5" on-exhausted="block"/></Hook></Hooks>
</Track>`;

test('validate passes a well-formed track.xml + behavior delta', async () => {
  const ws = tmpWorkspace();
  writeTrack(ws, 't1', GOOD_TRACK);
  const deltaDir = path.join(ws, 'codument', 'tracks', 'active', 't1', 'behavior_deltas', 'cap');
  fs.mkdirSync(deltaDir, { recursive: true });
  fs.writeFileSync(path.join(deltaDir, 'delta.xml'),
    `<behavior-patch capability="cap" version="1"><upsert selector="behavior://cap/requirements/x"><requirement id="x"/></upsert></behavior-patch>`);

  const { code, out } = await runValidate(ws);
  expect(out).toContain('✓ t1');
  expect(code).toBe(0);
});

test('validate discovers a pending track without making it active', async () => {
  const ws = tmpWorkspace();
  writePendingTrack(ws, 'pending-track', GOOD_TRACK.replace('id="t1"', 'id="pending-track"'));

  const { code, out } = await runValidate(ws, ['pending-track']);
  expect(code).toBe(0);
  expect(out).toContain('✓ pending-track');
});

test('validate passes a cdt:GapLoop carrying verify-round', async () => {
  const ws = tmpWorkspace();
  writeTrack(ws, 'tvr',
    GOOD_TRACK.replace('id="t1"', 'id="tvr"')
      .replace('<cdt:GapLoop max-rounds="5" on-exhausted="block"/>',
        '<cdt:GapLoop max-rounds="5" on-exhausted="block" verify-round="true"/>'));
  const { code, out } = await runValidate(ws, ['tvr']);
  expect(out).toContain('✓ tvr');
  expect(code).toBe(0);
});

test('validate rejects a bad cdt:GapLoop verify-round value', async () => {
  const ws = tmpWorkspace();
  writeTrack(ws, 'tvr2',
    GOOD_TRACK.replace('id="t1"', 'id="tvr2"')
      .replace('<cdt:GapLoop max-rounds="5" on-exhausted="block"/>',
        '<cdt:GapLoop max-rounds="5" on-exhausted="block" verify-round="yes"/>'));
  const { code, out } = await runValidate(ws, ['tvr2']);
  expect(out).toContain('verify-round="yes"');
  expect(code).toBe(1);
});

test('validate rejects invalid QuestionSeverity metadata', async () => {
  const ws = tmpWorkspace();
  writeTrack(ws, 'tqs',
    GOOD_TRACK.replace('id="t1"', 'id="tqs"')
      .replace('<Metadata><Status>in_progress</Status></Metadata>',
        '<Metadata><Status>in_progress</Status><QuestionMode>decision-tree</QuestionMode><QuestionSeverity>chatty</QuestionSeverity></Metadata>'));
  const { code, out } = await runValidate(ws, ['tqs']);
  expect(out).toContain('<Metadata><QuestionSeverity>chatty</QuestionSeverity>');
  expect(code).toBe(1);
});

test('validate rejects a invalid task status', async () => {
  const ws = tmpWorkspace();
  writeTrack(ws, 't2', GOOD_TRACK.replace('id="t1"', 'id="t2"').replace('status="DONE"', 'status="TODO"'));
  const { code, out } = await runValidate(ws, ['t2']);
  expect(out).toContain('status="TODO"');
  expect(code).toBe(1);
});

test('validate rejects a bad Schedule DAG reference', async () => {
  const ws = tmpWorkspace();
  // After ref points at a non-existent sibling
  writeTrack(ws, 't3', GOOD_TRACK.replace('id="t1"', 'id="t3"').replace('<After ref="T1.1"/>', '<After ref="T9.9"/>'));
  const { code, out } = await runValidate(ws, ['t3']);
  expect(out).toContain('不是该层的直接下层');
  expect(code).toBe(1);
});

test('validate rejects a behavior-patch without behavior:// selector', async () => {
  const ws = tmpWorkspace();
  writeTrack(ws, 't4', GOOD_TRACK.replace('id="t1"', 'id="t4"'));
  const deltaDir = path.join(ws, 'codument', 'tracks', 'active', 't4', 'behavior_deltas', 'cap');
  fs.mkdirSync(deltaDir, { recursive: true });
  fs.writeFileSync(path.join(deltaDir, 'delta.xml'),
    `<behavior-patch capability="cap" version="1"><upsert selector="spec://cap/x"/></behavior-patch>`);

  const { code, out } = await runValidate(ws, ['t4']);
  expect(out).toContain('behavior://');
  expect(code).toBe(1);
});

test('validate passes the canonical track-xml-spec §4+§5 example fixture', async () => {
  const ws = tmpWorkspace();
  const xml = fs.readFileSync(path.join(repoRoot, 'test', 'resources', 'validate', 'track-spec-example.xml'), 'utf-8');
  writeTrack(ws, 'spec-example', xml);
  const { code, out } = await runValidate(ws, ['spec-example']);
  expect(out).toContain('✓ spec-example');
  expect(code).toBe(0);
});

test('validate rejects an illegal cdt:GapLoop on-exhausted value', async () => {
  const ws = tmpWorkspace();
  writeTrack(ws, 'ton',
    GOOD_TRACK.replace('id="t1"', 'id="ton"')
      .replace('<cdt:GapLoop max-rounds="5" on-exhausted="block"/>',
        '<cdt:GapLoop max-rounds="5" on-exhausted="whatever"/>'));
  const { code, out } = await runValidate(ws, ['ton']);
  expect(out).toContain('on-exhausted="whatever"');
  expect(out).toContain('gap-loop.on-exhausted-illegal');
  expect(code).toBe(1);
});

test('validate checks mission.xml status, hook, schedule, and reconcile rules', async () => {
  const ws = tmpWorkspace();
  const missionDir = path.join(ws, 'codument', 'missions', 'active', 'm1');
  fs.mkdirSync(missionDir, { recursive: true });
  fs.writeFileSync(path.join(missionDir, 'mission.xml'), `<Mission id="m1" xmlns:cdt="urn:codument:v1">
  <Metadata>
    <Status>active</Status>
    <Goal>mission fixture</Goal>
  </Metadata>
  <TaskSpace id="space_m1" name="m1" version="1" cdt:child-mode="dag">
    <SubNodes>
      <TaskGroup id="G1" name="g1" status="NOT_STARTED" order="0">
        <cdt:TrackLink state="candidate" id="some-track" project-ref="host"/>
        <SubNodes>
          <Task id="G1-T1" name="t" status="TODO" order="0"/>
        </SubNodes>
      </TaskGroup>
    </SubNodes>
  </TaskSpace>
  <Schedule>
    <Dag for="space_m1"><Node id="G1"/></Dag>
  </Schedule>
  <Hooks>
    <Hook on="mission:after-node"><cdt:MissionReconcile max-tracks="0" on-limit="bogus" on-drift="bogus"/></Hook>
    <Hook on="phase:weird"/>
  </Hooks>
</Mission>
`);

  const { code, out } = await runValidate(ws, ['m1']);
  expect(code).toBe(1);
  expect(out).toContain('mission.taskspace.status');        // status="TODO" 非法
  expect(out).toContain('mission.reconcile.max-tracks');    // max-tracks="0" 非法
  expect(out).toContain('mission.reconcile.on-limit');
  expect(out).toContain('mission.reconcile.on-drift');
  expect(out).toContain('mission.hook.on');                 // phase:weird 非法
  expect(out).toContain('mission.tracklink.group');         // TrackLink 挂在 TaskGroup 上
});

test('validate accepts a well-formed mission.xml', async () => {
  const ws = tmpWorkspace();
  const missionDir = path.join(ws, 'codument', 'missions', 'active', 'm2');
  fs.mkdirSync(missionDir, { recursive: true });
  fs.writeFileSync(path.join(missionDir, 'mission.xml'), `<Mission id="m2" xmlns:cdt="urn:codument:v1">
  <Metadata>
    <Status>active</Status>
    <Goal>mission fixture</Goal>
  </Metadata>
  <TaskSpace id="space_m2" name="m2" version="1" cdt:child-mode="dag">
    <SubNodes>
      <TaskGroup id="G1" name="g1" status="NOT_STARTED" order="0">
        <SubNodes>
          <Task id="G1-T1" name="t" status="NOT_STARTED" order="0">
            <cdt:TrackLink state="candidate" id="some-track" project-ref="host"/>
          </Task>
        </SubNodes>
      </TaskGroup>
    </SubNodes>
  </TaskSpace>
  <Schedule>
    <Dag for="space_m1"><Node id="G1"/></Dag>
  </Schedule>
  <Hooks>
    <Hook on="mission:after-node"><cdt:MissionReconcile max-tracks="10" on-limit="checkpoint" on-drift="replan-or-block"/></Hook>
  </Hooks>
</Mission>
`.replace('<Dag for="space_m1">', '<Dag for="space_m2">'));

  const { code, out } = await runValidate(ws, ['m2']);
  expect(out).toContain('✓ mission m2');
  expect(code).toBe(0);
});

test('validate rejects a track whose decisions.xnl has XNL syntax errors', async () => {
  const ws = tmpWorkspace();
  writeTrack(ws, 'tdec-bad', GOOD_TRACK.replace('id="t1"', 'id="tdec-bad"'));
  const dir = path.join(ws, 'codument', 'tracks', 'active', 'tdec-bad');
  fs.writeFileSync(path.join(dir, 'decisions.xnl'), `<decision #track.tdec.bad {
  status = "accepted"
}
(
  <question ?>q</?>
  <recommendation ?>r</tradeoff>
)>`);

  const { code, out } = await runValidate(ws, ['tdec-bad']);
  expect(code).toBe(1);
  expect(out).toContain('decisions.xnl');
  expect(out).toContain('XNL 文本块闭合应为');
});

test('validate passes a track with a valid decisions.xnl', async () => {
  const ws = tmpWorkspace();
  writeTrack(ws, 'tdec-ok', GOOD_TRACK.replace('id="t1"', 'id="tdec-ok"'));
  const dir = path.join(ws, 'codument', 'tracks', 'active', 'tdec-ok');
  fs.writeFileSync(path.join(dir, 'decisions.xnl'), `<decision #track.tdec.ok {
  status = "accepted"
}
(
  <question ?>q</?>
  <answer ?>a</?>
)>`);

  const { code, out } = await runValidate(ws, ['tdec-ok']);
  expect(code).toBe(0);
});

test('validate passes a track without decisions.xnl (no false positive)', async () => {
  const ws = tmpWorkspace();
  writeTrack(ws, 'tdec-none', GOOD_TRACK.replace('id="t1"', 'id="tdec-none"'));

  const { code, out } = await runValidate(ws, ['tdec-none']);
  expect(code).toBe(0);
});
