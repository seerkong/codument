import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const repoRoot = path.resolve(import.meta.dir, '../../..');
const cli = path.join(repoRoot, 'src/cli/index.ts');

function workspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-lifecycle-'));
  fs.mkdirSync(path.join(root, 'codument'), { recursive: true });
  return root;
}

async function run(ws: string, args: string[]): Promise<{ code: number; out: string; err: string }> {
  const proc = Bun.spawn(['bun', 'run', cli, '--workspace-dir', ws, ...args], {
    cwd: repoRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    code: await proc.exited,
    out: await new Response(proc.stdout).text(),
    err: await new Response(proc.stderr).text(),
  };
}

describe('resource lifecycle commands', () => {
  it('reuses workspace-bound verification receipts and invalidates them on content changes', async () => {
    const ws = workspace();
    expect((await run(ws, ['track', 'create', 'receipt-track', '--stage', 'active'])).code).toBe(0);
    const active = path.join(ws, 'codument', 'tracks', 'active', 'receipt-track', 'track.xnl');
    fs.writeFileSync(active, fs.readFileSync(active, 'utf8').replace(
      '  <Hooks []>',
      '  <Task #T1 { status = "ACTIVE" } (\n    <Acceptance [<Criterion #T1-AC1 { checked = false } ?>verified</?>]>\n  )>\n  <Hooks []>',
    ));
    fs.writeFileSync(path.join(ws, 'source.txt'), 'v1\n');
    const counter = path.join(ws, '.verification-count');
    const command = [
      'bun', '-e',
      `const f=${JSON.stringify(counter)}; const n=Number((await Bun.file(f).exists()) ? await Bun.file(f).text() : '0'); await Bun.write(f, String(n + 1));`,
    ];

    const first = await run(ws, ['track', 'verify', 'receipt-track', '--json', '--', ...command]);
    expect(first.code).toBe(0);
    expect(JSON.parse(first.out)).toMatchObject({ track: 'receipt-track', reused: false, exit_code: 0 });
    expect(fs.readFileSync(counter, 'utf8')).toBe('1');

    const reused = await run(ws, ['track', 'verify', 'receipt-track', '--json', '--', ...command]);
    expect(reused.code).toBe(0);
    expect(JSON.parse(reused.out)).toMatchObject({ id: JSON.parse(first.out).id, reused: true });
    expect(fs.readFileSync(counter, 'utf8')).toBe('1');

    fs.writeFileSync(path.join(ws, 'source.txt'), 'v2\n');
    const invalidated = await run(ws, ['track', 'verify', 'receipt-track', '--json', '--', ...command]);
    expect(invalidated.code).toBe(0);
    expect(JSON.parse(invalidated.out).reused).toBe(false);
    expect(fs.readFileSync(counter, 'utf8')).toBe('2');

    const fresh = await run(ws, ['track', 'verify', 'receipt-track', '--fresh', '--json', '--', ...command]);
    expect(fresh.code).toBe(0);
    expect(JSON.parse(fresh.out).reused).toBe(false);
    expect(fs.readFileSync(counter, 'utf8')).toBe('3');

    const completed = await run(ws, ['track', 'task', 'complete', 'receipt-track', 'T1', '--json', '--', ...command]);
    expect(completed.code).toBe(0);
    expect(JSON.parse(completed.out)).toMatchObject({
      to: 'DONE',
      verification: { reused: true, exit_code: 0 },
    });
    expect(fs.readFileSync(counter, 'utf8')).toBe('3');
  });

  it('atomically starts a pending Track and completes a verified Task', async () => {
    const ws = workspace();
    expect((await run(ws, ['track', 'create', 'lifecycle-track', '--stage', 'pending'])).code).toBe(0);
    const pending = path.join(ws, 'codument', 'tracks', 'pending', 'lifecycle-track', 'track.xnl');
    fs.writeFileSync(pending, fs.readFileSync(pending, 'utf8').replace(
      '  <Hooks []>',
      '  <Task #T1 { status = "NOT_STARTED" } (\n    <Acceptance [\n      <Criterion #T1-AC1 { checked = false } ?>verified</?>\n    ]>\n  )>\n  <Hooks []>',
    ));

    const started = await run(ws, ['track', 'transition', 'lifecycle-track', 'in_progress', '--json']);
    const active = path.join(ws, 'codument', 'tracks', 'active', 'lifecycle-track', 'track.xnl');
    expect(started.code).toBe(0);
    expect(fs.existsSync(pending)).toBe(false);
    expect(fs.readFileSync(active, 'utf8')).toContain('status = "in_progress"');

    const directDone = await run(ws, ['track', 'task', 'transition', 'lifecycle-track', 'T1', 'DONE']);
    expect(directDone.code).toBe(1);
    expect(directDone.err).toContain('must use `codument track task complete');

    const failed = await run(ws, ['track', 'task', 'complete', 'lifecycle-track', 'T1', '--', 'bun', '-e', 'process.exit(7)']);
    expect(failed.code).toBe(1);
    expect(fs.readFileSync(active, 'utf8')).toContain('<Task #T1 { status = "NOT_STARTED" }');
    expect(fs.readFileSync(active, 'utf8')).toContain('checked = false');

    const missing = await run(ws, ['track', 'task', 'complete', 'lifecycle-track', 'T1', '--', 'codument-command-that-does-not-exist']);
    expect(missing.code).toBe(1);
    expect(fs.readFileSync(active, 'utf8')).toContain('<Task #T1 { status = "NOT_STARTED" }');
    expect(fs.readFileSync(active, 'utf8')).toContain('checked = false');

    const task = await run(ws, ['track', 'task', 'complete', 'lifecycle-track', 'T1', '--json', '--', 'bun', '-e', 'console.log("verified")']);
    expect(task.code).toBe(0);
    expect(JSON.parse(task.out)).toMatchObject({
      id: 'lifecycle-track:T1',
      to: 'DONE',
      verification: { reused: false, exit_code: 0 },
    });
    expect(task.err).toContain('verified');
    expect(fs.readFileSync(active, 'utf8')).toContain('<Task #T1 { status = "DONE" } (');
    expect(fs.readFileSync(active, 'utf8')).toContain('checked = true');

    expect((await run(ws, ['track', 'gap-round', 'lifecycle-track', '2'])).code).toBe(0);
    expect(fs.readFileSync(active, 'utf8')).toContain('gap_round = 2');
  });

  it('requires verified Gate completion and rejects unchecked completed Tracks', async () => {
    const ws = workspace();
    expect((await run(ws, ['track', 'create', 'gated-track', '--stage', 'active'])).code).toBe(0);
    const active = path.join(ws, 'codument', 'tracks', 'active', 'gated-track', 'track.xnl');
    fs.writeFileSync(active, fs.readFileSync(active, 'utf8').replace(
      '    <SubNodes []>',
      `    <SubNodes [
      <TaskGroup #P1 { status = "ACTIVE" } (
        <SubNodes [
          <Task #P1-T1 { status = "ACTIVE" } (
            <Acceptance [<Criterion #P1-T1-AC1 { checked = false } ?>leaf</?>]>
          )>
        ]>
        <Gate [<Criterion #P1-G1 { checked = false } ?>gate</?>]>
      )>
    ]>`,
    ));

    const marker = path.join(ws, 'premature-verifier-ran');
    const blocked = await run(ws, [
      'track', 'task', 'complete', 'gated-track', 'P1', '--',
      'bun', '-e', `await Bun.write(${JSON.stringify(marker)}, 'ran')`,
    ]);
    expect(blocked.code).toBe(1);
    expect(fs.existsSync(marker)).toBe(false);

    expect((await run(ws, ['track', 'task', 'complete', 'gated-track', 'P1-T1', '--', 'bun', '-e', 'process.exit(0)'])).code).toBe(0);
    let content = fs.readFileSync(active, 'utf8');
    expect(content).toContain('<TaskGroup #P1 { status = "ACTIVE" }');
    expect(content).toContain('<Criterion #P1-G1 { checked = false }');

    const premature = await run(ws, ['track', 'transition', 'gated-track', 'completed']);
    expect(premature.code).toBe(1);
    expect(premature.err).toContain('unfinished tasks');

    expect((await run(ws, ['track', 'task', 'complete', 'gated-track', 'P1', '--', 'bun', '-e', 'process.exit(0)'])).code).toBe(0);
    content = fs.readFileSync(active, 'utf8');
    expect(content).toContain('<TaskGroup #P1 { status = "DONE" }');
    expect(content).toContain('<Criterion #P1-G1 { checked = true }');
    expect((await run(ws, ['track', 'transition', 'gated-track', 'completed'])).code).toBe(0);
  });

  it('rolls up parent TaskGroups without Gates after a child completes', async () => {
    const ws = workspace();
    expect((await run(ws, ['track', 'create', 'rollup-track', '--stage', 'active'])).code).toBe(0);
    const active = path.join(ws, 'codument', 'tracks', 'active', 'rollup-track', 'track.xnl');
    fs.writeFileSync(active, fs.readFileSync(active, 'utf8').replace(
      '    <SubNodes []>',
      `    <SubNodes [
      <TaskGroup #P1 { status = "ACTIVE" } (
        <SubNodes [<Task #P1-T1 { status = "ACTIVE" }>]>
      )>
    ]>`,
    ));

    expect((await run(ws, ['track', 'task', 'complete', 'rollup-track', 'P1-T1', '--', 'bun', '-e', 'process.exit(0)'])).code).toBe(0);
    expect(fs.readFileSync(active, 'utf8')).toContain('<TaskGroup #P1 { status = "DONE" }');
  });

  it('reports ready leaves and then the enclosing Gate group', async () => {
    const ws = workspace();
    expect((await run(ws, ['track', 'create', 'ready-track', '--stage', 'active'])).code).toBe(0);
    const active = path.join(ws, 'codument', 'tracks', 'active', 'ready-track', 'track.xnl');
    fs.writeFileSync(active, fs.readFileSync(active, 'utf8').replace(
      '    <SubNodes []>',
      `    <SubNodes [
      <TaskGroup #P1 { status = "ACTIVE" child_mode = "sequential" } (
        <SubNodes [
          <Task #P1-T1 { name = "first" status = "ACTIVE" }>
          <Task #P1-T2 { name = "second" status = "NOT_STARTED" }>
        ]>
        <Gate [<Criterion #P1-G1 { checked = false } ?>gate</?>]>
      )>
    ]>`,
    ));

    const first = await run(ws, ['track', 'ready', 'ready-track', '--json']);
    expect(JSON.parse(first.out).ready).toMatchObject([{ id: 'P1-T1', kind: 'Task', name: 'first' }]);
    expect((await run(ws, ['track', 'task', 'complete', 'ready-track', 'P1-T1', '--', 'bun', '-e', 'process.exit(0)'])).code).toBe(0);
    const second = await run(ws, ['track', 'ready', 'ready-track', '--json']);
    expect(JSON.parse(second.out).ready).toMatchObject([{ id: 'P1-T2', kind: 'Task', name: 'second' }]);
    expect((await run(ws, ['track', 'task', 'transition', 'ready-track', 'P1-T2', 'ACTIVE'])).code).toBe(0);
    expect((await run(ws, ['track', 'task', 'complete', 'ready-track', 'P1-T2', '--', 'bun', '-e', 'process.exit(0)'])).code).toBe(0);
    const gate = await run(ws, ['track', 'ready', 'ready-track', '--json']);
    expect(JSON.parse(gate.out).ready).toMatchObject([{ id: 'P1', kind: 'TaskGroup', criteria: { checked: 0, total: 1 } }]);
  });

  it('starts a Mission, binds a TrackLink, and increments revision', async () => {
    const ws = workspace();
    expect((await run(ws, ['mission', 'create', 'lifecycle-mission', '--stage', 'pending'])).code).toBe(0);
    expect((await run(ws, ['track', 'create', 'bound-track', '--stage', 'active'])).code).toBe(0);
    const pending = path.join(ws, 'codument', 'missions', 'pending', 'lifecycle-mission', 'mission.xnl');
    fs.writeFileSync(pending, fs.readFileSync(pending, 'utf8').replace(
      '  <Hooks []>',
      '  <Task #M1 { status = "NOT_STARTED" } (\n    <TrackLink #candidate { state = "candidate" }>\n  )>\n  <Hooks []>',
    ));

    expect((await run(ws, ['mission', 'transition', 'lifecycle-mission', 'active'])).code).toBe(0);
    const active = path.join(ws, 'codument', 'missions', 'active', 'lifecycle-mission', 'mission.xnl');
    const bound = await run(ws, ['mission', 'bind-track', 'lifecycle-mission', 'M1', 'bound-track']);
    const content = fs.readFileSync(active, 'utf8');
    expect(bound.code).toBe(0);
    expect(content).toContain('<TrackLink #bound-track { state = "bound" }>');
    expect(content).toContain('<Task #M1 { status = "ACTIVE" }');
    expect(content).toMatch(/revision = [23]/);
    expect(fs.readdirSync(path.join(path.dirname(active), 'reports'))).toHaveLength(1);
  });

  it('archives a terminal Mission through the CLI transaction', async () => {
    const ws = workspace();
    expect((await run(ws, ['mission', 'create', 'done-mission', '--stage', 'active'])).code).toBe(0);
    expect((await run(ws, ['mission', 'transition', 'done-mission', 'completed'])).code).toBe(0);

    const result = await run(ws, ['mission', 'archive', 'done-mission']);
    const archivedRoot = path.join(ws, 'codument', 'missions', 'archived');
    expect(result.code).toBe(0);
    const archived = fs.readdirSync(archivedRoot).find((entry) => entry.endsWith('-done-mission'));
    expect(archived).toBeDefined();
    expect(fs.readFileSync(path.join(archivedRoot, archived!, 'mission.xnl'), 'utf8')).toContain('status = "archived"');
  });
});
