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

async function runValidate(ws: string, trackId: string): Promise<{ exitCode: number; out: string; err: string }> {
  const repoRoot = path.resolve(__dirname, '../../..');
  const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
  const proc = Bun.spawn([
    'bun',
    'run',
    cliEntry,
    '--workspace-dir',
    ws,
    'validate',
    trackId,
    '--strict',
  ], {
    cwd: repoRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  return {
    exitCode: await proc.exited,
    out: await new Response(proc.stdout).text(),
    err: await new Response(proc.stderr).text(),
  };
}

function writeMinimalTrack(ws: string, trackId: string, hookXml = ''): void {
  writeFile(path.join(ws, 'codument', 'attractors', 'project.md'), '# project\n');
  writeFile(path.join(ws, 'codument', 'attractors', 'product.md'), '# product\n');
  writeFile(path.join(ws, 'codument', 'config', 'attractor-profiles.json'), JSON.stringify({
    profiles: {
      default: {
        attractors: ['codument/attractors/project.md', 'codument/attractors/product.md'],
      },
    },
  }, null, 2));
  writeFile(path.join(ws, 'codument', 'tracks', trackId, 'proposal.md'), '# Proposal\n');
  writeFile(path.join(ws, 'codument', 'tracks', trackId, 'spec_deltas', 'codument-core', 'delta.xml'), `
<spec-patch version="1">
  <requirement op="upsert" selector="spec://codument-core/requirement/example" id="example">
    <statement>Example.</statement>
  </requirement>
</spec-patch>
`.trim());
  writeFile(path.join(ws, 'codument', 'tracks', trackId, 'plan.xml'), `
<plan>
  <metadata>
    <track_id>${trackId}</track_id>
    <type>feature</type>
    <status>new</status>
    <created_at>2026-06-06T00:00:00Z</created_at>
    <updated_at>2026-06-06T00:00:00Z</updated_at>
    <description>Example</description>
  </metadata>
  <phases>
    <phase id="P1" name="Example" status="TODO">
      ${hookXml}
      <tasks>
        <task id="T1" name="Example task" status="TODO" priority="P0" />
      </tasks>
    </phase>
  </phases>
</plan>
`.trim());
}

describe('codument validate hook configuration', () => {
  it('accepts valid attractor-check hooks and operation hooks', async () => {
    const ws = makeTempDir('codument-validate-hooks-ws-');
    const trackId = 'hook-track';
    writeMinimalTrack(ws, trackId, `
<attractor-check profile="default" when="after" status="TODO" executor="subagent">
  <result-policy on-gap="fix-immediately" />
</attractor-check>`);
    writeFile(path.join(ws, 'codument', 'config', 'operation-hooks.xml'), `
<operation-hooks version="1">
  <operation name="revise-track">
    <hook id="before" point="before-revise" status="TODO">
      <attractor-check profile="default" when="before" status="TODO" executor="subagent">
        <result-policy on-gap="confirm-before-fix">
          <confirm protocol="yield-human-confirm" when="after" status="TODO" />
        </result-policy>
      </attractor-check>
    </hook>
  </operation>
  <operation name="archive">
    <hook id="before-artifact-sync" point="before-artifact-sync" status="TODO">
      <attractor-check profile="default" when="before" status="TODO" executor="subagent">
        <result-policy on-gap="block" />
      </attractor-check>
    </hook>
  </operation>
</operation-hooks>
`.trim());

    const result = await runValidate(ws, trackId);

    expect(result.err).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.out).toContain('✓ track/hook-track');
  });

  it('reports invalid hook values and unknown operation points', async () => {
    const ws = makeTempDir('codument-validate-bad-hooks-ws-');
    const trackId = 'bad-hook-track';
    writeMinimalTrack(ws, trackId, `
<attractor-check profile="missing" when="during" status="WAITING" executor="same-agent">
  <result-policy on-gap="ask-later">
    <confirm protocol="ask-human" when="later" status="WAITING" />
  </result-policy>
</attractor-check>`);
    writeFile(path.join(ws, 'codument', 'config', 'operation-hooks.xml'), `
<operation-hooks version="2">
  <operation name="revise-track">
    <hook id="bad" point="before-archive" status="TODO" />
  </operation>
  <operation name="archive">
    <hook id="legacy-knowledge-sync" point="before-knowledge-sync" status="TODO" />
  </operation>
</operation-hooks>
`.trim());

    const result = await runValidate(ws, trackId);

    expect(result.exitCode).toBe(1);
    expect(result.out).toContain('Invalid attractor-check when value');
    expect(result.out).toContain('Unknown attractor profile referenced by attractor-check: missing');
    expect(result.out).toContain('Invalid nested confirm protocol value');
    expect(result.out).toContain('Unknown hook point for operation revise-track: before-archive');
    expect(result.out).toContain('Unknown hook point for operation archive: before-knowledge-sync');
    expect(result.out).toContain('operation hooks version must be 1');
  });

  it('reports malformed attractor profile config as a validation error', async () => {
    const ws = makeTempDir('codument-validate-malformed-profile-ws-');
    const trackId = 'malformed-profile-track';
    writeMinimalTrack(ws, trackId, `
<attractor-check profile="default" when="after" status="TODO" executor="subagent">
  <result-policy on-gap="fix-immediately" />
</attractor-check>`);
    writeFile(path.join(ws, 'codument', 'config', 'attractor-profiles.json'), '{');

    const result = await runValidate(ws, trackId);

    expect(result.err).toBe('');
    expect(result.exitCode).toBe(1);
    expect(result.out).toContain('Invalid attractor profile configuration');
    expect(result.out).toContain('codument/config/attractor-profiles.json');
  });

  it('accepts valid artifacts config and artifact-sync hooks', async () => {
    const ws = makeTempDir('codument-validate-artifacts-ws-');
    const trackId = 'artifact-sync-track';
    writeMinimalTrack(ws, trackId);
    writeFile(path.join(ws, 'codument', 'workflows', 'artifacts', 'sync-target-doc.md'), '# Sync Target Doc\n');
    writeFile(path.join(ws, 'rules', 'atm-cli', 'SKILL.md'), '# ATM CLI Rule\n');
    writeFile(path.join(ws, 'codument', 'attractors', 'docs-knowledge.md'), '# Docs Knowledge\n');
    writeFile(path.join(ws, 'codument', 'config', 'artifacts.xml'), `
<artifact-config version="1">
  <resources>
    <workflow id="sync-target-doc" ref="codument/workflows/artifacts/sync-target-doc.md" />
    <skill id="atm-cli-sync-rule" ref="rules/atm-cli/SKILL.md" />
    <attractor-profile id="docs-profile" name="default" />
    <agent id="fresh-doc-agent" executor="fresh-subagent" />
  </resources>
  <artifacts>
    <artifact id="atm-cli-usage-doc" kind="target-doc" enabled="true" source-kind="archived-track" source-scope="current">
      <uses>
        <use resource="fresh-doc-agent" />
        <use resource="sync-target-doc" />
        <use resource="atm-cli-sync-rule" />
        <use resource="docs-profile" />
      </uses>
      <targets>
        <target id="main-docs" kind="local-dir" base-dir="docs" relative-file="atm-cli/usage.md" attractor="codument/attractors/docs-knowledge.md" />
        <target id="external-docs" kind="local-dir" base-dir="/tmp/external-docs" relative-file="atm-cli/usage.md" />
        <target id="docs-system" kind="local-dir" base-dir="docs" relative-dir="." />
      </targets>
      <policy dry-run="first" conflict="diff-confirm" provenance="manifest" />
    </artifact>
  </artifacts>
</artifact-config>
`.trim());
    writeFile(path.join(ws, 'codument', 'config', 'operation-hooks.xml'), `
<operation-hooks version="1">
  <operation name="archive">
    <hook id="sync-artifact" point="after-archive" status="TODO">
      <artifact-sync artifact="atm-cli-usage-doc" status="TODO" executor="fresh-subagent" />
    </hook>
  </operation>
</operation-hooks>
`.trim());

    const result = await runValidate(ws, trackId);

    expect(result.err).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.out).toContain('✓ track/artifact-sync-track');
  });

  it('reports invalid artifacts config shape and policy values', async () => {
    const ws = makeTempDir('codument-validate-bad-artifacts-ws-');
    const trackId = 'bad-artifact-sync-track';
    writeMinimalTrack(ws, trackId);
    writeFile(path.join(ws, 'codument', 'config', 'artifacts.xml'), `
<artifact-config version="2">
  <resources>
    <target id="bad-target" path="docs" />
    <workflow ref="missing-id.md" />
    <workflow id="missing-workflow" ref="codument/workflows/artifacts/missing.md" />
    <skill id="missing-skill-rule" ref="rules/missing/SKILL.md" />
    <attractor-profile id="bad-profile-resource" name="default" attractor="codument/attractors/project.md" ref="codument/attractors/project.md" />
    <agent id="bad-agent" executor="same-agent" />
  </resources>
  <artifacts>
    <skill id="bad-output-skill" ref="rules/output/SKILL.md" />
    <artifact id="bad-doc" kind="target-doc" enabled="sometimes" target-kind="file">
      <targets>
        <include path="docs" />
        <target kind="file" relative-dir="docs" relative-file="out.md" attractor="missing-attractor.md" />
      </targets>
      <uses>
        <include resource="bad-target" />
        <use resource="missing-resource" />
      </uses>
      <policy dry-run="maybe" conflict="ask" provenance="trace" />
    </artifact>
  </artifacts>
  <pipelines />
</artifact-config>
`.trim());
    writeFile(path.join(ws, 'codument', 'config', 'operation-hooks.xml'), `
<operation-hooks version="1">
  <operation name="archive">
    <hook id="sync-artifact" point="after-archive" status="TODO">
      <artifact-sync artifact="missing-doc" status="WAITING" executor="same-agent" />
    </hook>
  </operation>
</operation-hooks>
`.trim());

    const result = await runValidate(ws, trackId);

    expect(result.err).toBe('');
    expect(result.exitCode).toBe(1);
    expect(result.out).toContain('artifacts config version must be 1');
    expect(result.out).toContain('Unsupported artifact-config child node: pipelines');
    expect(result.out).toContain('Unsupported artifact resource type: target');
    expect(result.out).toContain('Artifact resource workflow is missing id attribute');
    expect(result.out).toContain('Artifact resource workflow references missing file: missing-id.md');
    expect(result.out).toContain('Artifact resource missing-workflow references missing file: codument/workflows/artifacts/missing.md');
    expect(result.out).toContain('Artifact resource missing-skill-rule references missing file: rules/missing/SKILL.md');
    expect(result.out).toContain('Artifact attractor-profile resource bad-profile-resource must not use direct attractor attribute');
    expect(result.out).toContain('Artifact attractor-profile resource bad-profile-resource must not use ref attribute');
    expect(result.out).toContain('Invalid artifact agent executor value: same-agent');
    expect(result.out).toContain('Unsupported artifacts child node: skill');
    expect(result.out).toContain('Unsupported targets child node for bad-doc: include');
    expect(result.out).toContain('Artifact bad-doc has target without id attribute');
    expect(result.out).toContain('Artifact bad-doc target (missing) is missing base-dir attribute');
    expect(result.out).toContain('Artifact bad-doc target (missing) must not define both relative-dir and relative-file');
    expect(result.out).toContain('Invalid artifact target kind value for bad-doc target (missing): file');
    expect(result.out).toContain('Artifact bad-doc target (missing) references missing attractor file: missing-attractor.md');
    expect(result.out).toContain('Unsupported uses child node for bad-doc: include');
    expect(result.out).toContain('Artifact bad-doc references unknown resource: missing-resource');
    expect(result.out).toContain('Invalid artifact policy dry-run value for bad-doc: maybe');
    expect(result.out).toContain('Invalid artifact policy conflict value for bad-doc: ask');
    expect(result.out).toContain('Invalid artifact policy provenance value for bad-doc: trace');
    expect(result.out).toContain('Unknown artifact referenced by artifact-sync: missing-doc');
    expect(result.out).toContain('Invalid artifact-sync status value: WAITING');
    expect(result.out).toContain('Invalid artifact-sync executor value: same-agent');
  });
});
