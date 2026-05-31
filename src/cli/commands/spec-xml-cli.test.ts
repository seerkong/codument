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

async function runCli(workspaceDir: string, args: string[]) {
  const repoRoot = path.resolve(__dirname, '../../..');
  const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
  const proc = Bun.spawn([
    'bun',
    'run',
    cliEntry,
    '--workspace-dir',
    workspaceDir,
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

describe('XML spec CLI compatibility', () => {
  it('lists, shows, and validates XML specs alongside Markdown specs', async () => {
    const ws = makeTempDir('codument-spec-xml-cli-');
    writeFile(path.join(ws, 'codument', 'specs', 'markdown-capability', 'spec.md'), `# Markdown Capability

### Requirement: Existing Markdown behavior
#### Scenario: Still listable
`);
    writeFile(path.join(ws, 'codument', 'specs', 'xml-capability.xml'), `<capability id="xml-capability">
  <requirement id="run">
    <statement>XML specs can guide tests.</statement>
    <suite id="happy">
      <case id="runs">
        <given>an XML spec exists</given>
        <when>Codument reads specs</when>
        <then>the XML spec is visible</then>
      </case>
    </suite>
  </requirement>
</capability>
`);
    writeFile(path.join(ws, 'codument', 'specs', 'folder-capability', 'index.xml'), `<capability id="folder-capability">
  <include href="requirements/run.xml" />
</capability>
`);
    writeFile(path.join(ws, 'codument', 'specs', 'folder-capability', 'requirements', 'run.xml'), `<requirement id="run">
  <statement>Folder XML specs can be split.</statement>
  <suite id="nested">
    <case id="loads">
      <given>a split XML spec exists</given>
      <when>Codument expands includes</when>
      <then>the logical case is preserved</then>
    </case>
  </suite>
</requirement>
`);

    const list = await runCli(ws, ['list', '--specs', '--json']);
    expect(list.stderr).toBe('');
    expect(list.exitCode).toBe(0);
    const specs = JSON.parse(list.stdout) as Array<{ id: string; format: string; requirements: number; scenarios: number }>;
    expect(specs.find((spec) => spec.id === 'markdown-capability')?.format).toBe('markdown');
    expect(specs.find((spec) => spec.id === 'xml-capability')?.format).toBe('xml');
    expect(specs.find((spec) => spec.id === 'folder-capability')?.scenarios).toBe(1);

    const show = await runCli(ws, ['show', 'xml-capability', '--json']);
    expect(show.stderr).toBe('');
    expect(show.exitCode).toBe(0);
    const shown = JSON.parse(show.stdout) as { format: string; requirements: number; scenarios: number };
    expect(shown.format).toBe('xml');
    expect(shown.requirements).toBe(1);
    expect(shown.scenarios).toBe(1);

    const validate = await runCli(ws, ['validate', 'folder-capability', '--strict']);
    expect(validate.stderr).toBe('');
    expect(validate.exitCode).toBe(0);
    expect(validate.stdout).toContain('spec/folder-capability');
  });

  it('validates active tracks that use XML spec deltas without legacy spec.md', async () => {
    const ws = makeTempDir('codument-track-xml-delta-cli-');
    const trackId = 'add-xml-delta';
    writeFile(path.join(ws, 'codument', 'attractors', 'project.md'), '# project\n');
    writeFile(path.join(ws, 'codument', 'attractors', 'product.md'), '# product\n');
    writeFile(path.join(ws, 'codument', 'workflows', 'workflow.md'), '# workflow\n');
    writeFile(path.join(ws, 'codument', 'std', 'AGENTS.md'), '# agents\n');
    writeFile(path.join(ws, 'codument', 'std', 'workflow.md'), '# workflow\n');
    writeFile(path.join(ws, 'codument', 'std', 'plan-xml-spec.md'), '# plan\n');
    writeFile(path.join(ws, 'codument', 'std', 'protocols.md'), '# protocols\n');
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
    writeFile(path.join(ws, 'codument', 'tracks', trackId, 'proposal.md'), '# proposal\n');
    writeFile(path.join(ws, 'codument', 'tracks', trackId, 'plan.xml'), `<plan><metadata>
  <track_id>${trackId}</track_id>
  <type>feature</type>
  <status>new</status>
  <created_at>2026-05-30T01:00:00Z</created_at>
  <updated_at>2026-05-30T02:03:00Z</updated_at>
  <description>xml delta</description>
</metadata><phases></phases></plan>`);
    writeFile(path.join(ws, 'codument', 'tracks', trackId, 'spec_deltas', 'xml-capability', 'delta.xml'), `<spec-patch version="1">
  <requirement op="upsert" selector="spec://xml-capability/requirement/run" id="run">
    <statement>XML deltas SHALL validate.</statement>
    <case id="ok"><given>x</given><when>y</when><then>z</then></case>
  </requirement>
</spec-patch>
`);

    const validate = await runCli(ws, ['validate', trackId, '--strict']);
    expect(validate.stderr).toBe('');
    expect(validate.exitCode).toBe(0);
    expect(validate.stdout).toContain(`track/${trackId}`);
  });
});
