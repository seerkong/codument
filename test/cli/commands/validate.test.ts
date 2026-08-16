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

function writeXnlTrack(ws: string, id: string, xnl: string): void {
  const dir = path.join(ws, 'codument', 'tracks', 'active', id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'track.xnl'), xnl);
  fs.writeFileSync(path.join(dir, 'proposal.md'), '# Proposal\n');
  fs.writeFileSync(path.join(dir, 'design.md'), '# Design\n');
  const deltaDir = path.join(dir, 'behavior_deltas', 'validation');
  fs.mkdirSync(deltaDir, { recursive: true });
  fs.writeFileSync(path.join(deltaDir, 'delta.xnl'), `<BehaviorPatch #track.${id}.behavior_patch.validation apiVersion="codument.tech/v1alpha1" version="1" { capability = "validation" } (
    <Mutations [
      <Upsert { selector = "behavior://validation/requirements/${id}" } (<Requirement #${id}>)>
    ]>
  )>`);
}

function writeXnlMission(ws: string, id: string, xnl: string): void {
  const dir = path.join(ws, 'codument', 'missions', 'active', id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'mission.xnl'), xnl);
  fs.writeFileSync(path.join(dir, 'proposal.md'), '# Proposal\n');
  fs.writeFileSync(path.join(dir, 'design.md'), '# Design\n');
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

const GOOD_XNL_TRACK = `<Track #xnl-track apiVersion="codument.tech/v1alpha1" version="1" {
  status = "in_progress"
  goal = "Validate canonical XNL"
  description = "Exercise Track XNL validation"
  question_mode = "decision-tree"
  question_severity = "auto"
  commit_mode = "manual"
  created_at = "2026-08-15T10:00:00Z"
  updated_at = "2026-08-15T10:00:00Z"
} (
  <Ports { scope = "track" }>
  <TaskSpace #space_xnl-track { name = "xnl-track" version = "1" child_mode = "dag" } (
    <SubNodes [
      <TaskGroup #P1 { name = "Implement" status = "DONE" order = 0 }>
      <TaskGroup #P2 { name = "Verify" status = "NOT_STARTED" order = 1 }>
    ]>
  )>
  <Schedule [
    <Dag { for = "space_xnl-track" } [
      <Node #P2 [<After { ref = "P1" }>]>
    ]>
  ]>
  <Hooks []>
)>
`;

const GOOD_XNL_MISSION = `<Mission #xnl-mission apiVersion="codument.tech/v1alpha1" version="1" {
  status = "active"
  goal = "Validate canonical Mission XNL"
  description = "Exercise Mission XNL validation"
  question_mode = "decision-tree"
  question_severity = "auto"
  revision = 1
  created_at = "2026-08-15T10:00:00Z"
  updated_at = "2026-08-15T10:00:00Z"
} (
  <ProjectRefs [
    <ProjectRef #host { kind = "host" }>
  ]>
  <ActorSets { default = "default-loop" } [
    <ActorSet #default-loop [
      <Actor { role = "MissionPlanner" project_ref = "host" } (<Description ?>Plan.</?>)>
      <Actor { role = "MissionObserver" project_ref = "host" } (<Description ?>Observe.</?>)>
      <Actor { role = "MissionReconciler" project_ref = "host" } (<Description ?>Reconcile.</?>)>
      <Actor { role = "MissionApplier" project_ref = "host" } (<Description ?>Apply.</?>)>
    ]>
  ]>
  <TaskSpace #space_xnl-mission { name = "xnl-mission" version = "1" child_mode = "dag" } (
    <SubNodes [
      <TaskGroup #G1 { name = "Execute" status = "NOT_STARTED" order = 0 }>
    ]>
  )>
  <Hooks [
    <Hook { on = "mission:after-node" } (
      <MissionReconcile { max_tracks = 10 on_limit = "checkpoint" on_drift = "replan-or-block" }>
    )>
  ]>
)>
`;

test('validate passes a canonical versioned track.xnl with required files', async () => {
  const ws = tmpWorkspace();
  writeXnlTrack(ws, 'xnl-track', GOOD_XNL_TRACK);

  const { code, out } = await runValidate(ws, ['xnl-track']);
  expect(out).toContain('✓ xnl-track: track.xnl OK');
  expect(code).toBe(0);
});

test('validate rejects a completed Track with unchecked Acceptance or Gate criteria', async () => {
  const ws = tmpWorkspace();
  const track = `<Track #completed-unchecked apiVersion="codument.tech/v1alpha1" version="1" {
  status = "completed"
  goal = "Reject inconsistent completion"
  description = "A completed Track must have checked criteria"
  question_mode = "decision-tree"
  question_severity = "auto"
  commit_mode = "manual"
  created_at = "2026-08-16T00:00:00Z"
  updated_at = "2026-08-16T00:00:00Z"
} (
  <Ports { scope = "track" }>
  <TaskSpace #space_completed-unchecked { name = "completed-unchecked" version = "1" } (
    <SubNodes [
      <TaskGroup #P1 { name = "phase" status = "DONE" order = 0 } (
        <SubNodes [
          <Task #P1-T1 { name = "task" status = "DONE" order = 0 } (
            <Acceptance [<Criterion #P1-T1-AC1 { checked = false } ?>unchecked</?>]>
          )>
        ]>
        <Gate [<Criterion #P1-G1 { checked = false } ?>unchecked gate</?>]>
      )>
    ]>
  )>
  <Schedule []>
  <Hooks []>
)>`;
  writeXnlTrack(ws, 'completed-unchecked', track);

  const { code, out } = await runValidate(ws, ['completed-unchecked', '--strict']);
  expect(code).toBe(1);
  expect(out).toContain('track.lifecycle.completed-criteria');
  expect(out).toContain('P1-T1-AC1');
  expect(out).toContain('P1-G1');
});

test('validate rejects track.xnl missing its Kind required files', async () => {
  const ws = tmpWorkspace();
  writeXnlTrack(ws, 'xnl-track', GOOD_XNL_TRACK);
  fs.rmSync(path.join(ws, 'codument', 'tracks', 'active', 'xnl-track', 'design.md'));

  const { code, out } = await runValidate(ws, ['xnl-track']);
  expect(out).toContain('Track Kind required file is missing: design.md');
  expect(code).toBe(1);
});

test('validate passes a canonical versioned mission.xnl with required files', async () => {
  const ws = tmpWorkspace();
  writeXnlMission(ws, 'xnl-mission', GOOD_XNL_MISSION);

  const { code, out } = await runValidate(ws, ['xnl-mission']);
  expect(out).toContain('✓ mission xnl-mission: mission.xnl OK');
  expect(code).toBe(0);
});

test('validate rejects mission.xnl with missing required root fields or invalid timestamps', async () => {
  const ws = tmpWorkspace();
  writeXnlMission(
    ws,
    'xnl-mission',
    GOOD_XNL_MISSION
      .replace('  description = "Exercise Mission XNL validation"\n', '')
      .replace('created_at = "2026-08-15T10:00:00Z"', 'created_at = "not-a-date"'),
  );

  const { code, out } = await runValidate(ws, ['xnl-mission']);
  expect(out).toContain('mission.root.description');
  expect(out).toContain('mission.root.created-at');
  expect(code).toBe(1);
});

test('validate reports malformed mission.xnl as a finding instead of throwing', async () => {
  const ws = tmpWorkspace();
  writeXnlMission(ws, 'xnl-mission', '<Mission #xnl-mission (');

  const { code, out } = await runValidate(ws, ['xnl-mission']);
  expect(out).toContain('mission.parse');
  expect(out).toContain('Mission 格式错误');
  expect(code).toBe(1);
});

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

test('validate passes a canonical versioned BehaviorPatch XNL', async () => {
  const ws = tmpWorkspace();
  writeTrack(ws, 'xnl-patch', GOOD_TRACK.replace('id="t1"', 'id="xnl-patch"'));
  const deltaDir = path.join(ws, 'codument', 'tracks', 'active', 'xnl-patch', 'behavior_deltas', 'cap');
  fs.mkdirSync(deltaDir, { recursive: true });
  fs.writeFileSync(path.join(deltaDir, 'delta.xnl'), `<BehaviorPatch #track.xnl-patch.behavior_patch.cap apiVersion="codument.tech/v1alpha1" version="1" { capability = "cap" } (
    <Mutations [
      <Upsert { selector = "behavior://cap/requirements/x" } (<Requirement #x>)>
    ]>
  )>`);

  const { code, out } = await runValidate(ws, ['xnl-patch']);
  expect(out).toContain('✓ xnl-patch');
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

test('validate rejects duplicate root and phase GapLoop hooks', async () => {
  const ws = tmpWorkspace();
  writeTrack(ws, 'duplicate-gap', GOOD_TRACK
    .replace('id="t1"', 'id="duplicate-gap"')
    .replace('</TaskGroup>', '<Hooks><Hook on="phase:after"><cdt:GapLoop max-rounds="2"/></Hook></Hooks></TaskGroup>'));

  const { code, out } = await runValidate(ws, ['duplicate-gap']);
  expect(out).toContain('track.hook.gap-loop-duplicate');
  expect(code).toBe(1);
});

test('validate checks task priority and Schedule concurrency attributes', async () => {
  const ws = tmpWorkspace();
  const invalid = GOOD_XNL_TRACK
    .replace('status = "DONE"', 'status = "DONE" priority = "urgent"')
    .replace('<Schedule [', '<Schedule { max_concurrent = 0 spot_check = "sometimes" } [');
  writeXnlTrack(ws, 'xnl-track', invalid);

  const { code, out } = await runValidate(ws, ['xnl-track']);
  expect(out).toContain('track.task.priority');
  expect(out).toContain('track.schedule.max-concurrent');
  expect(out).toContain('track.schedule.spot-check');
  expect(code).toBe(1);
});

test('validate checks Behavior registry and KnowledgeHint structure', async () => {
  const ws = tmpWorkspace();
  const behaviorDir = path.join(ws, 'codument', 'behaviors');
  fs.mkdirSync(behaviorDir, { recursive: true });
  fs.writeFileSync(path.join(behaviorDir, 'orders.xnl'), `<Behavior #orders apiVersion="codument.tech/v1alpha1" version="1" (
    <Requirements [
      <Requirement #place (
        <Statement ?>Place an order.</?>
        <KnowledgeHint { target = "docs-profile" href = "vfs://@/codument/modeling/domain/orders/" strength = "hint" }>
      )>
    ]>
  )>`);

  const passed = await runValidate(ws, ['orders']);
  expect(passed.out).toContain('✓ behavior orders: orders.xnl OK');
  expect(passed.code).toBe(0);

  const file = path.join(behaviorDir, 'orders.xnl');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('target = "docs-profile"', 'target = "hard-dependency"'));
  const failed = await runValidate(ws, ['orders']);
  expect(failed.out).toContain('behavior.knowledge-hint.target');
  expect(failed.code).toBe(1);
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
  fs.writeFileSync(path.join(dir, 'decisions.xnl'), `<decision #track.tdec.ok apiVersion="codument.tech/v1alpha1" {
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

test('validate rejects a legacy DecisionTree wrapper in track planning analysis', async () => {
  const ws = tmpWorkspace();
  writeTrack(ws, 'tdec-analysis-bad', GOOD_TRACK.replace('id="t1"', 'id="tdec-analysis-bad"'));
  const analysisDir = path.join(ws, 'codument', 'tracks', 'active', 'tdec-analysis-bad', 'analysis');
  fs.mkdirSync(analysisDir, { recursive: true });
  fs.writeFileSync(path.join(analysisDir, 'decision-tree.xnl'), `<DecisionTree #track.tdec-analysis-bad.planning apiVersion="codument.tech/v1alpha1" {
  status = "resolved"
} [
  <Assumption #architecture { value = "modular-monolith" }>
]>`);

  const { code, out } = await runValidate(ws, ['tdec-analysis-bad', '--strict']);
  expect(code).toBe(1);
  expect(out).toContain('analysis/decision-tree.xnl');
  expect(out).toContain('decision forest top-level roots must use <decision>');
});

test('validate accepts a decision forest in track planning analysis', async () => {
  const ws = tmpWorkspace();
  writeTrack(ws, 'tdec-analysis-ok', GOOD_TRACK.replace('id="t1"', 'id="tdec-analysis-ok"'));
  const analysisDir = path.join(ws, 'codument', 'tracks', 'active', 'tdec-analysis-ok', 'analysis');
  fs.mkdirSync(analysisDir, { recursive: true });
  fs.writeFileSync(path.join(analysisDir, 'decision-tree.xnl'), `<decision #track.tdec-analysis-ok.architecture apiVersion="codument.tech/v1alpha1" {
  status = "accepted"
}
(
  <question ?>Which architecture should be used?</?>
  <answer { }
  (
    <raw-answer ?>Use a modular monolith.</?>
    <decision-text ?>Use a modular monolith.</?>
    <rationale ?>It matches the current delivery scope.</?>
    <evidence ?>The workspace has one deployable service.</?>
  )>
)>`);

  const { code, out } = await runValidate(ws, ['tdec-analysis-ok', '--strict']);
  expect(code).toBe(0);
  expect(out).toContain('✓ tdec-analysis-ok');
});

test('validate rejects a legacy DecisionTree wrapper in mission planning analysis', async () => {
  const ws = tmpWorkspace();
  writeXnlMission(ws, 'mdec-analysis-bad', GOOD_XNL_MISSION.replaceAll('xnl-mission', 'mdec-analysis-bad'));
  const analysisDir = path.join(ws, 'codument', 'missions', 'active', 'mdec-analysis-bad', 'analysis');
  fs.mkdirSync(analysisDir, { recursive: true });
  fs.writeFileSync(path.join(analysisDir, 'decision-tree.xnl'), `<DecisionTree #mission.mdec-analysis-bad.planning apiVersion="codument.tech/v1alpha1" {
  status = "resolved"
}>`);

  const { code, out } = await runValidate(ws, ['mdec-analysis-bad', '--strict']);
  expect(code).toBe(1);
  expect(out).toContain('analysis/decision-tree.xnl');
  expect(out).toContain('decision forest top-level roots must use <decision>');
});
