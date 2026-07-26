import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const repoRoot = path.resolve(import.meta.dir, '../../..');
const cli = path.join(repoRoot, 'src/cli/index.ts');

function tmpWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-upgrade-workspace-'));
}

function writeFile(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf-8');
}

describe('codument upgrade-workspace', () => {
  it('moves standard attractors under std/attractors and preserves project attractors', async () => {
    const ws = tmpWorkspace();
    const skillsDir = path.join(ws, '.skills');

    writeFile(path.join(ws, 'codument', 'std', 'AGENTS.md'), '# old std\n');
    writeFile(path.join(ws, 'codument', 'std', 'docs-modeling-fractal', 'index.md'), '# old modeling fractal\n');
    writeFile(path.join(ws, 'codument', 'std', 'docs-impl-fractal', 'index.md'), '# old impl fractal\n');
    writeFile(path.join(ws, 'codument', 'std', 'operations', 'init.md'), '# old init operation\n');
    writeFile(path.join(ws, 'codument', 'std', 'operations', 'status.md'), '# old status operation\n');
    writeFile(path.join(ws, 'codument', 'std', 'root-agents.md'), '# old root AGENTS template\n');
    writeFile(path.join(ws, 'codument', 'config', 'operation-hooks.xml'), `<OperationHooks version="1">
  <Operation name="plan-track"><Hooks/></Operation>
</OperationHooks>
`);
    writeFile(path.join(ws, 'codument', 'config', 'cli-tools.json'), JSON.stringify({ tools: ['claude'] }, null, 2));
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
    writeFile(path.join(ws, 'AGENTS.md'), '# Existing project notes\n');
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
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'operations'))).toBe(false);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'root-agents.md'))).toBe(false);
    expect(fs.existsSync(path.join(ws, 'codument', 'config', 'operation-hooks.xml'))).toBe(false);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'actions', 'plan-track.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'config', 'action-hooks.xml'))).toBe(true);
    expect(fs.readFileSync(path.join(ws, 'codument', 'config', 'action-hooks.xml'), 'utf-8')).toContain('<ActionHooks version="1">');
    expect(fs.readFileSync(path.join(ws, 'codument', 'config', 'action-hooks.xml'), 'utf-8')).toContain('<Action name="plan-track">');
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'docs-modeling-fractal'))).toBe(false);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'docs-impl-fractal'))).toBe(false);

    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'attractors', 'knowledge-tiers.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'attractors', 'model-driven-docs.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'attractors', 'project-memory.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'attractors', 'depa-attractor.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'skill', 'docs-modeling-fractal', 'index.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'skill', 'docs-engineering-fractal', 'index.md'))).toBe(true);

    const profiles = fs.readFileSync(path.join(ws, 'codument', 'config', 'attractor-profiles.xml'), 'utf-8');
    expect(profiles).toContain('vfs://@/codument/std/skill/docs-modeling-fractal/index.md');
    expect(profiles).toContain('vfs://@/codument/std/skill/docs-engineering-fractal/index.md');
    expect(profiles).not.toContain('vfs://@/codument/std/docs-modeling-fractal/index.md');
    expect(profiles).not.toContain('vfs://@/codument/std/docs-impl-fractal/index.md');

    const agents = fs.readFileSync(path.join(ws, 'AGENTS.md'), 'utf-8');
    expect(agents).toContain('@/codument/std/AGENTS.md');
    expect(agents).toContain('唯一的 Codument 工作流与路由真源');
    expect(agents).not.toContain('快速路由：');
    expect(agents).toContain('# Existing project notes');

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
    expect(fs.existsSync(path.join(ws, 'codument', 'tracks', 'active', 'legacy-active', 'track.xml'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'tracks', 'archived', '2026-05', '2026-05-30-1432-legacy-archived', 'track.xml'))).toBe(true);
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
    expect(fs.readFileSync(legacy, 'utf-8')).toContain('legacy');
    expect(fs.readFileSync(destination, 'utf-8')).toContain('new');
  });
});
