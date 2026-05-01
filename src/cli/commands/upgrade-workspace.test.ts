import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

describe('codument upgrade-workspace', () => {
  it('backs up and overwrites std + regenerates selected CLI commands', async () => {
    // This test file lives at: <repo>/src/cli/commands/
    // Repo root is 3 levels up.
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');

    const ws = makeTempDir('codument-upgrade-ws-');

    // Minimal initialized workspace
    writeFile(path.join(ws, 'codument', 'project.md'), '# p\n');
    writeFile(path.join(ws, 'codument', 'product.md'), '# p\n');
    writeFile(path.join(ws, 'codument', 'workflows', 'workflow.md'), '# 项目级工作流\n');
    writeFile(path.join(ws, 'codument', 'std', 'AGENTS.md'), 'OLD-AGENTS\n');
    writeFile(path.join(ws, 'codument', 'std', 'workflow.md'), 'OLD-WORKFLOW\n');
    writeFile(path.join(ws, 'codument', 'std', 'plan-xml-spec.md'), 'OLD-PLAN\n');
    writeFile(path.join(ws, 'codument', 'std', 'protocols.md'), 'OLD-PROTOCOLS\n');
    writeFile(path.join(ws, 'codument', 'state.json'), JSON.stringify({
      active_track: null,
      current_phase: null,
      current_task: null,
      last_action: 'init',
      timestamp: new Date().toISOString(),
      commit_mode: 'manual',
      cli_tools: ['opencode'],
      last_successful_step: '2.1_project',
    }, null, 2));

    // Existing OpenCode commands and skill
    writeFile(path.join(ws, '.opencode', 'command', 'codument-init.md'), 'OLD-OPENCODE-INIT\n');
    writeFile(path.join(ws, '.opencode', 'skills', 'codument-workflow', 'SKILL.md'), 'OLD-OPENCODE-SKILL\n');
    writeFile(path.join(ws, '.opencode', 'skills', 'codument', 'SKILL.md'), 'OLD-LEGACY-SKILL\n');

    const backupDir = path.join(ws, '.tmp', 'codument', 'test-backup');

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'upgrade-workspace',
      '--backup-dir',
      backupDir,
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();
    expect(err).toBe('');
    expect(exitCode).toBe(0);
    expect(out).toContain('Updated codument/std');
    expect(out).toContain('Upgraded .opencode/command');
    expect(out).toContain('Upgraded .opencode/skills/codument-workflow/');

    // Backup created
    expect(fs.existsSync(path.join(backupDir, 'codument', 'std', 'AGENTS.md'))).toBe(true);
    expect(fs.readFileSync(path.join(backupDir, 'codument', 'std', 'AGENTS.md'), 'utf-8')).toBe('OLD-AGENTS\n');
    expect(fs.readFileSync(path.join(backupDir, '.opencode', 'command', 'codument-init.md'), 'utf-8')).toBe('OLD-OPENCODE-INIT\n');
    expect(fs.readFileSync(path.join(backupDir, '.opencode', 'skills', 'codument-workflow', 'SKILL.md'), 'utf-8')).toBe('OLD-OPENCODE-SKILL\n');

    // Workspace upgraded
    const upgradedAgents = fs.readFileSync(path.join(ws, 'codument', 'std', 'AGENTS.md'), 'utf-8');
    expect(upgradedAgents).not.toBe('OLD-AGENTS\n');
    expect(upgradedAgents).toContain('Codument');
    expect(upgradedAgents).toContain('upgrade-workspace');

    // OpenCode commands regenerated
    expect(fs.existsSync(path.join(ws, '.opencode', 'command', 'codument-verify.md'))).toBe(true);
    const verifyCmd = fs.readFileSync(path.join(ws, '.opencode', 'command', 'codument-verify.md'), 'utf-8');
    expect(verifyCmd).toContain('# codument:verify');
    expect(verifyCmd).toContain('.opencode/skills/codument-verify/SKILL.md');
    expect(fs.existsSync(path.join(ws, '.opencode', 'skills', 'codument-workflow', 'subskills', 'verify', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, '.opencode', 'skills', 'codument'))).toBe(false);
    expect(fs.existsSync(path.join(ws, '.opencode', 'skills', 'codument-gap-loop', 'SKILL.md'))).toBe(true);
  });

  it('backs up and upgrades the generated Codument workflow skill for Codex', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');

    const ws = makeTempDir('codument-upgrade-codex-ws-');
    const homeDir = makeTempDir('codument-upgrade-codex-home-');

    writeFile(path.join(ws, 'codument', 'project.md'), '# p\n');
    writeFile(path.join(ws, 'codument', 'product.md'), '# p\n');
    writeFile(path.join(ws, 'codument', 'workflows', 'workflow.md'), '# 项目级工作流\n');
    writeFile(path.join(ws, 'codument', 'std', 'AGENTS.md'), 'OLD-AGENTS\n');
    writeFile(path.join(ws, 'codument', 'std', 'workflow.md'), 'OLD-WORKFLOW\n');
    writeFile(path.join(ws, 'codument', 'std', 'plan-xml-spec.md'), 'OLD-PLAN\n');
    writeFile(path.join(ws, 'codument', 'std', 'protocols.md'), 'OLD-PROTOCOLS\n');
    writeFile(path.join(ws, 'codument', 'state.json'), JSON.stringify({
      active_track: null,
      current_phase: null,
      current_task: null,
      last_action: 'init',
      timestamp: new Date().toISOString(),
      commit_mode: 'manual',
      cli_tools: ['codex'],
      last_successful_step: '2.1_project',
    }, null, 2));

    const skillRoot = path.join(homeDir, '.codex', 'skills', 'codument-workflow');
    writeFile(path.join(skillRoot, 'SKILL.md'), 'OLD-SKILL\n');
    writeFile(path.join(skillRoot, 'extra.md'), 'REMOVE-ME\n');
    writeFile(path.join(homeDir, '.codex', 'skills', 'codument', 'SKILL.md'), 'OLD-LEGACY-CODEX-SKILL\n');

    const backupDir = path.join(ws, '.tmp', 'codument', 'test-backup-codex');

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'upgrade-workspace',
      '--backup-dir',
      backupDir,
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

    expect(err).toBe('');
    expect(exitCode).toBe(0);
    expect(out).toContain('Upgraded ~/.codex/skills/codument-workflow/');

    expect(fs.readFileSync(path.join(backupDir, '.codex', 'skills', 'codument-workflow', 'SKILL.md'), 'utf-8')).toBe('OLD-SKILL\n');

    expect(fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf-8')).toContain('Codument Workflow');
    expect(fs.existsSync(path.join(skillRoot, 'agents', 'openai.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(skillRoot, 'subskills', 'implement', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(skillRoot, 'shared', 'target-capabilities.md'))).toBe(true);
    expect(fs.existsSync(path.join(skillRoot, 'extra.md'))).toBe(false);
    expect(fs.existsSync(path.join(homeDir, '.codex', 'skills', 'codument'))).toBe(false);
    expect(fs.existsSync(path.join(homeDir, '.codex', 'skills', 'codument-gap-loop', 'SKILL.md'))).toBe(true);
  });

  it('backs up and upgrades the generated Codument workflow skill for Sparrow', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');

    const ws = makeTempDir('codument-upgrade-sparrow-ws-');

    writeFile(path.join(ws, 'codument', 'project.md'), '# p\n');
    writeFile(path.join(ws, 'codument', 'product.md'), '# p\n');
    writeFile(path.join(ws, 'codument', 'workflows', 'workflow.md'), '# 项目级工作流\n');
    writeFile(path.join(ws, 'codument', 'std', 'AGENTS.md'), 'OLD-AGENTS\n');
    writeFile(path.join(ws, 'codument', 'std', 'workflow.md'), 'OLD-WORKFLOW\n');
    writeFile(path.join(ws, 'codument', 'std', 'plan-xml-spec.md'), 'OLD-PLAN\n');
    writeFile(path.join(ws, 'codument', 'std', 'protocols.md'), 'OLD-PROTOCOLS\n');
    writeFile(path.join(ws, 'codument', 'state.json'), JSON.stringify({
      active_track: null,
      current_phase: null,
      current_task: null,
      last_action: 'init',
      timestamp: new Date().toISOString(),
      commit_mode: 'manual',
      cli_tools: ['sparrow'],
      last_successful_step: '2.1_project',
    }, null, 2));

    const skillRoot = path.join(ws, '.sparrow', 'skill', 'codument-workflow');
    writeFile(path.join(skillRoot, 'SKILL.md'), 'OLD-SPARROW-SKILL\n');
    writeFile(path.join(skillRoot, 'extra.md'), 'REMOVE-ME\n');
    writeFile(path.join(ws, '.sparrow', 'skill', 'codument', 'SKILL.md'), 'OLD-LEGACY-SPARROW-SKILL\n');

    const backupDir = path.join(ws, '.tmp', 'codument', 'test-backup-sparrow');

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'upgrade-workspace',
      '--backup-dir',
      backupDir,
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();

    expect(err).toBe('');
    expect(exitCode).toBe(0);
    expect(out).toContain('Upgraded .sparrow/skill/codument-workflow/');

    expect(fs.readFileSync(path.join(backupDir, '.sparrow', 'skill', 'codument-workflow', 'SKILL.md'), 'utf-8')).toBe('OLD-SPARROW-SKILL\n');

    expect(fs.readFileSync(path.join(skillRoot, 'shared', 'target-capabilities.md'), 'utf-8')).toContain('Sparrow');
    expect(fs.existsSync(path.join(skillRoot, 'manifest.yml'))).toBe(true);
    expect(fs.existsSync(path.join(skillRoot, 'subskills', 'implement', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(skillRoot, 'extra.md'))).toBe(false);
    expect(fs.existsSync(path.join(ws, '.sparrow', 'skill', 'codument'))).toBe(false);
    expect(fs.existsSync(path.join(ws, '.sparrow', 'skill', 'codument-gap-loop', 'SKILL.md'))).toBe(true);
  });

  it('backs up and upgrades the generated Codument workflow skill for CodeFlicker', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');

    const ws = makeTempDir('codument-upgrade-codeflicker-ws-');

    writeFile(path.join(ws, 'codument', 'project.md'), '# p\n');
    writeFile(path.join(ws, 'codument', 'product.md'), '# p\n');
    writeFile(path.join(ws, 'codument', 'workflows', 'workflow.md'), '# 项目级工作流\n');
    writeFile(path.join(ws, 'codument', 'std', 'AGENTS.md'), 'OLD-AGENTS\n');
    writeFile(path.join(ws, 'codument', 'std', 'workflow.md'), 'OLD-WORKFLOW\n');
    writeFile(path.join(ws, 'codument', 'std', 'plan-xml-spec.md'), 'OLD-PLAN\n');
    writeFile(path.join(ws, 'codument', 'std', 'protocols.md'), 'OLD-PROTOCOLS\n');
    writeFile(path.join(ws, 'codument', 'state.json'), JSON.stringify({
      active_track: null,
      current_phase: null,
      current_task: null,
      last_action: 'init',
      timestamp: new Date().toISOString(),
      commit_mode: 'manual',
      cli_tools: ['codeflicker'],
      last_successful_step: '2.1_project',
    }, null, 2));

    const skillRoot = path.join(ws, '.codeflicker', 'skills', 'codument-workflow');
    writeFile(path.join(skillRoot, 'SKILL.md'), 'OLD-CODEFLICKER-SKILL\n');
    writeFile(path.join(skillRoot, 'extra.md'), 'REMOVE-ME\n');
    writeFile(path.join(ws, '.codeflicker', 'skills', 'codument', 'SKILL.md'), 'OLD-LEGACY-CODEFLICKER-SKILL\n');
    writeFile(path.join(ws, '.codeflicker', 'commands', 'codument', 'gap-loop.md'), 'OLD-CODEFLICKER-COMMAND\n');

    const backupDir = path.join(ws, '.tmp', 'codument', 'test-backup-codeflicker');

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'upgrade-workspace',
      '--backup-dir',
      backupDir,
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();

    expect(err).toBe('');
    expect(exitCode).toBe(0);
    expect(out).toContain('Upgraded .codeflicker/commands/codument');
    expect(out).toContain('Upgraded .codeflicker/skills/codument-workflow/');

    expect(fs.readFileSync(path.join(backupDir, '.codeflicker', 'skills', 'codument-workflow', 'SKILL.md'), 'utf-8')).toBe('OLD-CODEFLICKER-SKILL\n');
    expect(fs.readFileSync(path.join(backupDir, '.codeflicker', 'commands', 'codument', 'gap-loop.md'), 'utf-8')).toBe('OLD-CODEFLICKER-COMMAND\n');

    expect(fs.readFileSync(path.join(skillRoot, 'shared', 'target-capabilities.md'), 'utf-8')).toContain('CodeFlicker');
    expect(fs.existsSync(path.join(skillRoot, 'subskills', 'implement', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(skillRoot, 'extra.md'))).toBe(false);
    expect(fs.existsSync(path.join(ws, '.codeflicker', 'skills', 'codument'))).toBe(false);
    expect(fs.existsSync(path.join(ws, '.codeflicker', 'skills', 'codument-gap-loop', 'SKILL.md'))).toBe(true);
    expect(fs.readFileSync(path.join(ws, '.codeflicker', 'commands', 'codument', 'gap-loop.md'), 'utf-8')).toContain('.codeflicker/skills/codument-gap-loop/SKILL.md');
  });
});
