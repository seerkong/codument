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
  const dir = path.join(ws, 'codument', 'tracks', id);
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
  const deltaDir = path.join(ws, 'codument', 'tracks', 't1', 'behavior_deltas', 'cap');
  fs.mkdirSync(deltaDir, { recursive: true });
  fs.writeFileSync(path.join(deltaDir, 'delta.xml'),
    `<behavior-patch capability="cap" version="1"><upsert selector="behavior://cap/requirements/x"><requirement id="x"/></upsert></behavior-patch>`);

  const { code, out } = await runValidate(ws);
  expect(out).toContain('✓ t1');
  expect(code).toBe(0);
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
  const deltaDir = path.join(ws, 'codument', 'tracks', 't4', 'behavior_deltas', 'cap');
  fs.mkdirSync(deltaDir, { recursive: true });
  fs.writeFileSync(path.join(deltaDir, 'delta.xml'),
    `<behavior-patch capability="cap" version="1"><upsert selector="spec://cap/x"/></behavior-patch>`);

  const { code, out } = await runValidate(ws, ['t4']);
  expect(out).toContain('behavior://');
  expect(code).toBe(1);
});
