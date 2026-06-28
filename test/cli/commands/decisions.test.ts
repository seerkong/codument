import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const repoRoot = path.resolve(import.meta.dir, '../../..');
const cli = path.join(repoRoot, 'src/cli/index.ts');

function tmpWorkspace(): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-decisions-'));
  fs.mkdirSync(path.join(ws, 'codument', 'tracks'), { recursive: true });
  return ws;
}

function writeDecisionFile(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf-8');
}

async function runDecisions(ws: string, args: string[]) {
  const proc = Bun.spawn(['bun', 'run', cli, 'decisions', 'validate', ...args], {
    cwd: ws,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const code = await proc.exited;
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  return { code, out, err };
}

describe('codument decisions validate', () => {
  it('passes accepted decisions with durable metadata', async () => {
    const ws = tmpWorkspace();
    const file = path.join(ws, 'decisions.md');
    writeDecisionFile(file, `# Decisions

### 1. Accepted decision
- Blocks: implementation
- Evidence: user request and local code
- Confidence: 0.9
- Reversibility: moderate
- Durable candidate: yes
- 状态：accepted
`);

    const { code, out } = await runDecisions(ws, [file]);
    expect(code).toBe(0);
    expect(out).toContain('no issues');
  });

  it('fails pending decisions', async () => {
    const ws = tmpWorkspace();
    const file = path.join(ws, 'decisions.md');
    writeDecisionFile(file, `# Decisions

### 1. Pending decision
- Blocks: track.xml
- Durable candidate: no
- 状态：pending
`);

    const { code, out } = await runDecisions(ws, [file]);
    expect(code).toBe(1);
    expect(out).toContain('[error] 1. Pending decision: decision is still pending');
  });

  it('warns but succeeds when durable metadata is incomplete', async () => {
    const ws = tmpWorkspace();
    const file = path.join(ws, 'decisions.md');
    writeDecisionFile(file, `# Decisions

### 1. Durable but incomplete
- Blocks: none
- Evidence: -
- Confidence:
- Reversibility: -
- Durable candidate: yes
- Status: accepted
`);

    const { code, out } = await runDecisions(ws, [file]);
    expect(code).toBe(0);
    expect(out).toContain('[warning] 1. Durable but incomplete: durable candidate is missing Evidence');
    expect(out).toContain('[warning] 1. Durable but incomplete: durable candidate is missing Confidence');
    expect(out).toContain('[warning] 1. Durable but incomplete: durable candidate is missing Reversibility');
  });

  it('resolves a track id to codument/tracks/<id>/decisions.md', async () => {
    const ws = tmpWorkspace();
    writeDecisionFile(path.join(ws, 'codument', 'tracks', 'add-sample', 'decisions.md'), `# Decisions

### 1. Accepted decision
- Blocks: none
- Durable candidate: no
- Status: accepted
`);

    const { code, out } = await runDecisions(ws, ['add-sample']);
    expect(code).toBe(0);
    expect(out).toContain(path.join('codument', 'tracks', 'add-sample', 'decisions.md'));
  });
});
