import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const repoRoot = path.resolve(import.meta.dir, '../../..');
const cli = path.join(repoRoot, 'src/cli/index.ts');

function tmpWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-init-'));
}

function writeFile(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf-8');
}

describe('codument init', () => {
  it('adds codument analysis/report ignore rules when .gitignore already exists', async () => {
    const ws = tmpWorkspace();
    const skillsDir = path.join(ws, '.skills');
    writeFile(path.join(ws, '.gitignore'), 'node_modules\n');

    const proc = Bun.spawn([
      'bun',
      'run',
      cli,
      '--workspace-dir',
      ws,
      'init',
      '--skills-dir',
      skillsDir,
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();

    expect(err).toBe('');
    expect(code).toBe(0);
    expect(out).toContain('Codument initialized.');

    const gitignore = fs.readFileSync(path.join(ws, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('codument/**/analysis');
    expect(gitignore).toContain('codument/**/reports');
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'operations', 'impl-quick.md'))).toBe(true);
    expect(fs.existsSync(path.join(skillsDir, 'codument-impl-quick', 'SKILL.md'))).toBe(true);
  });

  it('installs Codex skills under the workspace-local .agents directory by default', async () => {
    const ws = tmpWorkspace();

    const proc = Bun.spawn([
      'bun',
      'run',
      cli,
      '--workspace-dir',
      ws,
      'init',
      '--agent',
      'codex',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();

    expect(err).toBe('');
    expect(code).toBe(0);
    expect(out).toContain('.agents/skills');
    expect(fs.existsSync(path.join(ws, '.agents', 'skills', 'codument-impl-quick', 'SKILL.md'))).toBe(true);
  });
});
