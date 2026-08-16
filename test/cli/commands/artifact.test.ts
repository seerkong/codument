import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const repoRoot = path.resolve(import.meta.dir, '../../..');
const cli = path.join(repoRoot, 'src/cli/index.ts');

async function run(cwd: string, args: string[]) {
  const proc = Bun.spawn(['bun', 'run', cli, ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  return {
    code: await proc.exited,
    out: await new Response(proc.stdout).text(),
    err: await new Response(proc.stderr).text(),
  };
}

describe('codument artifact sync', () => {
  it('plans, detects conflicts, and applies an explicit overwrite', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-artifact-'));
    const source = path.join(root, 'staging');
    const target = path.join(root, 'target');
    fs.mkdirSync(source, { recursive: true });
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(source, 'guide.md'), 'new\n');
    fs.writeFileSync(path.join(target, 'guide.md'), 'old\n');

    const dryRun = await run(root, ['artifact', 'sync', '--source', source, '--target', target, '--dry-run', '--json']);
    expect(dryRun.code).toBe(0);
    expect(JSON.parse(dryRun.out).status).toBe('dry-run');
    expect(fs.readFileSync(path.join(target, 'guide.md'), 'utf8')).toBe('old\n');

    const conflict = await run(root, ['artifact', 'sync', '--source', source, '--target', target, '--json']);
    expect(conflict.code).toBe(2);
    expect(JSON.parse(conflict.out).status).toBe('conflict');

    const applied = await run(root, ['artifact', 'sync', '--source', source, '--target', target, '--force', '--json']);
    expect(applied.code).toBe(0);
    expect(JSON.parse(applied.out).status).toBe('synced');
    expect(fs.readFileSync(path.join(target, 'guide.md'), 'utf8')).toBe('new\n');
  });
});
