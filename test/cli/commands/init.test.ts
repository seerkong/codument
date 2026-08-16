import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const repoRoot = path.resolve(import.meta.dir, '../../..');
const cli = path.join(repoRoot, 'src/cli/index.ts');
const decisionMigrationReference = path.join(
  'codument-migrate',
  'references',
  'decision-migration.md',
);
const decisionMigrationTemplate = fs.readFileSync(
  path.join(repoRoot, 'src', 'templates', 'skills', decisionMigrationReference),
  'utf-8',
);

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
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'commands', 'upgrade-workspace.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'protocols', 'decision-tree.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'methods', 'workflow.md'))).toBe(true);
    expect(fs.readFileSync(path.join(ws, 'codument', 'std', 'kinds', 'KindDefinitions', 'Decision', 'manifest.xnl'), 'utf8'))
      .toContain('documentCardinality = "many"');
    expect(fs.existsSync(path.join(ws, 'codument', 'config', 'operation-hooks.xnl'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'config', 'action-hooks.xml'))).toBe(false);
    expect(fs.existsSync(path.join(ws, 'codument', 'tracks', 'pending', 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'tracks', 'active', 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'tracks', 'archived', 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(skillsDir, 'codument-impl-quick', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(skillsDir, 'codument-maintain-track', 'SKILL.md'))).toBe(true);
    expect(fs.readFileSync(path.join(skillsDir, decisionMigrationReference), 'utf-8'))
      .toBe(decisionMigrationTemplate);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'root-agents.md'))).toBe(false);
    const agents = fs.readFileSync(path.join(ws, 'AGENTS.md'), 'utf-8');
    expect(agents).toContain('在 Codument 工具内部上下文中，`@` 一般表示当前项目的项目级根目录');
    expect(agents).toContain('@/codument/std/AGENTS.md');
    expect(agents).toContain('唯一的 Codument 工作流与路由真源');
    expect(agents).toContain('产品方向吸引子：`@/codument/attractors/product.md`');
    expect(agents).toContain('项目实现吸引子：`@/codument/attractors/project.md`');
    expect(agents).not.toContain('快速路由：');
    const claude = fs.readFileSync(path.join(ws, 'CLAUDE.md'), 'utf-8');
    expect(claude).toContain('在 Codument 工具内部上下文中，`@` 一般表示当前项目的项目级根目录');
    expect(claude).toContain('@/codument/std/AGENTS.md');
    expect(claude.match(/<!-- codument:begin -->/g)).toHaveLength(1);
    const productAttractor = fs.readFileSync(
      path.join(ws, 'codument', 'attractors', 'product.md'),
      'utf-8',
    );
    expect(productAttractor).toContain('## 什么是 Attractor');
    expect(productAttractor).toContain(
      'Attractor（吸引子）是系统无论如何变化，都会持续向着其靠拢的方向性力量。不是从 A 到 B 的路径规范，而是在目标和路径周围，持续吸引和引导如何走的力量。',
    );
    expect(productAttractor.indexOf('## 什么是 Attractor'))
      .toBeLessThan(productAttractor.indexOf('## 产品愿景'));
    for (const deprecated of [
      'codument-archive',
      'codument-code-quality-score',
      'codument-decision-tree',
      'codument-discuss-phase',
      'codument-implement',
      'codument-modeling-engineering-e2e',
      'codument-plan-track-wave',
      'codument-revise-track',
      'codument-track',
    ]) {
      expect(fs.existsSync(path.join(skillsDir, deprecated))).toBe(false);
    }
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
    expect(fs.existsSync(path.join(ws, 'CLAUDE.md'))).toBe(false);
  });
});
