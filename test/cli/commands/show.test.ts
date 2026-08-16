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

async function runCli(workspace: string, args: string[]) {
  const repoRoot = path.resolve(__dirname, '../../..');
  const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
  const proc = Bun.spawn([
    'bun',
    'run',
    cliEntry,
    '--workspace-dir',
    workspace,
    ...args,
  ], {
    cwd: repoRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const exitCode = await proc.exited;
  return {
    exitCode,
    stdout: await new Response(proc.stdout).text(),
    stderr: await new Response(proc.stderr).text(),
  };
}

describe('codument show', () => {
  it('shows recursive behavior deltas for tracks instead of implying spec.md', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-show-track-ws-');
    const trackId = 'add-xml-delta';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);

    writeFile(path.join(ws, 'codument', 'state.json'), '{}');
    writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n');
    writeTrackXml(trackDir, trackId);
    writeFile(path.join(trackDir, 'behavior_deltas', 'provider.deepseek', 'delta.xnl'), `<BehaviorPatch #track.add-xml-delta.behavior_patch.provider.deepseek apiVersion="codument.tech/v1alpha1" version="1" { capability = "provider.deepseek" } (
  <Mutations [
    <Upsert { selector = "behavior://provider.deepseek/requirements/cache-support" } (<Requirement #cache-support>)>
  ]>
)>
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
    expect(out).toContain('behavior_deltas/provider.deepseek/delta.xnl');
    expect(out).not.toContain('✗ spec.md');
  });

  it('lists files in track JSON and includes contents only when requested', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-show-track-json-ws-');
    const trackId = 'add-xml-delta-json';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);

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
    expect(payload.files).toContain('behavior_deltas/provider.deepseek/delta.xml');
    expect(payload.contents).toBeUndefined();

    const expanded = await runCli(ws, ['show', trackId, '--json', '--include-content']);
    expect(expanded.exitCode).toBe(0);
    const expandedPayload = JSON.parse(expanded.stdout);
    expect(expandedPayload.contents['behavior_deltas/provider.deepseek/delta.xml'])
      .toContain('<behavior-patch capability="provider.deepseek" version="1">');
  });

  it('resolves decision URIs through the global stable-id index, independent of owner path', async () => {
    const ws = makeTempDir('codument-show-decision-uri-ws-');
    writeFile(path.join(ws, 'codument', 'state.json'), '{}');
    writeFile(
      path.join(ws, 'codument', 'decisions', 'platform', 'runtime', 'conditional.xnl'),
      `<decision #decision.conditional_activation {
  status = "accepted"
  source = "archive://conditional-activation"
  provenance = { kind = "archive-recovery" }
}
[
  <decision #decision.conditional_activation.audit {
    status = "resolved"
  }>
]>
`,
    );

    const result = await runCli(ws, [
      'show',
      'decision://decision.conditional_activation.audit',
      '--type',
      'decision',
      '--json',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const payload = JSON.parse(result.stdout);
    expect(payload).toMatchObject({
      id: 'decision.conditional_activation.audit',
      uri: 'decision://decision.conditional_activation.audit',
      owner_file: 'platform/runtime/conditional.xnl',
      status: 'resolved',
      parent: {
        tag: 'decision',
        id: 'decision.conditional_activation',
      },
    });
    expect(payload.ancestors).toEqual([
      {
        tag: 'decision',
        id: 'decision.conditional_activation',
      },
    ]);
    expect(payload.node.tag).toBe('decision');
  });

  it('auto-detects a bare decision stable id and shows its logical URI and owner', async () => {
    const ws = makeTempDir('codument-show-decision-auto-ws-');
    writeFile(path.join(ws, 'codument', 'state.json'), '{}');
    writeFile(
      path.join(ws, 'codument', 'decisions', 'owners', 'policy.xnl'),
      `<decision #decision.owner_policy {
  status = "accepted"
  source = "archive://owner-policy"
}>`,
    );

    const result = await runCli(ws, ['show', 'decision.owner_policy']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Decision: decision.owner_policy');
    expect(result.stdout).toContain('URI:         decision://decision.owner_policy');
    expect(result.stdout).toContain('Owner:       owners/policy.xnl');
    expect(result.stdout).toContain('Status:      accepted');
    expect(result.stdout).toContain('Source:      archive://owner-policy');
  });

  it('fails closed when duplicate decision ids make URI resolution ambiguous', async () => {
    const ws = makeTempDir('codument-show-decision-duplicate-ws-');
    writeFile(path.join(ws, 'codument', 'state.json'), '{}');
    writeFile(
      path.join(ws, 'codument', 'decisions', 'a.xnl'),
      '<decision #decision.duplicate { status = "accepted" }>',
    );
    writeFile(
      path.join(ws, 'codument', 'decisions', 'nested', 'b.xnl'),
      '<decision #decision.duplicate { status = "resolved" }>',
    );

    const result = await runCli(ws, [
      'show',
      'decision://decision.duplicate',
      '--type',
      'decision',
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain("Duplicate decision node id 'decision.duplicate'");
    expect(result.stderr).toContain('nested/b.xnl');
    expect(result.stderr).toContain('a.xnl');
  });

  it('does not resolve a legacy Markdown compatibility record as a canonical decision', async () => {
    const ws = makeTempDir('codument-show-legacy-decision-view-ws-');
    writeFile(path.join(ws, 'codument', 'state.json'), '{}');
    writeFile(
      path.join(ws, 'codument', 'decisions', '2026-05', 'legacy-record', 'decision.md'),
      `# Decision: decision.legacy_only

Decision URI: decision://decision.legacy_only
Source: archive://legacy-record
`,
    );

    const result = await runCli(ws, [
      'show',
      'decision://decision.legacy_only',
      '--type',
      'decision',
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Decision not found: decision.legacy_only');
  });
});
