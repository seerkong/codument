import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

describe('codument show', () => {
  it('shows recursive XML spec deltas for tracks instead of implying spec.md', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-show-track-ws-');
    const trackId = 'add-xml-delta';
    const trackDir = path.join(ws, 'codument', 'tracks', trackId);

    writeFile(path.join(ws, 'codument', 'state.json'), '{}');
    writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n');
    writeFile(path.join(trackDir, 'plan.xml'), `<plan><metadata>
  <track_id>${trackId}</track_id>
  <type>feature</type>
  <status>proposed</status>
  <created_at>2026-05-30T01:00:00Z</created_at>
  <updated_at>2026-05-30T02:03:00Z</updated_at>
  <description>xml delta</description>
</metadata><phases></phases></plan>`);
    writeFile(path.join(trackDir, 'spec_deltas', 'provider.deepseek', 'delta.xml'), `<spec-patch version="1">
  <requirement op="upsert" selector="spec://provider.deepseek/requirement/cache-support" id="cache-support" />
</spec-patch>
`);

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'show',
      trackId,
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
    expect(out).toContain('spec_deltas/provider.deepseek/delta.xml');
    expect(out).not.toContain('✗ spec.md');
  });

  it('includes XML spec deltas in track JSON output', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-show-track-json-ws-');
    const trackId = 'add-xml-delta-json';
    const trackDir = path.join(ws, 'codument', 'tracks', trackId);

    writeFile(path.join(ws, 'codument', 'state.json'), '{}');
    writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n');
    writeFile(path.join(trackDir, 'plan.xml'), `<plan><metadata>
  <track_id>${trackId}</track_id>
  <type>feature</type>
  <status>proposed</status>
  <created_at>2026-05-30T01:00:00Z</created_at>
  <updated_at>2026-05-30T02:03:00Z</updated_at>
  <description>xml delta</description>
</metadata><phases></phases></plan>`);
    writeFile(path.join(trackDir, 'spec_deltas', 'provider.deepseek', 'delta.xml'), `<spec-patch version="1">
  <requirement op="upsert" selector="spec://provider.deepseek/requirement/cache-support" id="cache-support" />
</spec-patch>
`);

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'show',
      trackId,
      '--json',
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
    const payload = JSON.parse(out);
    expect(payload.files['spec_deltas/provider.deepseek/delta.xml']).toContain('<spec-patch version="1">');
  });
});
