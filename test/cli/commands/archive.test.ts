import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseXnl } from 'xnl-core';
import type { DataElementNode, XnlNode } from 'xnl-core';
import { archiveCommand } from '../../../src/cli/commands/archive';
import { setWorkspaceDir } from '../../../src/cli/utils';

const FULL_FIDELITY_DECISION_FIXTURE = path.resolve(
  __dirname,
  '../../resources/archive-decision-registry/full-fidelity',
);

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

function writeTrackXml(trackDir: string, trackId: string, updatedAt = '2026-05-30T14:32:00+08:00'): void {
  writeFile(path.join(trackDir, 'track.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<Track id="${trackId}" version="1" xmlns:cdt="urn:codument:v1">
  <Metadata>
    <Status>completed</Status>
    <Goal>archive test</Goal>
    <Description>archive test</Description>
    <CommitMode>manual</CommitMode>
    <CreatedAt>2026-05-30T01:00:00Z</CreatedAt>
    <UpdatedAt>${updatedAt}</UpdatedAt>
  </Metadata>
  <TaskSpace id="space_${trackId}" name="${trackId}">
    <SubNodes />
  </TaskSpace>
</Track>`);
}

function writeAttractorProfiles(ws: string, memoryEnabled: boolean): void {
  writeFile(path.join(ws, 'codument', 'config', 'attractor-profiles.xml'), `<AttractorProfiles>
  <Profile name="memory" enabled="${memoryEnabled ? 'true' : 'false'}" />
</AttractorProfiles>
`);
}

function writeModelingConfig(ws: string): void {
  writeFile(path.join(ws, 'codument', 'config', 'modeling.xml'), `<Modeling version="1" enabled="true">
  <Registry path="codument/modeling" />
  <Lint maxLines="400" maxNodes="8" />
  <MergePolicy>
    <Conflict type="same-field" resolve="human" />
    <Conflict type="delete-modify" resolve="human" />
    <Conflict type="add-add" resolve="human" />
  </MergePolicy>
</Modeling>
`);
}

function countDecisionNodes(nodes: XnlNode[]): number {
  let count = 0;
  const visit = (node: XnlNode): void => {
    if (!node || typeof node !== 'object' || (node as DataElementNode).kind !== 'DataElement') return;
    const element = node as DataElementNode;
    if (element.tag === 'decision') count += 1;
    for (const child of element.body ?? []) visit(child);
  };
  for (const node of nodes) visit(node);
  return count;
}

function recursiveFiles(root: string, extension?: string): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  const visit = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (!extension || entry.name.endsWith(extension)) {
        files.push(entryPath);
      }
    }
  };
  visit(root);
  return files.sort();
}

function decisionNodeId(node: DataElementNode): string | undefined {
  if (!node.id) return undefined;
  return [...node.id.namespace, node.id.name].join('.');
}

function registryDecisionNodes(registryRoot: string): DataElementNode[] {
  const decisionNodes: DataElementNode[] = [];
  const visit = (node: XnlNode): void => {
    if (!node || typeof node !== 'object' || (node as DataElementNode).kind !== 'DataElement') return;
    const element = node as DataElementNode;
    if (element.tag === 'decision') decisionNodes.push(element);
    for (const child of element.body ?? []) visit(child);
  };
  for (const file of recursiveFiles(registryRoot, '.xnl')) {
    const parsed = parseXnl(fs.readFileSync(file, 'utf-8'), { textBlockStyle: true });
    for (const node of parsed.nodes) visit(node);
  }
  return decisionNodes;
}

function snapshotFiles(root: string): Record<string, string> {
  return Object.fromEntries(
    recursiveFiles(root).map(file => [
      path.relative(root, file).replaceAll(path.sep, '/'),
      fs.readFileSync(file).toString('base64'),
    ]),
  );
}

async function runModelingValidate(
  repoRoot: string,
  cliEntry: string,
  ws: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([
    'bun',
    'run',
    cliEntry,
    '--workspace-dir',
    ws,
    'modeling',
    'validate',
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

describe('codument archive', () => {
  it('provides a full-fidelity decision forest fixture distinct from Markdown projection', () => {
    const rootSource = fs.readFileSync(
      path.join(FULL_FIDELITY_DECISION_FIXTURE, 'decisions.xnl'),
      'utf-8',
    );
    const recursiveSource = fs.readFileSync(
      path.join(
        FULL_FIDELITY_DECISION_FIXTURE,
        'decisions',
        'platform',
        'runtime',
        'conditional-activation.xnl',
      ),
      'utf-8',
    );

    const root = parseXnl(rootSource, { textBlockStyle: true });
    const recursive = parseXnl(recursiveSource, { textBlockStyle: true });
    expect(root.nodes).toHaveLength(2);
    expect(countDecisionNodes(root.nodes)).toBe(4);
    expect(countDecisionNodes(recursive.nodes)).toBe(1);

    const fullFixture = `${rootSource}\n${recursiveSource}`;
    for (const semanticSignal of [
      '<question ?>',
      '<recommendation ?>',
      '<options { } [',
      '<raw-answer ?>',
      '<decision-text ?>',
      '<rationale ?>',
      '<evidence ?>',
      'depends_on = [',
      'activation = {',
      'derived_from = [',
      'durable_candidate = false',
      '<vendor-note',
      '<extension-context',
      'unknown-extension-sentinel',
    ]) {
      expect(fullFixture).toContain(semanticSignal);
    }
  });

  it('archives root decisions.xnl and recursively nested decisions/**/*.xnl as one source set', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-decision-source-set-red-ws-');
    const trackId = 'archive-full-decision-source-set';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);

    writeAttractorProfiles(ws, false);
    writeTrackXml(trackDir, trackId);
    writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n\nArchive every XNL decision source.\n');
    fs.copyFileSync(
      path.join(FULL_FIDELITY_DECISION_FIXTURE, 'decisions.xnl'),
      path.join(trackDir, 'decisions.xnl'),
    );
    fs.cpSync(
      path.join(FULL_FIDELITY_DECISION_FIXTURE, 'decisions'),
      path.join(trackDir, 'decisions'),
      { recursive: true },
    );

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'archive',
      trackId,
      '--yes',
      '--skip-specs',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(stderr).toBe('');
    expect(exitCode).toBe(0);

    const registryRoot = path.join(ws, 'codument', 'decisions');
    const ids = new Set(registryDecisionNodes(registryRoot).map(decisionNodeId));

    // RED: the legacy archive path treats decisions/ as suppressing decisions.xnl and
    // only scans direct Markdown children, so neither fixture source reaches the registry.
    expect(ids).toContain('track.fixture.registry_format');
    expect(ids).toContain('track.fixture.conditional_activation');

    const archiveRoot = path.join(ws, 'codument', 'tracks', 'archived');
    const summary = recursiveFiles(archiveRoot, '.md')
      .find((file) => path.basename(file) === 'summary.md');
    expect(summary).toBeDefined();
    const summaryContent = fs.readFileSync(summary!, 'utf-8');
    expect(summaryContent).toContain('track.fixture.registry_format');
    expect(summaryContent).toContain('track.fixture.conditional_activation');
  });

  it('keeps equivalent XNL archive promotion idempotent without generating a Markdown registry view', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-decision-idempotent-view-ws-');
    const trackId = 'archive-idempotent-decision-view';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);
    const decision = `<decision #track.archive_idempotent_decision {
  status = "accepted"
  durable_candidate = true
}
(
  <question ?>Should equivalent archive input create a compatibility registry file?</?>
  <answer { }
  (
    <raw-answer ?>Keep it canonical.</?>
    <decision-text ?>Keep the canonical XNL node only.</?>
    <rationale ?>Equivalent promotion must remain idempotent.</?>
    <evidence ?>The registry already contains the same complete decision node.</?>
  )
  >
)
>
`;

    writeAttractorProfiles(ws, false);
    writeTrackXml(trackDir, trackId);
    writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n\nKeep decision promotion idempotent.\n');
    writeFile(path.join(trackDir, 'decisions.xnl'), decision);
    writeFile(path.join(ws, 'codument', 'decisions', 'registry.xnl'), decision);

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'archive',
      trackId,
      '--yes',
      '--skip-specs',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    expect(stderr).toBe('');
    expect(exitCode).toBe(0);

    const decisionRoot = path.join(ws, 'codument', 'decisions');
    expect(recursiveFiles(decisionRoot, '.xnl')).toEqual([
      path.join(decisionRoot, 'registry.xnl'),
    ]);
    expect(recursiveFiles(decisionRoot, '.md')).toHaveLength(0);
    expect(stdout).not.toContain('Promoted decision record');

    const archiveRoot = path.join(ws, 'codument', 'tracks', 'archived');
    const summary = recursiveFiles(archiveRoot, '.md')
      .find((file) => path.basename(file) === 'summary.md');
    expect(summary).toBeDefined();
    expect(fs.readFileSync(summary!, 'utf-8')).toContain('track.archive_idempotent_decision');
  });

  it('keeps repeated markerless XNL promotion semantically idempotent after serialization', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-decision-marker-idempotent-ws-');
    const firstTrackId = 'archive-marker-idempotent-first';
    const secondTrackId = 'archive-marker-idempotent-second';
    const firstTrackDir = path.join(ws, 'codument', 'tracks', 'active', firstTrackId);
    const secondTrackDir = path.join(ws, 'codument', 'tracks', 'active', secondTrackId);
    const decision = `<decision #track.archive_marker_idempotent {
  status = "accepted"
  durable_candidate = true
}
(
  <question ?>Should generated text markers change decision identity?</?>
  <answer { }
  (
    <raw-answer ?>No.</?>
    <decision-text ?>Compare complete XNL semantics while ignoring serializer-only markers.</?>
    <rationale ?>A repeated archive must be idempotent.</?>
    <evidence ?>The source intentionally uses markerless text elements.</?>
  )>
)>
`;

    writeAttractorProfiles(ws, false);
    for (const [trackId, trackDir, updatedAt] of [
      [firstTrackId, firstTrackDir, '2026-05-30T14:31:00+08:00'],
      [secondTrackId, secondTrackDir, '2026-05-30T14:32:00+08:00'],
    ] as const) {
      writeTrackXml(trackDir, trackId, updatedAt);
      writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n\nRepeat the same decision safely.\n');
      writeFile(path.join(trackDir, 'decisions.xnl'), decision);
    }

    const runArchive = async (trackId: string) => {
      const proc = Bun.spawn([
        'bun',
        'run',
        cliEntry,
        '--workspace-dir',
        ws,
        'archive',
        trackId,
        '--yes',
        '--skip-specs',
      ], {
        cwd: repoRoot,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      return {
        exitCode: await proc.exited,
        stdout: await new Response(proc.stdout).text(),
        stderr: await new Response(proc.stderr).text(),
      };
    };

    const first = await runArchive(firstTrackId);
    expect(first.exitCode).toBe(0);
    expect(first.stderr).toBe('');
    const registryRoot = path.join(ws, 'codument', 'decisions');
    const registryAfterFirst = snapshotFiles(registryRoot);

    const second = await runArchive(secondTrackId);
    expect(second.exitCode).toBe(0);
    expect(second.stderr).toBe('');
    expect(snapshotFiles(registryRoot)).toEqual(registryAfterFirst);
    expect(
      registryDecisionNodes(registryRoot)
        .filter(node => decisionNodeId(node) === 'track.archive_marker_idempotent'),
    ).toHaveLength(1);
  });

  it('deduplicates equivalent stable ids discovered in root and recursive XNL sources', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-decision-source-dedup-ws-');
    const trackId = 'archive-equivalent-source-dedup';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);
    const decision = `<decision #track.archive_equivalent_source {
  status = "accepted"
  durable_candidate = true
}
(
  <question ?>Can equivalent source definitions share one canonical identity?</?>
  <answer { }
  (
    <raw-answer ?>Yes.</?>
    <decision-text ?>Write one canonical node.</?>
    <rationale ?>Stable decision id is independent of source path.</?>
    <evidence ?>The same node appears in root and recursive sources.</?>
  )>
)>
`;

    writeAttractorProfiles(ws, false);
    writeTrackXml(trackDir, trackId);
    writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n\nDeduplicate equivalent sources.\n');
    writeFile(path.join(trackDir, 'decisions.xnl'), decision);
    writeFile(path.join(trackDir, 'decisions', 'nested', 'same.xnl'), decision);

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'archive',
      trackId,
      '--yes',
      '--skip-specs',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(await proc.exited).toBe(0);
    expect(await new Response(proc.stderr).text()).toBe('');
    const registryRoot = path.join(ws, 'codument', 'decisions');
    expect(
      registryDecisionNodes(registryRoot)
        .filter(node => decisionNodeId(node) === 'track.archive_equivalent_source'),
    ).toHaveLength(1);
  });

  it('rejects a staged decision registry with dangling references before live writes', async () => {
    const originalCwd = process.cwd();
    const ws = makeTempDir('codument-archive-invalid-decision-reference-ws-');
    const trackId = 'archive-invalid-decision-reference';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);
    const archiveDir = path.join(
      ws,
      'codument',
      'tracks',
      'archived',
      '2026-05',
      `2026-05-30-0632-${trackId}`,
    );

    writeAttractorProfiles(ws, false);
    writeTrackXml(trackDir, trackId);
    writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n\nReject invalid references.\n');
    writeFile(path.join(trackDir, 'decisions.xnl'), `<decision #track.archive_invalid_reference {
  status = "accepted"
  durable_candidate = true
  depends_on = ["track.missing_dependency"]
}>
`);

    setWorkspaceDir(ws);
    try {
      await expect(
        archiveCommand([trackId, '--yes', '--skip-specs']),
      ).rejects.toThrow("unresolved depends_on reference 'track.missing_dependency'");
    } finally {
      setWorkspaceDir(originalCwd);
    }

    expect(fs.existsSync(path.join(ws, 'codument', 'decisions'))).toBe(false);
    expect(fs.existsSync(trackDir)).toBe(true);
    expect(fs.existsSync(archiveDir)).toBe(false);
    expect(
      fs.readdirSync(path.join(ws, 'codument')).some((name) => name.startsWith('.archive-staging-')),
    ).toBe(false);
  });

  it('preserves the full decision AST and nested durable tree closure in the XNL registry', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-decision-ast-red-ws-');
    const trackId = 'archive-full-decision-ast';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);

    writeAttractorProfiles(ws, false);
    writeTrackXml(trackDir, trackId);
    writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n\nPreserve the complete decision forest.\n');
    fs.copyFileSync(
      path.join(FULL_FIDELITY_DECISION_FIXTURE, 'decisions.xnl'),
      path.join(trackDir, 'decisions.xnl'),
    );

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'archive',
      trackId,
      '--yes',
      '--skip-specs',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(stderr).toBe('');
    expect(exitCode).toBe(0);

    const registryRoot = path.join(ws, 'codument', 'decisions');
    const xnlFiles = recursiveFiles(registryRoot, '.xnl');

    // RED: the legacy implementation writes flattened decision.md summaries, so
    // no canonical XNL AST exists and every assertion below is currently violated.
    expect(xnlFiles.length).toBeGreaterThan(0);
    expect(recursiveFiles(registryRoot, '.md')).toHaveLength(0);

    const nodes = registryDecisionNodes(registryRoot);
    const registryFormat = nodes.find(
      node => decisionNodeId(node) === 'track.fixture.registry_format',
    );
    expect(registryFormat).toBeDefined();
    expect(registryFormat!.attributes?.extension_policy).toEqual({
      namespace: 'fixture.vendor',
      schema_version: 7,
    });
    expect(registryFormat!.extend?.children?.recommendation).toMatchObject({
      text: 'Preserve the complete XNL decision forest.',
    });
    expect(registryFormat!.extend?.children?.['vendor-note']).toMatchObject({
      attributes: { format: 'opaque-v1' },
      text: expect.stringContaining('unknown extension slot'),
    });
    expect(
      (registryFormat!.body ?? [])
        .filter((node): node is DataElementNode =>
          Boolean(node && typeof node === 'object' && (node as DataElementNode).kind === 'DataElement'),
        )
        .map(decisionNodeId),
    ).toContain('track.fixture.registry_format.owner_policy');

    const nonDurableContext = nodes.find(
      node => decisionNodeId(node) === 'track.fixture.non_durable_context',
    );
    expect(nonDurableContext).toBeDefined();
    expect(nonDurableContext!.attributes?.durable_candidate).toBe(false);
    expect(
      (nonDurableContext!.body ?? [])
        .filter((node): node is DataElementNode =>
          Boolean(node && typeof node === 'object' && (node as DataElementNode).kind === 'DataElement'),
        )
        .map(decisionNodeId),
    ).toContain('track.fixture.non_durable_context.audit_child');

    const auditChild = nodes.find(
      node => decisionNodeId(node) === 'track.fixture.non_durable_context.audit_child',
    );
    expect(auditChild).toBeDefined();
    expect(auditChild!.attributes?.depends_on).toEqual([
      'track.fixture.registry_format.owner_policy',
    ]);
    expect(auditChild!.attributes?.activation).toEqual({
      all: ['track.fixture.non_durable_context=regulated'],
    });
    expect(auditChild!.attributes?.derived_from).toEqual([
      'track.fixture.non_durable_context=regulated',
    ]);
    expect(auditChild!.extend?.children?.answer).toMatchObject({
      extend: {
        children: {
          'raw-answer': { text: 'Yes.' },
          'decision-text': {
            text: 'Every promoted node retains provenance and merge evidence.',
          },
          rationale: {
            text: 'A durable child cannot be understood after flattening away its context.',
          },
        },
      },
    });
  });

  it('rejects a conflicting stable decision id instead of creating a timestamped duplicate', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-duplicate-id-red-ws-');
    const firstTrackId = 'archive-shared-decision-first';
    const secondTrackId = 'archive-shared-decision-conflict';
    const firstTrackDir = path.join(ws, 'codument', 'tracks', 'active', firstTrackId);
    const secondTrackDir = path.join(ws, 'codument', 'tracks', 'active', secondTrackId);
    const sharedDecision = (
      decisionText: string,
      evidence: string,
    ): string => `<decision #track.fixture.shared_registry_policy {
  status = "accepted"
  durable_candidate = true
}
(
  <question ?>Which shared registry policy applies?</?>
  <answer { }
  (
    <raw-answer ?>Apply the recorded shared policy.</?>
    <decision-text ?>${decisionText}</?>
    <rationale ?>The shared policy must retain one stable identity.</?>
    <evidence ?>${evidence}</?>
  )
  >
)>
`;

    writeAttractorProfiles(ws, false);
    writeTrackXml(firstTrackDir, firstTrackId, '2026-05-30T14:31:00+08:00');
    writeFile(path.join(firstTrackDir, 'proposal.md'), '# Proposal\n\nFirst decision owner.\n');
    writeFile(
      path.join(firstTrackDir, 'decisions.xnl'),
      sharedDecision('Use the first registry policy.', 'Approved by the first archive.'),
    );

    const first = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'archive',
      firstTrackId,
      '--yes',
      '--skip-specs',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(await first.exited).toBe(0);
    expect(await new Response(first.stderr).text()).toBe('');

    const registryRoot = path.join(ws, 'codument', 'decisions');
    const registryBeforeConflict = snapshotFiles(registryRoot);

    writeTrackXml(secondTrackDir, secondTrackId, '2026-05-30T14:32:00+08:00');
    writeFile(path.join(secondTrackDir, 'proposal.md'), '# Proposal\n\nConflicting decision owner.\n');
    writeFile(
      path.join(secondTrackDir, 'decisions.xnl'),
      sharedDecision('Use a conflicting registry policy.', 'Approved by the second archive.'),
    );

    const second = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'archive',
      secondTrackId,
      '--yes',
      '--skip-specs',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const secondExitCode = await second.exited;
    const secondStdout = await new Response(second.stdout).text();
    const secondStderr = await new Response(second.stderr).text();

    // RED: the legacy implementation keys output by timestamp and silently writes
    // another decision.md for the same logical id instead of reporting a node conflict.
    expect(secondExitCode).not.toBe(0);
    expect(`${secondStdout}\n${secondStderr}`).toMatch(/conflict|duplicate/i);
    expect(snapshotFiles(registryRoot)).toEqual(registryBeforeConflict);
    expect(fs.existsSync(secondTrackDir)).toBe(true);
    const archivedMonth = path.join(ws, 'codument', 'tracks', 'archived', '2026-05');
    expect(
      fs.existsSync(archivedMonth)
        ? fs.readdirSync(archivedMonth).some(entry => entry.endsWith(secondTrackId))
        : false,
    ).toBe(false);
  });

  it('uses track UpdatedAt minute prefix for explicit legacy Markdown compatibility and memory promotion', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-ws-');
    const trackId = 'archive-minute-prefix';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);

    writeFile(path.join(ws, 'codument', 'attractors', 'project.md'), '# p\n');
    writeFile(path.join(ws, 'codument', 'attractors', 'product.md'), '# p\n');
    writeAttractorProfiles(ws, true);
    writeTrackXml(trackDir, trackId);
    writeFile(path.join(trackDir, 'spec.md'), '## ADDED Requirements\n### Requirement: X\n#### Scenario: Y\n');
    writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n\nArchive behavior.\n');
    writeFile(path.join(trackDir, 'decisions.md'), '# Decisions\n\n### Durable\nUse new archive layout.\n');
    writeFile(path.join(trackDir, 'memory', 'patterns', 'archive-layout.md'), '# Archive Layout\n\nUse minute-level archive prefixes.\n');

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'archive',
      trackId,
      '--yes',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const err = await new Response(proc.stderr).text();
    expect(err).toBe('');
    expect(exitCode).toBe(0);

    const archiveRoot = path.join(ws, 'codument', 'tracks', 'archived', '2026-05');
    const archived = fs.readdirSync(archiveRoot).find((name) => name.endsWith(trackId));
    expect(archived).toBeDefined();
    expect(archived).toContain('2026-05-30');
    const decisionRoot = path.join(ws, 'codument', 'decisions', '2026-05');
    expect(fs.existsSync(decisionRoot)).toBe(true);
    const decisionDir = fs.readdirSync(decisionRoot)[0];
    expect(fs.readFileSync(path.join(decisionRoot, decisionDir, 'decision.md'), 'utf-8')).toContain('decision://archive-minute-prefix');
    const memoryRoot = path.join(ws, 'codument', 'memory', 'patterns', '2026-05');
    expect(fs.existsSync(memoryRoot)).toBe(true);
    const memoryDir = fs.readdirSync(memoryRoot)[0];
    expect(fs.readFileSync(path.join(memoryRoot, memoryDir, 'pattern.md'), 'utf-8')).toContain('memory://patterns/archive-layout');
    expect(fs.existsSync(path.join(ws, 'codument', 'memory', 'index.md'))).toBe(false);
  });

  it('does not promote non-durable decisions or synthesize memory summaries', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-no-promotion-ws-');
    const trackId = 'archive-no-promotion';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);

    writeAttractorProfiles(ws, true);
    writeTrackXml(trackDir, trackId);
    writeFile(path.join(trackDir, 'spec.md'), '## ADDED Requirements\n### Requirement: X\n#### Scenario: Y\n');
    writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n\nArchive behavior.\n');
    writeFile(path.join(trackDir, 'decisions.md'), '# Decisions\n\n### 1. Local choice\nUse temporary debug logging.\n');

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'archive',
      trackId,
      '--yes',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const err = await new Response(proc.stderr).text();
    expect(err).toBe('');
    expect(exitCode).toBe(0);

    expect(fs.existsSync(path.join(ws, 'codument', 'decisions'))).toBe(false);
    expect(fs.existsSync(path.join(ws, 'codument', 'memory'))).toBe(false);
  });

  it('merges durable root decisions.xnl records into the canonical XNL registry', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-xnl-decision-ws-');
    const trackId = 'archive-xnl-decision';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);

    writeAttractorProfiles(ws, false);
    writeTrackXml(trackDir, trackId);
    writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n\nXNL decision archive behavior.\n');
    writeFile(path.join(trackDir, 'decisions.xnl'), `<decision #track.archive_xnl_decision.promote_durable {
  status = "accepted"
  blocks = []
  durable_candidate = true
}
(
  <question ?>Promote this decision?</?>
  <evidence ?>The user approved decisions.xnl as the canonical carrier.</?>
  <confidence ?>0.94</?>
  <reversibility ?>moderate</?>
)>
`);

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'archive',
      trackId,
      '--yes',
      '--skip-specs',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const err = await new Response(proc.stderr).text();
    expect(err).toBe('');
    expect(exitCode).toBe(0);

    const promotedPath = path.join(ws, 'codument', 'decisions', 'registry.xnl');
    const promoted = fs.readFileSync(promotedPath, 'utf-8');
    expect(promoted).toContain('#track.archive_xnl_decision.promote_durable');
    expect(promoted).toContain('The user approved decisions.xnl as the canonical carrier.');
    expect(fs.existsSync(path.join(ws, 'codument', 'decisions', '2026-05'))).toBe(false);
    const archiveRoot = path.join(ws, 'codument', 'tracks', 'archived', '2026-05');
    const archived = fs.readdirSync(archiveRoot).find((name) => name.endsWith(trackId))!;
    expect(fs.readFileSync(path.join(archiveRoot, archived, 'summary.md'), 'utf-8')).toContain(
      'track.archive_xnl_decision.promote_durable',
    );
  });

  it('rejects malformed decisions.xnl before registry mutation or track movement', async () => {
    const ws = makeTempDir('codument-archive-invalid-xnl-ws-');
    const trackId = 'archive-invalid-xnl';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);
    const previous = process.cwd();

    try {
      process.chdir(ws);
      writeAttractorProfiles(ws, false);
      writeTrackXml(trackDir, trackId);
      writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n\nInvalid XNL guard.\n');
      writeFile(path.join(trackDir, 'decisions.xnl'), '<decision #track.archive_invalid_xnl { status = "accepted" }');

      await expect(archiveCommand([trackId, '--yes', '--skip-specs'])).rejects.toThrow('Invalid decisions.xnl before archive');

      expect(fs.existsSync(trackDir)).toBe(true);
      const archiveMonth = path.join(ws, 'codument', 'tracks', 'archived', '2026-05');
      expect(fs.existsSync(archiveMonth)).toBe(true);
      expect(fs.readdirSync(archiveMonth)).toHaveLength(0);
      expect(fs.existsSync(path.join(ws, 'codument', 'decisions'))).toBe(false);
    } finally {
      process.chdir(previous);
    }
  });

  it('keeps explicit legacy decision-directory Markdown promotion as a compatibility fallback', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-decision-dir-ws-');
    const trackId = 'archive-decision-dir';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);

    writeAttractorProfiles(ws, false);
    writeTrackXml(trackDir, trackId);
    writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n\nDecision directory behavior.\n');
    writeFile(path.join(trackDir, 'decisions', 'use-xml-specs.md'), '# Use XML Specs\n\n### Durable\nUse XML specs as the registry format.\n');
    writeFile(path.join(trackDir, 'decisions', 'keep-markdown-compat.md'), '# Keep Markdown Compat\n\n### Durable\nKeep Markdown specs readable during migration.\n');

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'archive',
      trackId,
      '--yes',
      '--skip-specs',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const err = await new Response(proc.stderr).text();
    expect(err).toBe('');
    expect(exitCode).toBe(0);

    const decisionRoot = path.join(ws, 'codument', 'decisions', '2026-05');
    const promotedDirs = fs.readdirSync(decisionRoot).sort();
    expect(promotedDirs).toHaveLength(2);
    for (const dirName of promotedDirs) {
      expect(fs.existsSync(path.join(decisionRoot, dirName, 'decision.md'))).toBe(true);
    }
    const xmlDecision = fs.readFileSync(path.join(
      decisionRoot,
      promotedDirs.find((dirName) => dirName.endsWith('use-xml-specs'))!,
      'decision.md'
    ), 'utf-8');
    const markdownDecision = fs.readFileSync(path.join(
      decisionRoot,
      promotedDirs.find((dirName) => dirName.endsWith('keep-markdown-compat'))!,
      'decision.md'
    ), 'utf-8');
    expect(xmlDecision).toContain('Decision URI: decision://use-xml-specs');
    expect(markdownDecision).toContain('Decision URI: decision://keep-markdown-compat');
  });

  it('keeps legacy Markdown decision compatibility inside Codument and ignores old knowledge sync targets', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-knowledge-sync-ws-');
    const trackId = 'archive-knowledge-sync';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);

    writeFile(path.join(ws, 'docs', '.gitkeep'), '');
    writeFile(path.join(ws, 'codument', 'attractors', 'docs-knowledge.md'), '# Docs Knowledge\n');
    writeFile(path.join(ws, 'codument', 'config', 'feature.json'), JSON.stringify({
      knowledgeSync: {
        enabled: true,
        targets: [{ name: 'main-docs', root: 'docs', attractor: 'codument/attractors/docs-knowledge.md' }],
      },
      projectMemory: { enabled: false },
    }, null, 2));
    writeTrackXml(trackDir, trackId);
    writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n\nArchive knowledge sync behavior.\n');
    writeFile(path.join(trackDir, 'decisions', 'use-docs-sync.md'), '# Use Docs Sync\n\n### Durable\nKeep durable decisions in the Codument decision registry.\n');

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'archive',
      trackId,
      '--yes',
      '--skip-specs',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const err = await new Response(proc.stderr).text();
    expect(err).toBe('');
    expect(exitCode).toBe(0);

    const decisionRoot = path.join(ws, 'codument', 'decisions', '2026-05');
    expect(fs.existsSync(decisionRoot)).toBe(true);
    const promotedDecisionDir = fs.readdirSync(decisionRoot)[0];
    const promotedDecision = fs.readFileSync(path.join(decisionRoot, promotedDecisionDir, 'decision.md'), 'utf-8');
    expect(promotedDecision).toContain('Decision URI: decision://use-docs-sync');
    expect(promotedDecision).toContain('Source: archive://');
    expect(fs.existsSync(path.join(ws, 'docs', '2026-05'))).toBe(false);
  });

  it('does not validate legacy knowledge target roots during archive', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-missing-knowledge-target-ws-');
    const externalRoot = path.join(os.tmpdir(), `codument-missing-target-${Date.now()}`);
    const trackId = 'archive-missing-knowledge-target';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);

    writeFile(path.join(ws, 'codument', 'config', 'feature.json'), JSON.stringify({
      knowledgeSync: {
        enabled: true,
        targets: [{ name: 'external-docs', root: externalRoot }],
      },
      projectMemory: { enabled: false },
    }, null, 2));
    writeTrackXml(trackDir, trackId);
    writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n\nArchive missing knowledge target behavior.\n');
    writeFile(path.join(trackDir, 'decisions', 'external-docs.md'), '# External Docs\n\n### Durable\nDo not create missing external roots silently.\n');

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'archive',
      trackId,
      '--yes',
      '--skip-specs',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const err = await new Response(proc.stderr).text();
    expect(err).toBe('');
    expect(exitCode).toBe(0);
    expect(fs.existsSync(externalRoot)).toBe(false);
    expect(fs.existsSync(trackDir)).toBe(false);
  });

  it('applies XML spec patches from archived tracks to the spec registry', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-xml-ws-');
    const trackId = 'archive-xml-patch';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);

    writeFile(path.join(ws, 'codument', 'specs', 'billing.xml'), `<capability id="billing">
  <requirement id="invoice">
    <statement>Invoices are tracked.</statement>
    <suite id="create">
      <case id="old-case">
        <given>old</given>
        <when>old</when>
        <then>old</then>
      </case>
    </suite>
  </requirement>
</capability>
`);
    writeTrackXml(trackDir, trackId, '2026-05-30T02:03:00Z');
    writeFile(path.join(trackDir, 'spec.xml'), `<spec-patch version="1">
  <case op="upsert" selector="spec://billing/requirement/invoice/suite/create/case/new-case" id="new-case">
    <given>draft invoice exists</given>
    <when>invoice is finalized</when>
    <then>invoice total is locked</then>
  </case>
  <case op="delete" selector="spec://billing/requirement/invoice/suite/create/case/old-case" />
</spec-patch>
`);

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'archive',
      trackId,
      '--yes',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const err = await new Response(proc.stderr).text();
    expect(err).toBe('');
    expect(exitCode).toBe(0);

    const updatedSpec = fs.readFileSync(path.join(ws, 'codument', 'specs', 'billing.xml'), 'utf-8');
    expect(updatedSpec).toContain('id="new-case"');
    expect(updatedSpec).toContain('invoice total is locked');
    expect(updatedSpec).not.toContain('id="old-case"');
  });

  it('applies recursive behavior_deltas XML patches and creates missing capability registries', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-behavior-deltas-ws-');
    const trackId = 'add-deepseek-cache';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);

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
    writeFile(path.join(trackDir, 'proposal.md'), '# proposal\n');
    writeTrackXml(trackDir, trackId, '2026-05-30T02:03:00Z');
    writeFile(path.join(trackDir, 'behavior_deltas', 'provider.deepseek', 'delta.xml'), `<behavior-patch capability="provider.deepseek" version="1">
  <upsert selector="behavior://provider.deepseek/requirements/cache-support">
    <requirement id="cache-support">
      <statement>系统 SHALL 支持 DeepSeek 前缀缓存。</statement>
      <suite id="request-build" name="请求构建">
        <case id="inject-cache-control">
          <given>provider 为 deepseek</given>
          <when>系统构造请求</when>
          <then>系统 SHALL 插入 cache_control</then>
        </case>
      </suite>
    </requirement>
  </upsert>
</behavior-patch>
`);

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'archive',
      trackId,
      '--yes',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const err = await new Response(proc.stderr).text();
    expect(err).toBe('');
    expect(exitCode).toBe(0);

    const behaviorPath = path.join(ws, 'codument', 'behaviors', 'provider.deepseek.xml');
    expect(fs.existsSync(behaviorPath)).toBe(true);
    const updatedBehavior = fs.readFileSync(behaviorPath, 'utf-8');
    expect(updatedBehavior).toContain('<behaviors capability="provider.deepseek"');
    expect(updatedBehavior).toContain('id="cache-support"');
    expect(updatedBehavior).toContain('inject-cache-control');
  });

  it('commits behavior, modeling, engineering, and decision registries before moving the track', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-all-registries-ws-');
    const trackId = 'archive-all-registries';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);
    const archiveRoot = path.join(ws, 'codument', 'tracks', 'archived', '2026-05');

    writeModelingConfig(ws);
    writeFile(path.join(ws, 'codument', 'config', 'engineering.xml'), `<Engineering version="1" enabled="true">
  <Registry path="codument/engineering" />
  <MergePolicy>
    <Conflict type="same-field" resolve="human" />
    <Conflict type="delete-modify" resolve="human" />
    <Conflict type="add-add" resolve="human" />
  </MergePolicy>
</Engineering>
`);
    Bun.spawnSync(['git', 'init'], { cwd: ws });
    Bun.spawnSync(['git', 'add', 'codument/config'], { cwd: ws });
    const commitProc = Bun.spawnSync([
      'git',
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '-m',
      'workspace registry configuration',
    ], { cwd: ws });
    expect(commitProc.exitCode).toBe(0);
    const revProc = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: ws, stdout: 'pipe' });
    const baseCommit = new TextDecoder().decode(revProc.stdout).trim();

    writeTrackXml(trackDir, trackId, '2026-05-30T02:03:00+03:00');
    let trackXml = fs.readFileSync(path.join(trackDir, 'track.xml'), 'utf-8');
    trackXml = trackXml.replace(
      '</Metadata>',
      `    <ModelingBaseCommit>${baseCommit}</ModelingBaseCommit>\n`
        + `    <EngineeringBaseCommit>${baseCommit}</EngineeringBaseCommit>\n`
        + '  </Metadata>',
    );
    fs.writeFileSync(path.join(trackDir, 'track.xml'), trackXml, 'utf-8');
    writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n\nArchive all registries together.\n');
    writeFile(path.join(trackDir, 'decisions.xnl'), `<decision #track.archive_all_registries.atomic {
  status = "accepted"
  durable_candidate = true
}
(
  <question ?>Must all registries commit before track movement?</?>
  <answer { }
  (
    <raw-answer ?>Yes.</?>
    <decision-text ?>Commit all registries atomically.</?>
    <rationale ?>Partial registry state is invalid.</?>
    <evidence ?>The archive transaction owns all registry stages.</?>
  )>
)>
`);
    writeFile(path.join(trackDir, 'behavior_deltas', 'orders', 'delta.xml'), `<behavior-patch capability="orders" version="1">
  <upsert selector="behavior://orders/requirements/archive-safety">
    <requirement id="archive-safety">
      <statement>Archive commits every applicable registry together.</statement>
    </requirement>
  </upsert>
</behavior-patch>
`);
    writeFile(path.join(trackDir, 'modeling_deltas', 'domain', 'orders.xnl'), `<object #orders.order { kind = "entity" fact_grade = "authoritative_fact" single_writer = "backend.order_store" } [
  <desc ?>订单结构。</?>
  <types ?t>interface Order { id: string; status: string }</?t>
]>
`);
    writeFile(path.join(trackDir, 'engineering_deltas', 'global', 'howto', 'orders.xnl'), `<howto #global.howto.orders.add_endpoint kind="howto" [
  <when-to-use ?m>
  需要新增订单 endpoint 时使用。
  </?m>
  <steps ?m>
  1. 补 behavior case。
  </?m>
  <verification ?m>
  运行 route tests。
  </?m>
]>
`);

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'archive',
      trackId,
      '--yes',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    expect(stderr).toBe('');
    expect(exitCode).toBe(0);

    const behavior = fs.readFileSync(path.join(ws, 'codument', 'behaviors', 'orders.xml'), 'utf-8');
    const modeling = fs.readFileSync(
      path.join(ws, 'codument', 'modeling', 'domain', 'orders', 'index.xnl'),
      'utf-8',
    );
    const engineering = fs.readFileSync(path.join(ws, 'codument', 'engineering', 'global', 'howto', 'orders.xnl'), 'utf-8');
    const decision = fs.readFileSync(path.join(ws, 'codument', 'decisions', 'registry.xnl'), 'utf-8');
    expect(behavior).toContain('Archive commits every applicable registry together.');
    expect(modeling).toContain('#orders.order');
    expect(engineering).toContain('#global.howto.orders.add_endpoint');
    expect(decision).toContain('#track.archive_all_registries.atomic');
    expect(fs.existsSync(trackDir)).toBe(false);
    expect(fs.readdirSync(archiveRoot).some((name) => name.endsWith(trackId))).toBe(true);
    expect(stdout).toContain('✓ Updated behavior/spec registry: orders');
    expect(stdout).toContain(`✓ Updated modeling registry: ${path.join('domain', 'orders', 'index.xnl')}`);
    expect(stdout).toContain(`✓ Updated engineering registry: ${path.join('global', 'howto', 'orders.xnl')}`);
    expect(stdout).toContain('✓ Updated decision registry: registry.xnl');
  });

  it('three-way merges disjoint modeling registry and track changes when modeling is enabled', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-modeling-merge-ws-');
    const trackId = 'merge-modeling-registry';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);
    const registryPath = path.join(
      ws,
      'codument',
      'modeling',
      'domain',
      'orders',
      'index.xnl',
    );

    writeModelingConfig(ws);
    writeFile(registryPath, `<object #orders.order { kind = "entity" fact_grade = "authoritative_fact" single_writer = "backend.order_store" a = "1" b = "1" } [
  <desc ?>订单结构。</?>
  <types ?t>interface Order { id: string; status: string }</?t>
]>
`);

    Bun.spawnSync(['git', 'init'], { cwd: ws });
    Bun.spawnSync(['git', 'add', 'codument/modeling'], { cwd: ws });
    const commitProc = Bun.spawnSync([
      'git',
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '-m',
      'base modeling registry',
    ], { cwd: ws });
    expect(commitProc.exitCode).toBe(0);
    const revProc = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: ws, stdout: 'pipe' });
    const baseCommit = new TextDecoder().decode(revProc.stdout).trim();

    writeFile(registryPath, `<object #orders.order { kind = "entity" fact_grade = "authoritative_fact" single_writer = "backend.order_store" a = "1" b = "2" } [
  <desc ?>订单结构。</?>
  <types ?t>interface Order { id: string; status: string }</?t>
]>
`);
    writeTrackXml(trackDir, trackId, '2026-05-30T02:03:00Z');
    let trackXml = fs.readFileSync(path.join(trackDir, 'track.xml'), 'utf-8');
    trackXml = trackXml.replace('</Metadata>', `    <ModelingBaseCommit>${baseCommit}</ModelingBaseCommit>\n  </Metadata>`);
    fs.writeFileSync(path.join(trackDir, 'track.xml'), trackXml, 'utf-8');
    writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n\nModeling delta archive behavior.\n');
    writeFile(path.join(trackDir, 'modeling_deltas', 'domain', 'orders.xnl'), `<object #orders.order { kind = "entity" fact_grade = "authoritative_fact" single_writer = "backend.order_store" a = "2" b = "1" } [
  <desc ?>订单结构。</?>
  <types ?t>interface Order { id: string; status: string }</?t>
]>
`);

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'archive',
      trackId,
      '--yes',
      '--skip-specs',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const err = await new Response(proc.stderr).text();
    expect(err).toBe('');
    expect(exitCode).toBe(0);

    const updated = fs.readFileSync(registryPath, 'utf-8');
    expect(updated).toContain('a = "2"');
    expect(updated).toContain('b = "2"');
    expect(fs.existsSync(path.join(ws, 'codument', 'modeling', 'domain', 'orders.xnl'))).toBe(false);
    const validation = await runModelingValidate(repoRoot, cliEntry, ws);
    expect(validation.stderr).toBe('');
    expect(validation.exitCode).toBe(0);
    expect(validation.stdout).toContain('✓ modeling validate: no issues');
    expect(fs.existsSync(trackDir)).toBe(false);
  });

  it('creates the modeling registry from a first valid delta when modeling is enabled', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-modeling-first-registry-ws-');
    const trackId = 'create-modeling-registry';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);

    writeModelingConfig(ws);
    Bun.spawnSync(['git', 'init'], { cwd: ws });
    Bun.spawnSync(['git', 'add', 'codument/config/modeling.xml'], { cwd: ws });
    const commitProc = Bun.spawnSync([
      'git',
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '-m',
      'workspace before modeling registry',
    ], { cwd: ws });
    expect(commitProc.exitCode).toBe(0);
    const revProc = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: ws, stdout: 'pipe' });
    const baseCommit = new TextDecoder().decode(revProc.stdout).trim();

    writeTrackXml(trackDir, trackId, '2026-05-30T02:03:00Z');
    let trackXml = fs.readFileSync(path.join(trackDir, 'track.xml'), 'utf-8');
    trackXml = trackXml.replace('</Metadata>', `    <ModelingBaseCommit>${baseCommit}</ModelingBaseCommit>\n  </Metadata>`);
    fs.writeFileSync(path.join(trackDir, 'track.xml'), trackXml, 'utf-8');
    writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n\nFirst modeling registry archive behavior.\n');
    writeFile(path.join(trackDir, 'modeling_deltas', 'domain', 'orders.xnl'), `<object #orders.order { kind = "entity" fact_grade = "authoritative_fact" single_writer = "backend.order_store" } [
  <desc ?>订单结构。</?>
  <types ?t>interface Order { id: string; status: string }</?t>
]>
`);

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'archive',
      trackId,
      '--yes',
      '--skip-specs',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const err = await new Response(proc.stderr).text();
    expect(err).toBe('');
    expect(exitCode).toBe(0);

    const registryPath = path.join(
      ws,
      'codument',
      'modeling',
      'domain',
      'orders',
      'index.xnl',
    );
    expect(fs.existsSync(registryPath)).toBe(true);
    expect(fs.readFileSync(registryPath, 'utf-8')).toContain('#orders.order');
    expect(fs.existsSync(path.join(ws, 'codument', 'modeling', 'domain', 'orders.xnl'))).toBe(false);
    const validation = await runModelingValidate(repoRoot, cliEntry, ws);
    expect(validation.stderr).toBe('');
    expect(validation.exitCode).toBe(0);
    expect(validation.stdout).toContain('✓ modeling validate: no issues');
    expect(fs.existsSync(trackDir)).toBe(false);
  });

  it('does not create an empty modeling registry when an enabled track has no modeling deltas', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-modeling-no-delta-ws-');
    const trackId = 'archive-without-modeling-delta';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);

    writeModelingConfig(ws);
    writeTrackXml(trackDir, trackId, '2026-05-30T02:03:00Z');
    writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n\nNo modeling delta archive behavior.\n');

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'archive',
      trackId,
      '--yes',
      '--skip-specs',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const err = await new Response(proc.stderr).text();
    expect(err).toBe('');
    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(ws, 'codument', 'modeling'))).toBe(false);
    expect(fs.existsSync(trackDir)).toBe(false);
  });

  it('leaves the live behavior registry unchanged when a later behavior patch fails during prepare', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-behavior-prepare-failure-ws-');
    const trackId = 'behavior-prepare-failure';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);
    const behaviorPath = path.join(ws, 'codument', 'behaviors', 'orders.xml');
    const archiveDir = path.join(
      ws,
      'codument',
      'tracks',
      'archived',
      '2026-05',
      `2026-05-30-0203-${trackId}`,
    );
    const originalBehavior = `<behaviors capability="orders" version="1">
  <requirement id="archive-safety">
    <statement>Archive preserves registry consistency.</statement>
  </requirement>
</behaviors>
`;

    writeFile(behaviorPath, originalBehavior);
    writeTrackXml(trackDir, trackId, '2026-05-30T02:03:00+03:00');
    writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n\nBehavior prepare failure.\n');
    writeFile(path.join(trackDir, 'behavior_deltas', 'a-valid', 'delta.xml'), `<behavior-patch capability="orders" version="1">
  <upsert selector="behavior://orders/requirements/archive-safety">
    <requirement id="archive-safety">
      <statement>This update must stay staged until every patch succeeds.</statement>
    </requirement>
  </upsert>
</behavior-patch>
`);
    writeFile(path.join(trackDir, 'behavior_deltas', 'z-invalid', 'delta.xml'), `<behavior-patch capability="orders" version="1">
  <delete selector="behavior://orders/requirements/missing-requirement" />
</behavior-patch>
`);

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'archive',
      trackId,
      '--yes',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    expect(exitCode).not.toBe(0);
    expect(fs.readFileSync(behaviorPath, 'utf-8')).toBe(originalBehavior);
    expect(fs.existsSync(trackDir)).toBe(true);
    expect(fs.existsSync(archiveDir)).toBe(false);
    expect(
      fs.readdirSync(path.join(ws, 'codument')).some((name) => name.startsWith('.archive-staging-')),
    ).toBe(false);
  });

  it('rolls back behavior registry when a later engineering write fails', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-registry-rollback-ws-');
    const trackId = 'rollback-cross-registry-write';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);
    const behaviorPath = path.join(ws, 'codument', 'behaviors', 'orders.xml');
    const engineeringPath = path.join(ws, 'codument', 'engineering', 'global', 'howto', 'orders.xnl');
    const archiveDir = path.join(
      ws,
      'codument',
      'tracks',
      'archived',
      '2026-05',
      `2026-05-30-0203-${trackId}`,
    );
    const originalBehavior = `<behaviors capability="orders" version="1">
  <requirement id="archive-safety">
    <statement>Archive preserves registry consistency.</statement>
  </requirement>
</behaviors>
`;

    writeFile(behaviorPath, originalBehavior);
    writeFile(path.join(ws, 'codument', 'config', 'engineering.xml'), `<Engineering version="1" enabled="true">
  <Registry path="codument/engineering" />
  <MergePolicy>
    <Conflict type="same-field" resolve="human" />
    <Conflict type="delete-modify" resolve="human" />
    <Conflict type="add-add" resolve="human" />
  </MergePolicy>
</Engineering>
`);

    Bun.spawnSync(['git', 'init'], { cwd: ws });
    Bun.spawnSync(['git', 'add', 'codument/config/engineering.xml'], { cwd: ws });
    const commitProc = Bun.spawnSync([
      'git',
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '-m',
      'workspace before engineering registry',
    ], { cwd: ws });
    expect(commitProc.exitCode).toBe(0);
    const revProc = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: ws, stdout: 'pipe' });
    const baseCommit = new TextDecoder().decode(revProc.stdout).trim();

    fs.mkdirSync(engineeringPath, { recursive: true });
    writeTrackXml(trackDir, trackId, '2026-05-30T02:03:00+03:00');
    let trackXml = fs.readFileSync(path.join(trackDir, 'track.xml'), 'utf-8');
    trackXml = trackXml.replace('</Metadata>', `    <EngineeringBaseCommit>${baseCommit}</EngineeringBaseCommit>\n  </Metadata>`);
    fs.writeFileSync(path.join(trackDir, 'track.xml'), trackXml, 'utf-8');
    writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n\nCross-registry rollback behavior.\n');
    writeFile(path.join(trackDir, 'behavior_deltas', 'orders', 'delta.xml'), `<behavior-patch capability="orders" version="1">
  <upsert selector="behavior://orders/requirements/archive-safety">
    <requirement id="archive-safety">
      <statement>Archive rolls back every registry after a later write failure.</statement>
    </requirement>
  </upsert>
</behavior-patch>
`);
    writeFile(path.join(trackDir, 'engineering_deltas', 'global', 'howto', 'orders.xnl'), `<howto #global.howto.orders.add_endpoint kind="howto" [
  <when-to-use ?m>
  需要新增订单 endpoint 时使用。
  </?m>
  <steps ?m>
  1. 补 behavior case。
  </?m>
  <verification ?m>
  运行 route tests。
  </?m>
]>
`);

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'archive',
      trackId,
      '--yes',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    expect(exitCode).not.toBe(0);
    expect(fs.existsSync(trackDir)).toBe(true);
    expect(fs.existsSync(archiveDir)).toBe(false);
    expect(fs.readFileSync(behaviorPath, 'utf-8')).toBe(originalBehavior);
    expect(fs.statSync(engineeringPath).isDirectory()).toBe(true);
    expect(
      fs.readdirSync(path.join(ws, 'codument')).some((name) => name.startsWith('.archive-staging-')),
    ).toBe(false);
  });

  it('rolls back committed registries when moving the track fails', async () => {
    const originalCwd = process.cwd();
    const ws = makeTempDir('codument-archive-track-move-rollback-ws-');
    const trackId = 'rollback-after-track-move-failure';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);
    const behaviorPath = path.join(ws, 'codument', 'behaviors', 'orders.xml');
    const archiveDir = path.join(
      ws,
      'codument',
      'tracks',
      'archived',
      '2026-05',
      `2026-05-30-0203-${trackId}`,
    );
    const originalBehavior = `<behaviors capability="orders" version="1">
  <requirement id="archive-safety">
    <statement>Archive preserves registry consistency.</statement>
  </requirement>
</behaviors>
`;

    writeFile(behaviorPath, originalBehavior);
    writeTrackXml(trackDir, trackId, '2026-05-30T02:03:00+03:00');
    writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n\nTrack move rollback.\n');
    writeFile(path.join(trackDir, 'decisions.xnl'), `<decision #track.rollback_after_move.decision {
  status = "accepted"
  durable_candidate = true
}>
`);
    writeFile(path.join(trackDir, 'behavior_deltas', 'orders', 'delta.xml'), `<behavior-patch capability="orders" version="1">
  <upsert selector="behavior://orders/requirements/archive-safety">
    <requirement id="archive-safety">
      <statement>This update must roll back when the track move fails.</statement>
    </requirement>
  </upsert>
</behavior-patch>
`);

    setWorkspaceDir(ws);
    try {
      await expect(archiveCommand([trackId, '--yes'], {
        moveTrack(): never {
          throw new Error('injected track move failure');
        },
      })).rejects.toThrow('injected track move failure');
    } finally {
      setWorkspaceDir(originalCwd);
    }

    expect(fs.readFileSync(behaviorPath, 'utf-8')).toBe(originalBehavior);
    expect(fs.existsSync(path.join(ws, 'codument', 'decisions'))).toBe(false);
    expect(fs.existsSync(trackDir)).toBe(true);
    expect(fs.existsSync(archiveDir)).toBe(false);
    expect(
      fs.readdirSync(path.join(ws, 'codument')).some((name) => name.startsWith('.archive-staging-')),
    ).toBe(false);
  });

  it('rejects a schema-invalid staged modeling tree without writes or track movement', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-invalid-modeling-ws-');
    const trackId = 'reject-invalid-modeling-registry';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);
    const registryPath = path.join(
      ws,
      'codument',
      'modeling',
      'domain',
      'orders',
      'index.xnl',
    );
    const archiveDir = path.join(
      ws,
      'codument',
      'tracks',
      'archived',
      '2026-05',
      `2026-05-30-0203-${trackId}`,
    );
    const originalRegistry = `<object #orders.order { kind = "entity" fact_grade = "authoritative_fact" single_writer = "backend.order_store" } [
  <desc ?>订单结构。</?>
  <types ?t>interface Order { id: string; status: string }</?t>
]>
`;

    writeModelingConfig(ws);
    writeFile(registryPath, originalRegistry);
    Bun.spawnSync(['git', 'init'], { cwd: ws });
    Bun.spawnSync(['git', 'add', 'codument/config/modeling.xml', 'codument/modeling'], { cwd: ws });
    const commitProc = Bun.spawnSync([
      'git',
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '-m',
      'valid modeling registry',
    ], { cwd: ws });
    expect(commitProc.exitCode).toBe(0);
    const revProc = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: ws, stdout: 'pipe' });
    const baseCommit = new TextDecoder().decode(revProc.stdout).trim();

    writeTrackXml(trackDir, trackId, '2026-05-30T02:03:00+03:00');
    let trackXml = fs.readFileSync(path.join(trackDir, 'track.xml'), 'utf-8');
    trackXml = trackXml.replace('</Metadata>', `    <ModelingBaseCommit>${baseCommit}</ModelingBaseCommit>\n  </Metadata>`);
    fs.writeFileSync(path.join(trackDir, 'track.xml'), trackXml, 'utf-8');
    writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n\nInvalid modeling delta.\n');
    writeFile(path.join(trackDir, 'modeling_deltas', 'domain', 'orders.xnl'), `<object #orders.order { kind = "entity" fact_grade = "not-a-grade" single_writer = "backend.order_store" } [
  <desc ?>订单结构。</?>
  <types ?t>interface Order { id: string; status: string }</?t>
]>
`);

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'archive',
      trackId,
      '--yes',
      '--skip-specs',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('Modeling registry validation failed');
    expect(fs.readFileSync(registryPath, 'utf-8')).toBe(originalRegistry);
    expect(fs.existsSync(trackDir)).toBe(true);
    expect(fs.existsSync(archiveDir)).toBe(false);
    expect(
      fs.readdirSync(path.join(ws, 'codument')).some((name) => name.startsWith('.archive-staging-')),
    ).toBe(false);
  });

  it('applies engineering_deltas into codument/engineering when engineering is enabled', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-engineering-ws-');
    const trackId = 'add-engineering-howto';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);

    writeFile(path.join(ws, 'codument', 'config', 'engineering.xml'), `<Engineering version="1" enabled="true">
  <Registry path="codument/engineering" />
  <Lint maxLines="400" maxNodes="8" />
  <MergePolicy>
    <Conflict type="same-field" resolve="human" />
    <Conflict type="delete-modify" resolve="human" />
    <Conflict type="add-add" resolve="human" />
  </MergePolicy>
</Engineering>
`);
    writeFile(path.join(ws, 'codument', 'engineering', 'global', 'howto', 'orders.xnl'), `<howto #global.howto.orders.add_endpoint kind="howto" a="1" b="1" [
  <when-to-use ?m>
  需要新增订单 endpoint 时使用。
  </?m>
  <steps ?m>
  1. 补 behavior case。
  </?m>
  <verification ?m>
  运行 route tests。
  </?m>
]>
`);

    Bun.spawnSync(['git', 'init'], { cwd: ws });
    Bun.spawnSync(['git', 'add', 'codument/engineering'], { cwd: ws });
    const commitProc = Bun.spawnSync([
      'git',
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '-m',
      'base engineering registry',
    ], { cwd: ws });
    expect(commitProc.exitCode).toBe(0);
    const revProc = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: ws, stdout: 'pipe' });
    const baseCommit = new TextDecoder().decode(revProc.stdout).trim();

    writeFile(path.join(ws, 'codument', 'engineering', 'global', 'howto', 'orders.xnl'), `<howto #global.howto.orders.add_endpoint kind="howto" a="1" b="2" [
  <when-to-use ?m>
  需要新增订单 endpoint 或后台 handler 时使用。
  </?m>
  <steps ?m>
  1. 补 behavior case。
  </?m>
  <verification ?m>
  运行 route tests。
  </?m>
]>
`);

    writeTrackXml(trackDir, trackId, '2026-05-30T02:03:00Z');
    let trackXml = fs.readFileSync(path.join(trackDir, 'track.xml'), 'utf-8');
    trackXml = trackXml.replace('</Metadata>', `    <EngineeringBaseCommit>${baseCommit}</EngineeringBaseCommit>\n  </Metadata>`);
    fs.writeFileSync(path.join(trackDir, 'track.xml'), trackXml, 'utf-8');
    writeFile(path.join(trackDir, 'proposal.md'), '# Proposal\n\nEngineering delta archive behavior.\n');
    writeFile(path.join(trackDir, 'engineering_deltas', 'global', 'howto', 'orders.xnl'), `<howto #global.howto.orders.add_endpoint kind="howto" a="2" b="1" [
  <when-to-use ?m>
  需要新增订单 endpoint 时使用。
  </?m>
  <steps ?m>
  1. 补 behavior case。
  2. 实现 backend handler。
  </?m>
  <verification ?m>
  运行 route tests 和 codument validate。
  </?m>
]>

<howto #global.howto.orders.add_metrics kind="howto" [
  <when-to-use ?m>
  需要观测订单 endpoint 时使用。
  </?m>
  <steps ?m>
  1. 增加 counter。
  </?m>
  <verification ?m>
  检查 metrics endpoint。
  </?m>
]>
`);

    const proc = Bun.spawn([
      'bun',
      'run',
      cliEntry,
      '--workspace-dir',
      ws,
      'archive',
      trackId,
      '--yes',
      '--skip-specs',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const err = await new Response(proc.stderr).text();
    expect(err).toBe('');
    expect(exitCode).toBe(0);

    const updated = fs.readFileSync(path.join(ws, 'codument', 'engineering', 'global', 'howto', 'orders.xnl'), 'utf-8');
    expect(updated).toContain('a="2"');
    expect(updated).toContain('b="2"');
    expect(updated).toContain('实现 backend handler');
    expect(updated).toContain('global.howto.orders.add_metrics');
    expect(fs.existsSync(trackDir)).toBe(false);
  });
});
