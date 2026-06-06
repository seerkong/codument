import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('codument init --agent', () => {
  it('initializes without interactive agent or project prompts', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const workspaceDir = makeTempDir('codument-init-ws-');
    const homeDir = makeTempDir('codument-init-home-');

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      workspaceDir,
      'init',
      '--agent=claude,codeflicker,codex',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        HOME: homeDir,
      },
    });

    const exitCode = await proc.exited;
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();

    expect(exitCode).toBe(0);
    expect(err).toBe('');
    expect(out).not.toContain('请选择要支持的 CLI 工具');
    expect(out).not.toContain('项目名称: ');
    expect(out).not.toContain('项目描述: ');

    const projectMd = fs.readFileSync(path.join(workspaceDir, 'codument', 'attractors', 'project.md'), 'utf-8');
    const productMd = fs.readFileSync(path.join(workspaceDir, 'codument', 'attractors', 'product.md'), 'utf-8');
    const state = JSON.parse(fs.readFileSync(path.join(workspaceDir, 'codument', 'state.json'), 'utf-8')) as {
      cli_tools: string[];
    };

    expect(projectMd).toContain(`# ${path.basename(workspaceDir)}`);
    expect(productMd).toContain(`# ${path.basename(workspaceDir)} - 产品定义`);
    expect(state.cli_tools).toEqual(['claude', 'codeflicker', 'codex']);
    expect(fs.existsSync(path.join(workspaceDir, 'codument', 'config', 'feature.json'))).toBe(true);
    expect(fs.readFileSync(path.join(workspaceDir, 'codument', 'config', 'feature.json'), 'utf-8')).not.toContain('"targets"');
    expect(fs.existsSync(path.join(workspaceDir, 'codument', 'config', 'attractor-profiles.json'))).toBe(false);
    expect(fs.existsSync(path.join(workspaceDir, 'codument', 'decisions'))).toBe(true);
    expect(fs.existsSync(path.join(workspaceDir, 'codument', 'memory'))).toBe(false);
    expect(fs.existsSync(path.join(workspaceDir, 'codument', 'std', 'docs-modeling-fractal', 'index.md'))).toBe(true);
    expect(fs.existsSync(path.join(workspaceDir, 'codument', 'std', 'docs-impl-fractal', 'index.md'))).toBe(true);
    expect(fs.readFileSync(path.join(workspaceDir, 'codument', 'std', 'docs-modeling-fractal', 'index.md'), 'utf-8')).toContain('docs/modeling/');
    expect(fs.readFileSync(path.join(workspaceDir, 'codument', 'std', 'docs-impl-fractal', 'index.md'), 'utf-8')).toContain('docs/impl/');
    expect(fs.existsSync(path.join(workspaceDir, 'codument', 'attractors', 'docs-knowledge.md'))).toBe(false);
    expect(fs.existsSync(path.join(workspaceDir, 'codument', 'tech-stack.md'))).toBe(false);
    expect(fs.existsSync(path.join(workspaceDir, '.claude', 'skills', 'codument-workflow'))).toBe(false);
    expect(fs.existsSync(path.join(workspaceDir, '.claude', 'skills', 'codument'))).toBe(false);
    expect(fs.existsSync(path.join(workspaceDir, '.claude', 'skills', 'codument-init', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(workspaceDir, '.codeflicker', 'skills', 'codument-workflow'))).toBe(false);
    expect(fs.existsSync(path.join(workspaceDir, '.codeflicker', 'skills', 'codument'))).toBe(false);
    expect(fs.existsSync(path.join(workspaceDir, '.codeflicker', 'commands', 'codument', 'gap-loop.md'))).toBe(true);
    expect(fs.existsSync(path.join(homeDir, '.codex', 'skills', 'codument-workflow'))).toBe(false);
    expect(fs.existsSync(path.join(homeDir, '.codex', 'skills', 'codument'))).toBe(false);
    expect(fs.existsSync(path.join(homeDir, '.codex', 'skills', 'codument-gap-loop', 'SKILL.md'))).toBe(true);
  });

  it('rejects unsupported agent ids', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const workspaceDir = makeTempDir('codument-init-invalid-ws-');

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      workspaceDir,
      'init',
      '--agent=codex,unknown',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();

    expect(exitCode).toBe(1);
    expect(out).toBe('');
    expect(err).toContain('Unsupported --agent value(s): unknown');
    expect(fs.existsSync(path.join(workspaceDir, 'codument'))).toBe(false);
  });
});
