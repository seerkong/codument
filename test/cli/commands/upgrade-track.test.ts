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

describe('codument upgrade-track', () => {
  it('upgrades an active track plan.xml to wave mode with backups', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');

    const ws = makeTempDir('codument-upgrade-track-ws-');
    const trackId = 'my-track';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);
    fs.mkdirSync(trackDir, { recursive: true });

    // Minimal initialized workspace
    writeFile(path.join(ws, 'codument', 'project.md'), '# p\n');
    writeFile(path.join(ws, 'codument', 'product.md'), '# p\n');
    writeFile(path.join(ws, 'codument', 'workflows', 'workflow.md'), '# 项目级工作流\n');
    writeFile(path.join(ws, 'codument', 'std', 'AGENTS.md'), 'x\n');
    writeFile(path.join(ws, 'codument', 'std', 'workflow.md'), 'x\n');
    writeFile(path.join(ws, 'codument', 'std', 'plan-xml-spec.md'), 'x\n');
    writeFile(path.join(ws, 'codument', 'std', 'protocols.md'), 'x\n');
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

    // Old-ish plan with dependencies + mixed text content
    writeFile(path.join(trackDir, 'plan.xml'), `<?xml version="1.0"?>
<plan>
  <metadata>
    <track_id>${trackId}</track_id>
    <track_name>t</track_name>
    <goal>g</goal>
    <created_at>2026-03-01</created_at>
    <status>new</status>
    <commit_mode>manual</commit_mode>
  </metadata>
  <phases>
    <phase id="P1" name="p1">
      <goal>g</goal>
      <tasks>
        <task id="T1.1" name="a" status="TODO" priority="P0">desc a</task>
        <task id="T1.2" name="b" status="TODO" priority="P0">
          desc b
          <dependencies>T1.1</dependencies>
          <acceptance_criteria>
            <criterion id="T1.2-AC1" checked="false">x</criterion>
          </acceptance_criteria>
        </task>
      </tasks>
    </phase>
  </phases>
</plan>`);

    const backupDir = path.join(ws, '.tmp', 'codument', 'test-backup');

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'upgrade-track',
      trackId,
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
    expect(out).toContain('Updated plan.xml');
    expect(out).toContain('Ensured wave support files');

    // Backup includes original plan.xml
    const backedUpPlan = path.join(backupDir, 'codument', 'tracks', 'active', trackId, 'plan.xml');
    expect(fs.existsSync(backedUpPlan)).toBe(true);
    const backupText = fs.readFileSync(backedUpPlan, 'utf-8');
    expect(backupText).toContain('<dependencies>');

    // Upgraded plan.xml contains wave mode constructs
    const upgradedText = fs.readFileSync(path.join(trackDir, 'plan.xml'), 'utf-8');
    expect(upgradedText).toContain('<execution_mode>wave</execution_mode>');
    expect(upgradedText).toContain('<waves>');
    expect(upgradedText).toContain('wave="WAVE-P1-01"');
    expect(upgradedText).toContain('wave="WAVE-P1-02"');
    expect(upgradedText).toContain('<description>desc b</description>');
    expect(upgradedText).not.toContain('<dependencies>');

    // Wave support files created
    expect(fs.existsSync(path.join(trackDir, 'context.md'))).toBe(true);
    expect(fs.existsSync(path.join(trackDir, 'state.md'))).toBe(true);
    expect(fs.existsSync(path.join(trackDir, 'phases'))).toBe(true);
    expect(fs.existsSync(path.join(trackDir, 'waves'))).toBe(true);
  });

  it('finds archived tracks in the new YYYY-MM archive bucket layout', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');

    const ws = makeTempDir('codument-upgrade-track-archive-ws-');
    const trackId = 'archived-track';
    const archiveId = `2026-05-30-1432-${trackId}`;
    const archiveDir = path.join(ws, 'codument', 'tracks', 'archived', '2026-05', archiveId);

    writeFile(path.join(ws, 'codument', 'state.json'), JSON.stringify({
      cli_tools: [],
    }, null, 2));
    writeFile(path.join(archiveDir, 'plan.xml'), `<?xml version="1.0"?>
<plan>
  <metadata>
    <track_id>${trackId}</track_id>
    <track_name>t</track_name>
    <goal>g</goal>
    <created_at>2026-05-30</created_at>
    <updated_at>2026-05-30</updated_at>
    <description>d</description>
    <status>completed</status>
    <commit_mode>manual</commit_mode>
  </metadata>
  <phases>
    <phase id="P1" name="p1">
      <task id="T1.1" name="a" status="TODO" priority="P0">desc a</task>
    </phase>
  </phases>
</plan>`);

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'upgrade-track',
      trackId,
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
    expect(out).toContain(path.join('codument', 'tracks', 'archived', '2026-05', archiveId));

    const upgradedText = fs.readFileSync(path.join(archiveDir, 'plan.xml'), 'utf-8');
    expect(upgradedText).toContain('<execution_mode>wave</execution_mode>');
    expect(fs.existsSync(path.join(archiveDir, 'context.md'))).toBe(true);
  });
});
