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

    // Existing OpenCode commands
    writeFile(path.join(ws, '.opencode', 'command', 'codument-init.md'), 'OLD-OPENCODE-INIT\n');

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

    // Backup created
    expect(fs.existsSync(path.join(backupDir, 'codument', 'std', 'AGENTS.md'))).toBe(true);
    expect(fs.readFileSync(path.join(backupDir, 'codument', 'std', 'AGENTS.md'), 'utf-8')).toBe('OLD-AGENTS\n');
    expect(fs.readFileSync(path.join(backupDir, '.opencode', 'command', 'codument-init.md'), 'utf-8')).toBe('OLD-OPENCODE-INIT\n');

    // Workspace upgraded
    const upgradedAgents = fs.readFileSync(path.join(ws, 'codument', 'std', 'AGENTS.md'), 'utf-8');
    expect(upgradedAgents).not.toBe('OLD-AGENTS\n');
    expect(upgradedAgents).toContain('Codument');
    expect(upgradedAgents).toContain('upgrade-workspace');

    // OpenCode commands regenerated
    expect(fs.existsSync(path.join(ws, '.opencode', 'command', 'codument-verify.md'))).toBe(true);
    const verifyCmd = fs.readFileSync(path.join(ws, '.opencode', 'command', 'codument-verify.md'), 'utf-8');
    expect(verifyCmd).toContain('# codument:verify');
  });
});
