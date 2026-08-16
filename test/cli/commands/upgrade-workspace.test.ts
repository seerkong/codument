import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const repoRoot = path.resolve(import.meta.dir, '../../..');
const cli = path.join(repoRoot, 'src/cli/index.ts');
const decisionMigrationReference = path.join(
  'codument-migrate',
  'references',
  'decision-migration.md',
);
const decisionMigrationTemplate = fs.readFileSync(
  path.join(repoRoot, 'src', 'templates', 'skills', decisionMigrationReference),
  'utf-8',
);

function tmpWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-upgrade-workspace-'));
}

function writeFile(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf-8');
}

describe('codument upgrade-workspace', () => {
  it('returns a structured JSON receipt for in-agent review orchestration', async () => {
    const ws = tmpWorkspace();
    const legacyDecision = path.join(
      ws,
      'codument',
      'tracks',
      'active',
      'legacy-decision',
      'decisions.md',
    );

    writeFile(path.join(ws, 'codument', 'std', 'AGENTS.md'), '# old std\n');
    writeFile(
      path.join(ws, 'codument', 'config', 'cli-tools.json'),
      JSON.stringify({ tools: ['codex'] }, null, 2),
    );
    writeFile(legacyDecision, '# Decision\n\nUse the current migration strategy.\n');

    const proc = Bun.spawn([
      'bun',
      'run',
      cli,
      '--workspace-dir',
      ws,
      'upgrade-workspace',
      '--json',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();
    const receipt = JSON.parse(out) as {
      status: string;
      backupRoot: string;
      managedFiles: { written: number; kept: number };
      skills: Array<{ agent: string; directory: string }>;
      resources: { upgraded: number; removed: number; unchanged: number };
      reviewRequired: Array<{ path: string; diagnostics: string[] }>;
      semanticReviewRecommended: unknown[];
      cleanup: { trackDirectoryConflicts: string[] };
      instructionFilesRefreshed: string[];
    };

    expect(err).toBe('');
    expect(code).toBe(2);
    expect(receipt.status).toBe('review-required');
    expect(receipt.backupRoot).toContain('.tmp/codument/upgrade-workspace-');
    expect(receipt.managedFiles.written).toBeGreaterThan(0);
    expect(receipt.skills).toEqual([
      expect.objectContaining({ agent: 'codex', directory: '.agents/skills' }),
    ]);
    expect(receipt.resources.unchanged).toBeGreaterThanOrEqual(0);
    expect(receipt.reviewRequired).toEqual([
      expect.objectContaining({
        path: expect.stringContaining('decisions.md'),
        diagnostics: expect.arrayContaining([
          expect.stringContaining('semantic AI review'),
        ]),
      }),
    ]);
    expect(receipt.semanticReviewRecommended).toBeArray();
    expect(receipt.cleanup.trackDirectoryConflicts).toEqual([]);
    expect(receipt.instructionFilesRefreshed).toEqual(['AGENTS.md']);
  });

  it('documents JSON output in side-effect-free help', async () => {
    const ws = tmpWorkspace();
    const proc = Bun.spawn([
      'bun',
      'run',
      cli,
      '--workspace-dir',
      ws,
      'upgrade-workspace',
      '--help',
    ], { cwd: repoRoot, stdout: 'pipe', stderr: 'pipe' });

    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();

    expect(code).toBe(0);
    expect(out).toContain('--json');
    expect(fs.existsSync(path.join(ws, 'codument'))).toBe(false);
  });

  it('removes obsolete built-in attractor hooks while preserving custom hooks', async () => {
    const ws = tmpWorkspace();
    const skillsDir = path.join(ws, '.skills');
    const legacyActionHooks = path.join(ws, 'codument', 'config', 'action-hooks.xml');
    const operationHooks = path.join(ws, 'codument', 'config', 'operation-hooks.xnl');

    writeFile(path.join(ws, 'codument', 'std', 'AGENTS.md'), '# old std\n');
    writeFile(legacyActionHooks, `<ActionHooks version="1" xmlns:cdt="urn:codument:v1">
  <Action name="discuss"><Hooks>
    <Hook on="discuss:before"><cdt:AttractorCheck use="coding"/></Hook>
    <Hook on="discuss:after"><cdt:HumanConfirm/></Hook>
  </Hooks></Action>
  <Action name="impl-quick"><Hooks>
    <Hook on="impl-quick:before"><cdt:AttractorCheck use="coding"/></Hook>
  </Hooks></Action>
  <Action name="revise-track"><Hooks>
    <Hook on="revise-track:before"><cdt:AttractorCheck use="coding"/></Hook>
    <Hook on="revise-track:before"><cdt:AttractorCheck use="docs"/></Hook>
  </Hooks></Action>
</ActionHooks>
`);

    const proc = Bun.spawn([
      'bun', 'run', cli, '--workspace-dir', ws, 'upgrade-workspace', '--skills-dir', skillsDir,
    ], { cwd: repoRoot, stdout: 'pipe', stderr: 'pipe' });
    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();

    expect(err).toBe('');
    expect(code).toBe(0);
    expect(out).toContain('3 obsolete default attractor hook(s) removed');

    const hooks = fs.readFileSync(operationHooks, 'utf-8');
    expect(fs.existsSync(legacyActionHooks)).toBe(false);
    expect(hooks).not.toContain('<Operation #impl-quick');
    expect(hooks).not.toContain('use = "coding"');
    expect(hooks).toContain('on = "discuss:after"');
    expect(hooks).toContain('<HumanConfirm>');
    expect(hooks).toContain('on = "revise-track:before"');
    expect(hooks).toContain('use = "docs"');
  });

  it('moves standard attractors under std/attractors and preserves project attractors', async () => {
    const ws = tmpWorkspace();
    const skillsDir = path.join(ws, '.skills');

    writeFile(path.join(ws, 'codument', 'std', 'AGENTS.md'), '# old std\n');
    writeFile(path.join(ws, 'codument', 'std', 'docs-modeling-fractal', 'index.md'), '# old modeling fractal\n');
    writeFile(path.join(ws, 'codument', 'std', 'docs-impl-fractal', 'index.md'), '# old impl fractal\n');
    writeFile(path.join(ws, 'codument', 'std', 'actions', 'init.md'), '# old init action\n');
    writeFile(path.join(ws, 'codument', 'std', 'actions', 'status.md'), '# old status action\n');
    writeFile(path.join(ws, 'codument', 'std', 'root-agents.md'), '# old root AGENTS template\n');
    writeFile(path.join(ws, 'codument', 'std', 'spec', 'track-xml-spec.md'), '# old Track XML spec\n');
    writeFile(path.join(ws, 'codument', 'std', 'spec', 'mission-xml-spec.md'), '# old Mission XML spec\n');
    writeFile(path.join(ws, 'codument', 'config', 'operation-hooks.xml'), `<OperationHooks version="1">
  <Operation name="plan-track"><Hooks/></Operation>
</OperationHooks>
`);
    writeFile(path.join(ws, 'codument', 'config', 'cli-tools.json'), JSON.stringify({ tools: ['claude'] }, null, 2));
    writeFile(path.join(ws, 'codument', 'manifest.xnl'), '<ResourcePackage #stale>\n');
    writeFile(path.join(ws, 'codument', 'config', 'attractor-profiles.xml'), `<AttractorProfiles version="1">
  <Profile name="docs" enabled="true">
    <Attractor ref="vfs://@/codument/std/docs-modeling-fractal/index.md"/>
    <Attractor ref="vfs://@/codument/std/docs-impl-fractal/index.md"/>
  </Profile>
</AttractorProfiles>
`);
    writeFile(path.join(ws, 'codument', 'attractors', 'project.md'), '# custom project\n');
    writeFile(path.join(ws, 'codument', 'attractors', 'product.md'), '# custom product\n');
    writeFile(path.join(ws, 'codument', 'attractors', 'knowledge-tiers.md'), '# old knowledge\n');
    writeFile(path.join(ws, 'codument', 'attractors', 'model-driven-docs.md'), '# old docs\n');
    writeFile(path.join(ws, 'codument', 'attractors', 'project-memory.md'), '# old memory\n');
    writeFile(path.join(skillsDir, 'codument-init', 'SKILL.md'), '# old init skill\n');
    writeFile(path.join(skillsDir, 'codument-status', 'SKILL.md'), '# old status skill\n');
    writeFile(path.join(skillsDir, 'codument-plan-schedule', 'SKILL.md'), '# old plan schedule skill\n');
    for (const deprecated of [
      'codument-archive',
      'codument-code-quality-score',
      'codument-decision-tree',
      'codument-discuss-phase',
      'codument-implement',
      'codument-modeling-engineering-e2e',
      'codument-plan-track-wave',
      'codument-revise-track',
      'codument-track',
    ]) {
      writeFile(path.join(skillsDir, deprecated, 'SKILL.md'), '# deprecated skill\n');
    }
    writeFile(path.join(skillsDir, 'codument-plan-track', 'shared', 'workflow-routing.md'), 'stale managed file\n');
    writeFile(path.join(skillsDir, decisionMigrationReference), '# stale decision migration reference\n');
    writeFile(path.join(ws, 'AGENTS.md'), '# Existing project notes\n');
    writeFile(path.join(ws, 'CLAUDE.md'), `# Existing Claude notes

<!-- codument:begin -->

# Old Codument pointer

<!-- codument:end -->
`);
    writeFile(path.join(ws, '.gitignore'), 'node_modules\ncodument/**/analysis\n');

    const proc = Bun.spawn([
      'bun',
      'run',
      cli,
      '--workspace-dir',
      ws,
      'upgrade-workspace',
      '--skills-dir',
      skillsDir,
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();
    expect(err).toBe('');
    expect(code).toBe(0);
    expect(out).toContain('Codument workspace upgraded.');

    expect(fs.readFileSync(path.join(ws, 'codument', 'attractors', 'project.md'), 'utf-8')).toBe('# custom project\n');
    expect(fs.readFileSync(path.join(ws, 'codument', 'attractors', 'product.md'), 'utf-8')).toBe('# custom product\n');
    expect(fs.existsSync(path.join(ws, 'codument', 'attractors', 'knowledge-tiers.md'))).toBe(false);
    expect(fs.existsSync(path.join(ws, 'codument', 'attractors', 'model-driven-docs.md'))).toBe(false);
    expect(fs.existsSync(path.join(ws, 'codument', 'attractors', 'project-memory.md'))).toBe(false);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'actions'))).toBe(false);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'root-agents.md'))).toBe(false);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'spec', 'track-xml-spec.md'))).toBe(false);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'spec', 'track-xnl-spec.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'spec', 'mission-xml-spec.md'))).toBe(false);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'spec', 'mission-xnl-spec.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'config', 'operation-hooks.xml'))).toBe(false);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'operations', 'plan-track.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'config', 'action-hooks.xml'))).toBe(false);
    expect(fs.readFileSync(path.join(ws, 'codument', 'config', 'operation-hooks.xnl'), 'utf-8')).toContain('<OperationHooks #codument.config.operation_hooks');
    expect(fs.readFileSync(path.join(ws, 'codument', 'config', 'operation-hooks.xnl'), 'utf-8')).toContain('<Operation #plan-track');
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'docs-modeling-fractal'))).toBe(false);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'docs-impl-fractal'))).toBe(false);

    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'attractors', 'knowledge-tiers.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'attractors', 'model-driven-docs.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'attractors', 'project-memory.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'attractors', 'depa-attractor.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'skill', 'docs-modeling-fractal', 'index.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'skill', 'docs-engineering-fractal', 'index.md'))).toBe(true);
    expect(fs.readFileSync(path.join(ws, 'codument', 'std', 'kinds', 'KindDefinitions', 'Track', 'manifest.xnl'), 'utf8'))
      .toContain('currentApiVersion = "codument.tech/v1alpha1"');
    const resourcePackage = fs.readFileSync(path.join(ws, 'codument', 'manifest.xnl'), 'utf8');
    expect(resourcePackage).toContain('<Catalog #active_tracks');
    expect(resourcePackage).toContain('<Catalog #active_missions');

    const profiles = fs.readFileSync(path.join(ws, 'codument', 'config', 'attractor-profiles.xnl'), 'utf-8');
    expect(profiles).toContain('vfs://@/codument/std/skill/docs-modeling-fractal/index.md');
    expect(profiles).toContain('vfs://@/codument/std/skill/docs-engineering-fractal/index.md');
    expect(profiles).not.toContain('vfs://@/codument/std/docs-modeling-fractal/index.md');
    expect(profiles).not.toContain('vfs://@/codument/std/docs-impl-fractal/index.md');

    const agents = fs.readFileSync(path.join(ws, 'AGENTS.md'), 'utf-8');
    expect(agents).toContain('在 Codument 工具内部上下文中，`@` 一般表示当前项目的项目级根目录');
    expect(agents).toContain('@/codument/std/AGENTS.md');
    expect(agents).toContain('唯一的 Codument 工作流与路由真源');
    expect(agents).toContain('产品方向吸引子：`@/codument/attractors/product.md`');
    expect(agents).toContain('项目实现吸引子：`@/codument/attractors/project.md`');
    expect(agents).not.toContain('快速路由：');
    expect(agents).toContain('# Existing project notes');
    const claude = fs.readFileSync(path.join(ws, 'CLAUDE.md'), 'utf-8');
    expect(claude).toContain('在 Codument 工具内部上下文中，`@` 一般表示当前项目的项目级根目录');
    expect(claude).toContain('产品方向吸引子：`@/codument/attractors/product.md`');
    expect(claude).toContain('# Existing Claude notes');
    expect(claude).not.toContain('# Old Codument pointer');
    expect(claude.match(/<!-- codument:begin -->/g)).toHaveLength(1);

    const gitignore = fs.readFileSync(path.join(ws, '.gitignore'), 'utf-8');
    expect(gitignore.match(/codument\/\*\*\/analysis/g)?.length).toBe(1);
    expect(gitignore.match(/codument\/\*\*\/reports/g)?.length).toBe(1);

    expect(fs.existsSync(path.join(skillsDir, 'codument-init', 'SKILL.md'))).toBe(false);
    expect(fs.existsSync(path.join(skillsDir, 'codument-status', 'SKILL.md'))).toBe(false);
    expect(fs.existsSync(path.join(skillsDir, 'codument-plan-schedule', 'SKILL.md'))).toBe(false);
    for (const deprecated of [
      'codument-archive',
      'codument-code-quality-score',
      'codument-decision-tree',
      'codument-discuss-phase',
      'codument-implement',
      'codument-modeling-engineering-e2e',
      'codument-plan-track-wave',
      'codument-revise-track',
      'codument-track',
    ]) {
      expect(fs.existsSync(path.join(skillsDir, deprecated))).toBe(false);
    }
    expect(fs.existsSync(path.join(skillsDir, 'codument-plan-track', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(skillsDir, 'codument-maintain-track', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(skillsDir, 'codument-plan-track', 'shared', 'workflow-routing.md'))).toBe(false);
    expect(fs.readFileSync(path.join(skillsDir, decisionMigrationReference), 'utf-8'))
      .toBe(decisionMigrationTemplate);
  });

  it('refreshes Codex skills under the workspace-local .agents directory by default', async () => {
    const ws = tmpWorkspace();
    const workspaceSkillsDir = path.join(ws, '.agents', 'skills');

    writeFile(path.join(ws, 'codument', 'std', 'AGENTS.md'), '# old std\n');
    writeFile(path.join(ws, 'codument', 'config', 'cli-tools.json'), JSON.stringify({ tools: ['codex'] }, null, 2));

    const proc = Bun.spawn([
      'bun',
      'run',
      cli,
      '--workspace-dir',
      ws,
      'upgrade-workspace',
    ], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();

    expect(err).toBe('');
    expect(code).toBe(0);
    expect(out).toContain('.agents/skills');
    expect(fs.existsSync(path.join(workspaceSkillsDir, 'codument-impl-quick', 'SKILL.md'))).toBe(true);
  });

  it('migrates legacy active and archived tracks into lifecycle directories after backup', async () => {
    const ws = tmpWorkspace();
    const skillsDir = path.join(ws, '.skills');
    const activeTrack = path.join(ws, 'codument', 'tracks', 'legacy-active');
    const archivedTrack = path.join(ws, 'codument', 'archive', '2026-05', '2026-05-30-1432-legacy-archived');

    writeFile(path.join(ws, 'codument', 'std', 'AGENTS.md'), '# old std\n');
    writeFile(path.join(activeTrack, 'track.xml'), '<Track id="legacy-active"/>\n');
    writeFile(path.join(archivedTrack, 'track.xml'), '<Track id="legacy-archived"/>\n');

    const proc = Bun.spawn([
      'bun', 'run', cli, '--workspace-dir', ws, 'upgrade-workspace', '--skills-dir', skillsDir,
    ], { cwd: repoRoot, stdout: 'pipe', stderr: 'pipe' });
    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();

    expect(err).toBe('');
    expect(code).toBe(0);
    expect(out).toContain('1 active and 1 archived path(s) migrated');
    expect(fs.existsSync(path.join(ws, 'codument', 'tracks', 'active', 'legacy-active', 'track.xnl'))).toBe(true);
    expect(fs.readFileSync(path.join(ws, 'codument', 'tracks', 'active', 'legacy-active', 'track.xnl'), 'utf8'))
      .toContain('apiVersion="codument.tech/v1alpha1"');
    expect(fs.existsSync(path.join(ws, 'codument', 'tracks', 'archived', '2026-05', '2026-05-30-1432-legacy-archived', 'track.xnl'))).toBe(true);
    expect(fs.existsSync(activeTrack)).toBe(false);
    expect(fs.existsSync(path.join(ws, 'codument', 'archive'))).toBe(false);

    const backups = fs.readdirSync(path.join(ws, '.tmp', 'codument'));
    const backup = path.join(ws, '.tmp', 'codument', backups[0], 'codument');
    expect(fs.existsSync(path.join(backup, 'tracks', 'legacy-active', 'track.xml'))).toBe(true);
    expect(fs.existsSync(path.join(backup, 'archive', '2026-05', '2026-05-30-1432-legacy-archived', 'track.xml'))).toBe(true);
  });

  it('preserves a legacy active track when its lifecycle destination already exists', async () => {
    const ws = tmpWorkspace();
    const skillsDir = path.join(ws, '.skills');
    const legacy = path.join(ws, 'codument', 'tracks', 'same-id', 'track.xml');
    const destination = path.join(ws, 'codument', 'tracks', 'active', 'same-id', 'track.xml');

    writeFile(path.join(ws, 'codument', 'std', 'AGENTS.md'), '# old std\n');
    writeFile(legacy, '<Track id="legacy"/>\n');
    writeFile(destination, '<Track id="new"/>\n');

    const proc = Bun.spawn([
      'bun', 'run', cli, '--workspace-dir', ws, 'upgrade-workspace', '--skills-dir', skillsDir,
    ], { cwd: repoRoot, stdout: 'pipe', stderr: 'pipe' });
    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();

    expect(code).toBe(0);
    expect(out).toContain('migration conflict left in place');
    expect(fs.existsSync(legacy)).toBe(false);
    expect(fs.readFileSync(path.join(path.dirname(legacy), 'track.xnl'), 'utf-8')).toContain('#legacy');
    expect(fs.existsSync(destination)).toBe(false);
    expect(fs.readFileSync(path.join(path.dirname(destination), 'track.xnl'), 'utf-8')).toContain('#new');
  });
});
