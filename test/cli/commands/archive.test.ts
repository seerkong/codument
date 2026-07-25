import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { archiveCommand } from '../../../src/cli/commands/archive';
import { setWorkspaceDir } from '../../../src/cli/utils';

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
  it('uses track UpdatedAt minute prefix and promotes explicit durable decisions and memory when profile enabled', async () => {
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

  it('promotes durable root decisions.xnl records', async () => {
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

    const decisionRoot = path.join(ws, 'codument', 'decisions', '2026-05');
    const decisionDir = fs.readdirSync(decisionRoot)[0];
    const promoted = fs.readFileSync(path.join(decisionRoot, decisionDir, 'decision.md'), 'utf-8');
    expect(promoted).toContain('Decision URI: decision://track.archive_xnl_decision.promote_durable');
    expect(promoted).toContain('Evidence: The user approved decisions.xnl as the canonical carrier.');
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

  it('promotes decision directory entries with stable decision.md files and unique decision URIs', async () => {
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

  it('ignores legacy knowledge sync config and does not copy durable decisions into docs targets', async () => {
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

  it('commits behavior, modeling, and engineering registries before moving the track', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-all-registries-ws-');
    const trackId = 'archive-all-registries';
    const trackDir = path.join(ws, 'codument', 'tracks', 'active', trackId);
    const archiveDir = path.join(
      ws,
      'codument',
      'tracks',
      'archived',
      '2026-05',
      `2026-05-30-0203-${trackId}`,
    );

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
    expect(behavior).toContain('Archive commits every applicable registry together.');
    expect(modeling).toContain('#orders.order');
    expect(engineering).toContain('#global.howto.orders.add_endpoint');
    expect(fs.existsSync(trackDir)).toBe(false);
    expect(fs.existsSync(archiveDir)).toBe(true);
    expect(stdout).toContain('✓ Updated behavior/spec registry: orders');
    expect(stdout).toContain('✓ Updated modeling registry: domain/orders/index.xnl');
    expect(stdout).toContain('✓ Updated engineering registry: global/howto/orders.xnl');
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
