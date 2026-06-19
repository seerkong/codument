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

function writeTrackXml(trackDir: string, trackId: string): void {
  writeFile(path.join(trackDir, 'track.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<Track id="${trackId}" version="1" xmlns:cdt="urn:codument:v1">
  <Metadata>
    <Status>new</Status>
    <Goal>behavior delta</Goal>
    <Description>behavior delta</Description>
    <CreatedAt>2026-05-30T01:00:00Z</CreatedAt>
    <UpdatedAt>2026-05-30T02:03:00Z</UpdatedAt>
  </Metadata>
  <TaskSpace id="space_${trackId}" name="${trackId}">
    <SubNodes />
  </TaskSpace>
</Track>`);
}

describe('codument show', () => {
  it('shows recursive behavior deltas for tracks instead of implying spec.md', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-show-track-ws-');
    const trackId = 'add-xml-delta';
    const trackDir = path.join(ws, 'codument', 'tracks', trackId);

    writeFile(path.join(ws, 'codument', 'state.json'), '{}');
    writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n');
    writeTrackXml(trackDir, trackId);
    writeFile(path.join(trackDir, 'behavior_deltas', 'provider.deepseek', 'delta.xml'), `<behavior-patch capability="provider.deepseek" version="1">
  <upsert selector="behavior://provider.deepseek/requirements/cache-support">
    <requirement id="cache-support" />
  </upsert>
</behavior-patch>
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
    expect(out).toContain('behavior_deltas/provider.deepseek/delta.xml');
    expect(out).not.toContain('✗ spec.md');
  });

  it('includes behavior deltas in track JSON output', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-show-track-json-ws-');
    const trackId = 'add-xml-delta-json';
    const trackDir = path.join(ws, 'codument', 'tracks', trackId);

    writeFile(path.join(ws, 'codument', 'state.json'), '{}');
    writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n');
    writeTrackXml(trackDir, trackId);
    writeFile(path.join(trackDir, 'behavior_deltas', 'provider.deepseek', 'delta.xml'), `<behavior-patch capability="provider.deepseek" version="1">
  <upsert selector="behavior://provider.deepseek/requirements/cache-support">
    <requirement id="cache-support" />
  </upsert>
</behavior-patch>
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
    expect(payload.files['behavior_deltas/provider.deepseek/delta.xml']).toContain('<behavior-patch capability="provider.deepseek" version="1">');
  });
});
