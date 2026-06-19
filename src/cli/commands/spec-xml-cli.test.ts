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
    <Goal>XML behavior deltas validate.</Goal>
    <Description>XML behavior deltas validate.</Description>
    <CreatedAt>2026-05-30T01:00:00Z</CreatedAt>
    <UpdatedAt>2026-05-30T02:03:00Z</UpdatedAt>
  </Metadata>
  <TaskSpace id="space_${trackId}" name="${trackId}">
    <SubNodes>
      <TaskGroup id="P1" name="Validate" status="NOT_STARTED">
        <SubNodes>
          <Task id="T1.1" name="Validate behavior delta" status="NOT_STARTED" />
        </SubNodes>
      </TaskGroup>
    </SubNodes>
  </TaskSpace>
</Track>`);
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
  it('lists and shows XML specs alongside Markdown specs', async () => {
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
  });

  it('validates active tracks that use behavior deltas without legacy spec.md', async () => {
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
    writeTrackXml(path.join(ws, 'codument', 'tracks', trackId), trackId);
    writeFile(path.join(ws, 'codument', 'tracks', trackId, 'behavior_deltas', 'xml-capability', 'delta.xml'), `<behavior-patch capability="xml-capability" version="1">
  <upsert selector="behavior://xml-capability/requirements/run">
    <requirement id="run">
      <statement>XML deltas SHALL validate.</statement>
      <case id="ok"><given>x</given><when>y</when><then>z</then></case>
    </requirement>
  </upsert>
</behavior-patch>
`);

    const validate = await runCli(ws, ['validate', trackId, '--strict']);
    expect(validate.stderr).toBe('');
    expect(validate.exitCode).toBe(0);
    expect(validate.stdout).toContain(`✓ ${trackId}: track.xml OK + 1 behavior delta(s)`);
  });
});
