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

describe('codument archive', () => {
  it('uses track UpdatedAt minute prefix and promotes explicit durable decisions and memory when profile enabled', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-ws-');
    const trackId = 'archive-minute-prefix';
    const trackDir = path.join(ws, 'codument', 'tracks', trackId);

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

    const archiveRoot = path.join(ws, 'codument', 'archive', '2026-05');
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
    const trackDir = path.join(ws, 'codument', 'tracks', trackId);

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

  it('promotes decision directory entries with stable decision.md files and unique decision URIs', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-decision-dir-ws-');
    const trackId = 'archive-decision-dir';
    const trackDir = path.join(ws, 'codument', 'tracks', trackId);

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
    const trackDir = path.join(ws, 'codument', 'tracks', trackId);

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
    const trackDir = path.join(ws, 'codument', 'tracks', trackId);

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
    const trackDir = path.join(ws, 'codument', 'tracks', trackId);

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
    const trackDir = path.join(ws, 'codument', 'tracks', trackId);

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

  it('applies engineering_deltas into codument/engineering when engineering is enabled', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const cliEntry = path.join(repoRoot, 'src/cli/index.ts');
    const ws = makeTempDir('codument-archive-engineering-ws-');
    const trackId = 'add-engineering-howto';
    const trackDir = path.join(ws, 'codument', 'tracks', trackId);

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
