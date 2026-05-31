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
    writeFile(path.join(ws, 'codument', 'tech-stack.md'), '# tech\n');
    writeFile(path.join(ws, 'codument', 'workflows', 'workflow.md'), '# 项目级工作流\n');
    writeFile(path.join(ws, 'codument', 'std', 'AGENTS.md'), 'OLD-AGENTS\n');
    writeFile(path.join(ws, 'codument', 'std', 'workflow.md'), 'OLD-WORKFLOW\n');
    writeFile(path.join(ws, 'codument', 'std', 'plan-xml-spec.md'), 'OLD-PLAN\n');
    writeFile(path.join(ws, 'codument', 'std', 'protocols.md'), 'OLD-PROTOCOLS\n');
    writeFile(path.join(ws, 'codument', 'tracks.md'), 'OLD-TRACKS\n');
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
    expect(out).not.toContain('Removed legacy root context files');
    expect(out).toContain('Upgraded .opencode/command');
    expect(out).toContain('Upgraded .opencode/skills/codument-*/');

    // Backup created
    expect(fs.existsSync(path.join(backupDir, 'codument', 'std', 'AGENTS.md'))).toBe(true);
    expect(fs.readFileSync(path.join(backupDir, 'codument', 'std', 'AGENTS.md'), 'utf-8')).toBe('OLD-AGENTS\n');
    expect(fs.readFileSync(path.join(backupDir, 'codument', 'tracks.md'), 'utf-8')).toBe('OLD-TRACKS\n');
    expect(fs.readFileSync(path.join(backupDir, '.opencode', 'command', 'codument-init.md'), 'utf-8')).toBe('OLD-OPENCODE-INIT\n');
    expect(fs.readFileSync(path.join(backupDir, '.opencode', 'skills', 'codument-workflow', 'SKILL.md'), 'utf-8')).toBe('OLD-OPENCODE-SKILL\n');

    // Workspace upgraded
    const upgradedAgents = fs.readFileSync(path.join(ws, 'codument', 'std', 'AGENTS.md'), 'utf-8');
    expect(upgradedAgents).not.toBe('OLD-AGENTS\n');
    expect(upgradedAgents).toContain('Codument');
    expect(upgradedAgents).toContain('upgrade-workspace');
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'docs-modeling-fractal', 'index.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'docs-impl-fractal', 'index.md'))).toBe(true);
    expect(fs.readFileSync(path.join(ws, 'codument', 'std', 'docs-modeling-fractal', 'index.md'), 'utf-8')).toContain('docs/modeling/');
    expect(fs.readFileSync(path.join(ws, 'codument', 'std', 'docs-impl-fractal', 'index.md'), 'utf-8')).toContain('docs/impl/');
    expect(fs.existsSync(path.join(ws, 'codument', 'tracks.md'))).toBe(false);
    expect(fs.readFileSync(path.join(ws, 'codument', 'attractors', 'product.md'), 'utf-8')).toBe('# p\n');
    expect(fs.readFileSync(path.join(ws, 'codument', 'attractors', 'project.md'), 'utf-8')).toBe('# p\n');
    expect(fs.readFileSync(path.join(ws, 'codument', 'project.md'), 'utf-8')).toBe('# p\n');
    expect(fs.readFileSync(path.join(ws, 'codument', 'product.md'), 'utf-8')).toBe('# p\n');
    expect(fs.readFileSync(path.join(ws, 'codument', 'tech-stack.md'), 'utf-8')).toBe('# tech\n');
    expect(fs.existsSync(path.join(ws, 'codument', 'config', 'feature.json'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'memory'))).toBe(false);
    expect(fs.readFileSync(path.join(ws, 'codument', 'legacy', 'project-context', 'product.md'), 'utf-8')).toBe('# p\n');
    expect(fs.readFileSync(path.join(ws, 'codument', 'legacy', 'project-context', 'project.md'), 'utf-8')).toBe('# p\n');
    expect(fs.readFileSync(path.join(ws, 'codument', 'legacy', 'project-context', 'tech-stack.md'), 'utf-8')).toBe('# tech\n');
    expect(fs.existsSync(path.join(ws, 'codument', 'legacy', 'workspace', 'tracks.md'))).toBe(true);

    // OpenCode commands regenerated
    expect(fs.existsSync(path.join(ws, '.opencode', 'command', 'codument-verify.md'))).toBe(true);
    const verifyCmd = fs.readFileSync(path.join(ws, '.opencode', 'command', 'codument-verify.md'), 'utf-8');
    expect(verifyCmd).toContain('# codument:verify');
    expect(verifyCmd).toContain('.opencode/skills/codument-verify/SKILL.md');
    expect(fs.existsSync(path.join(ws, '.opencode', 'skills', 'codument-workflow'))).toBe(false);
    expect(fs.existsSync(path.join(ws, '.opencode', 'skills', 'codument'))).toBe(false);
    expect(fs.existsSync(path.join(ws, '.opencode', 'skills', 'codument-gap-loop', 'SKILL.md'))).toBe(true);
  });

  it('creates feature attractors when knowledge sync or project memory is enabled', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');

    const ws = makeTempDir('codument-upgrade-feature-attractors-ws-');

    writeFile(path.join(ws, 'codument', 'attractors', 'project.md'), '# project\n');
    writeFile(path.join(ws, 'codument', 'attractors', 'product.md'), '# product\n');
    writeFile(path.join(ws, 'codument', 'config', 'feature.json'), JSON.stringify({
      knowledgeSync: {
        enabled: true,
        targets: [],
      },
      projectMemory: {
        enabled: true,
      },
    }, null, 2));
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
      cli_tools: [],
      last_successful_step: '2.1_project',
    }, null, 2));

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'upgrade-workspace',
      '--no-backup',
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
    expect(out).toContain('Created feature attractors: docs-knowledge.md, project-memory.md');
    expect(fs.readFileSync(path.join(ws, 'codument', 'attractors', 'docs-knowledge.md'), 'utf-8')).toContain('Docs Knowledge Attractor');
    expect(fs.readFileSync(path.join(ws, 'codument', 'attractors', 'docs-knowledge.md'), 'utf-8')).toContain('codument/std/docs-modeling-fractal/index.md');
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'docs-modeling-fractal', 'index.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'docs-impl-fractal', 'index.md'))).toBe(true);
    expect(fs.readFileSync(path.join(ws, 'codument', 'attractors', 'project-memory.md'), 'utf-8')).toContain('Project Memory Attractor');
    expect(fs.readFileSync(path.join(ws, 'codument', 'config', 'feature.json'), 'utf-8')).toContain('"enabled": true');
  });

  it('does not overwrite an existing docs knowledge attractor during upgrade', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');

    const ws = makeTempDir('codument-upgrade-preserve-docs-attractor-ws-');

    writeFile(path.join(ws, 'codument', 'attractors', 'project.md'), '# project\n');
    writeFile(path.join(ws, 'codument', 'attractors', 'product.md'), '# product\n');
    writeFile(path.join(ws, 'codument', 'attractors', 'docs-knowledge.md'), 'CUSTOM DOCS KNOWLEDGE\n');
    writeFile(path.join(ws, 'codument', 'config', 'feature.json'), JSON.stringify({
      knowledgeSync: {
        enabled: true,
        targets: [],
      },
      projectMemory: {
        enabled: false,
      },
    }, null, 2));
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
      cli_tools: [],
      last_successful_step: '2.1_project',
    }, null, 2));

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'upgrade-workspace',
      '--no-backup',
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
    expect(out).not.toContain('Created feature attractors: docs-knowledge.md');
    expect(fs.readFileSync(path.join(ws, 'codument', 'attractors', 'docs-knowledge.md'), 'utf-8')).toBe('CUSTOM DOCS KNOWLEDGE\n');
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'docs-modeling-fractal', 'index.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'docs-impl-fractal', 'index.md'))).toBe(true);
  });

  it('backs up legacy Codument skills and upgrades standalone lifecycle skills for Codex', async () => {
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

    const workflowSkillRoot = path.join(homeDir, '.codex', 'skills', 'codument-workflow');
    const gapLoopSkillRoot = path.join(homeDir, '.codex', 'skills', 'codument-gap-loop');
    writeFile(path.join(workflowSkillRoot, 'SKILL.md'), 'OLD-SKILL\n');
    writeFile(path.join(workflowSkillRoot, 'extra.md'), 'REMOVE-ME\n');
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
    expect(out).toContain('Upgraded ~/.codex/skills/codument-*/');

    expect(fs.readFileSync(path.join(backupDir, '.codex', 'skills', 'codument-workflow', 'SKILL.md'), 'utf-8')).toBe('OLD-SKILL\n');

    expect(fs.existsSync(workflowSkillRoot)).toBe(false);
    expect(fs.existsSync(path.join(homeDir, '.codex', 'skills', 'codument'))).toBe(false);
    expect(fs.existsSync(path.join(gapLoopSkillRoot, 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(gapLoopSkillRoot, 'shared', 'target-capabilities.md'))).toBe(true);
  });

  it('backs up legacy Codument skills and upgrades standalone lifecycle skills for Sparrow', async () => {
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

    const oldWorkflowSkillRoot = path.join(ws, '.sparrow', 'skill', 'codument-workflow');
    const newGapLoopSkillRoot = path.join(ws, '.sparrow', 'skills', 'codument-gap-loop');
    writeFile(path.join(oldWorkflowSkillRoot, 'SKILL.md'), 'OLD-SPARROW-SKILL\n');
    writeFile(path.join(oldWorkflowSkillRoot, 'extra.md'), 'REMOVE-ME\n');
    writeFile(path.join(ws, '.sparrow', 'skill', 'codument', 'SKILL.md'), 'OLD-LEGACY-SPARROW-SKILL\n');
    writeFile(path.join(ws, '.sparrow', 'skill', 'codument-gap-loop', 'SKILL.md'), 'OLD-OLDROOT-GAP-LOOP\n');

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
    expect(out).toContain('Upgraded .sparrow/skills/codument-*/');

    expect(fs.readFileSync(path.join(backupDir, '.sparrow', 'skill', 'codument-workflow', 'SKILL.md'), 'utf-8')).toBe('OLD-SPARROW-SKILL\n');

    expect(fs.existsSync(oldWorkflowSkillRoot)).toBe(false);
    expect(fs.existsSync(path.join(ws, '.sparrow', 'skill', 'codument-gap-loop'))).toBe(false);
    expect(fs.existsSync(path.join(ws, '.sparrow', 'skill', 'codument'))).toBe(false);
    expect(fs.readFileSync(path.join(newGapLoopSkillRoot, 'shared', 'target-capabilities.md'), 'utf-8')).toContain('Sparrow');
    expect(fs.existsSync(path.join(newGapLoopSkillRoot, 'manifest.yml'))).toBe(true);
  });

  it('backs up legacy Codument skills and upgrades standalone lifecycle skills for CodeFlicker', async () => {
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

    const workflowSkillRoot = path.join(ws, '.codeflicker', 'skills', 'codument-workflow');
    writeFile(path.join(workflowSkillRoot, 'SKILL.md'), 'OLD-CODEFLICKER-SKILL\n');
    writeFile(path.join(workflowSkillRoot, 'extra.md'), 'REMOVE-ME\n');
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
    expect(out).toContain('Upgraded .codeflicker/skills/codument-*/');

    expect(fs.readFileSync(path.join(backupDir, '.codeflicker', 'skills', 'codument-workflow', 'SKILL.md'), 'utf-8')).toBe('OLD-CODEFLICKER-SKILL\n');
    expect(fs.readFileSync(path.join(backupDir, '.codeflicker', 'commands', 'codument', 'gap-loop.md'), 'utf-8')).toBe('OLD-CODEFLICKER-COMMAND\n');

    expect(fs.existsSync(workflowSkillRoot)).toBe(false);
    expect(fs.existsSync(path.join(ws, '.codeflicker', 'skills', 'codument'))).toBe(false);
    expect(fs.existsSync(path.join(ws, '.codeflicker', 'skills', 'codument-gap-loop', 'SKILL.md'))).toBe(true);
    expect(fs.readFileSync(path.join(ws, '.codeflicker', 'skills', 'codument-gap-loop', 'shared', 'target-capabilities.md'), 'utf-8')).toContain('CodeFlicker');
    expect(fs.readFileSync(path.join(ws, '.codeflicker', 'commands', 'codument', 'gap-loop.md'), 'utf-8')).toContain('.codeflicker/skills/codument-gap-loop/SKILL.md');
  });
  it('preserves unsafe Markdown specs in codument/legacy while keeping originals readable', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');

    const ws = makeTempDir('codument-upgrade-legacy-specs-ws-');
    writeFile(path.join(ws, 'codument', 'project.md'), '# project\n');
    writeFile(path.join(ws, 'codument', 'product.md'), '# product\n');
    writeFile(path.join(ws, 'codument', 'workflows', 'workflow.md'), '# 项目级工作流\n');
    writeFile(path.join(ws, 'codument', 'std', 'AGENTS.md'), 'OLD-AGENTS\n');
    writeFile(path.join(ws, 'codument', 'std', 'workflow.md'), 'OLD-WORKFLOW\n');
    writeFile(path.join(ws, 'codument', 'std', 'plan-xml-spec.md'), 'OLD-PLAN\n');
    writeFile(path.join(ws, 'codument', 'std', 'protocols.md'), 'OLD-PROTOCOLS\n');
    writeFile(path.join(ws, 'codument', 'specs', 'codument-core', 'spec.md'), '### Requirement: Keep old spec\n\n#### Scenario: Still readable\n');
    writeFile(path.join(ws, 'codument', 'state.json'), JSON.stringify({
      cli_tools: [],
      last_action: 'init',
    }, null, 2));

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'upgrade-workspace',
      '--backup-dir',
      path.join(ws, '.tmp', 'codument', 'legacy-specs'),
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const err = await new Response(proc.stderr).text();
    expect(err).toBe('');
    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(ws, 'codument', 'specs', 'codument-core', 'spec.md'))).toBe(true);
    expect(fs.readFileSync(path.join(ws, 'codument', 'legacy', 'specs', 'codument-core', 'spec.md'), 'utf-8')).toContain('Keep old spec');
  });
});
