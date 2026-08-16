import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const repoRoot = path.resolve(import.meta.dir, '..', '..');

describe('compiled packaged resources', () => {
  it('initializes an empty workspace without the source template tree', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-compiled-resources-'));
    const binary = path.join(root, 'bin', 'codument');
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(path.dirname(binary), { recursive: true });
    fs.mkdirSync(workspace, { recursive: true });

    const build = Bun.spawn([
      'bun',
      'run',
      'scripts/build.ts',
      `--outfile=${binary}`,
    ], { cwd: repoRoot, stdout: 'pipe', stderr: 'pipe' });
    const buildCode = await build.exited;
    const buildError = await new Response(build.stderr).text();
    expect(buildCode, buildError).toBe(0);

    const init = Bun.spawn([
      binary,
      '--workspace-dir',
      workspace,
      'init',
      '--agent=codex',
    ], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
    const initCode = await init.exited;
    const initError = await new Response(init.stderr).text();
    expect(initCode, initError).toBe(0);
    expect(fs.existsSync(path.join(workspace, 'codument', 'std', 'operations', 'impl-track.md'))).toBe(true);
    expect(fs.existsSync(path.join(workspace, 'codument', 'std', 'kinds', 'KindDefinitions', 'Track', 'manifest.xnl'))).toBe(true);
    expect(fs.existsSync(path.join(workspace, '.agents', 'skills', 'codument-impl-track', 'SKILL.md'))).toBe(true);
  }, 30_000);
});
