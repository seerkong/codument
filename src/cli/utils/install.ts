import * as fs from 'fs';
import * as path from 'path';
import { TEMPLATE_FILES } from '../../templates/manifest';

/**
 * Pure text-copy install of the embedded templates (src/templates/) into a
 * project. No template rendering, no per-agent prompt variants, no interactive
 * prompts — init / upgrade-workspace are just file copies.
 *
 * Template layout (paths are relative to src/templates/):
 *   codument/**            → <workspace>/codument/**           (workspace files)
 *   skills/<name>/SKILL.md → <agent skills dir>/<name>/SKILL.md (agent skill shells)
 */

/** Where each coding agent looks for installable skills. Destination only — the skill content is identical for every agent. */
const SUPPORTED_AGENTS = ['claude', 'codeflicker', 'eidolon', 'opencode', 'sparrow', 'codex'] as const;
export type CLITool = typeof SUPPORTED_AGENTS[number];

export const SKILLS_DIR_BY_AGENT: Record<CLITool, string> = {
  claude: path.join('.claude', 'skills'),
  codeflicker: path.join('.codeflicker', 'skills'),
  eidolon: path.join('.eidolon', 'skills'),
  opencode: path.join('.opencode', 'skills'),
  sparrow: path.join('.sparrow', 'skills'),
  codex: path.join('.agents', 'skills'),
};

const AGENTS_BEGIN = '<!-- codument:begin -->';
const AGENTS_END = '<!-- codument:end -->';
const CODUMENT_GITIGNORE_RULES = [
  'codument/**/analysis',
  'codument/**/reports',
];
const DEPRECATED_SKILLS = [
  'codument-execute-wave',
  'codument-init',
  'codument-plan-schedule',
  'codument-plan-wave',
  'codument-status',
  'codument-archive',
  'codument-code-quality-score',
  'codument-decision-tree',
  'codument-discuss-phase',
  'codument-implement',
  'codument-modeling-engineering-e2e',
  'codument-plan-track-wave',
  'codument-revise-track',
  'codument-track',
];

const AGENTS_MANAGED_BODY = `# Codument Instructions

涉及 Codument 工作（包括 planning、track、mission、行为或架构变更，以及范围不明确的请求）前，打开并遵循 \`@/codument/std/AGENTS.md\`。它是唯一的 Codument 工作流与路由真源。

保留本受管块，'codument upgrade-workspace' 会刷新它。`;

export interface ResolvedSkillsTarget {
  agent: CLITool | string;
  skillsDir: string;
}

export function toPortablePath(value: string): string {
  return value.split(path.sep).join('/');
}

export const CLI_TOOLS_CONFIG_FILE = path.join('codument', 'config', 'cli-tools.json');
const LEGACY_STATE_FILE = path.join('codument', 'state.json');

function isCliTool(value: string): value is CLITool {
  return (SUPPORTED_AGENTS as readonly string[]).includes(value);
}

function uniqueAgents(values: string[]): CLITool[] {
  const seen = new Set<CLITool>();
  const agents: CLITool[] = [];
  for (const value of values) {
    const agent = value.trim().toLowerCase();
    if (!isCliTool(agent) || seen.has(agent)) {
      continue;
    }
    seen.add(agent);
    agents.push(agent);
  }
  return agents;
}

export function parseAgents(value: string | undefined, fallback: CLITool[] = ['claude']): CLITool[] {
  const rawAgents = value
    ? value.split(',').map((agent) => agent.trim().toLowerCase()).filter(Boolean)
    : fallback;
  const agents = uniqueAgents(rawAgents);
  return agents.length > 0 ? agents : fallback;
}

/** Resolve agent skill destinations from `--agent <name[,name]>` (default: claude). */
export function resolveSkillsTargets(
  options: Record<string, string | boolean>,
  fallbackAgents: CLITool[] = ['claude'],
): ResolvedSkillsTarget[] {
  const explicit = typeof options['skills-dir'] === 'string' ? String(options['skills-dir']) : undefined;
  const agents = parseAgents(typeof options['agent'] === 'string' ? String(options['agent']) : undefined, fallbackAgents);
  if (explicit) {
    return [{ agent: agents.join(','), skillsDir: explicit }];
  }
  return agents.map((agent) => ({ agent, skillsDir: SKILLS_DIR_BY_AGENT[agent] }));
}

/** Resolve the first agent skills destination. Kept for single-target callers. */
export function resolveSkillsTarget(options: Record<string, string | boolean>): ResolvedSkillsTarget {
  return resolveSkillsTargets(options)[0];
}

function readCliToolsFile(file: string, key: 'tools' | 'cli_tools'): CLITool[] {
  try {
    const state = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;
    const raw = state[key];
    return Array.isArray(raw)
      ? uniqueAgents(raw.map((tool) => String(tool)))
      : [];
  } catch {
    return [];
  }
}

export function readCliToolsConfig(): CLITool[] {
  if (fs.existsSync(CLI_TOOLS_CONFIG_FILE)) {
    return readCliToolsFile(CLI_TOOLS_CONFIG_FILE, 'tools');
  }
  if (fs.existsSync(LEGACY_STATE_FILE)) {
    return readCliToolsFile(LEGACY_STATE_FILE, 'cli_tools');
  }
  return [];
}

export function writeCliToolsConfig(tools: CLITool[]): void {
  fs.mkdirSync(path.dirname(CLI_TOOLS_CONFIG_FILE), { recursive: true });
  const config = {
    tools: [...tools],
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(CLI_TOOLS_CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
}

export function ensureCodumentGitignoreRules(file = '.gitignore'): number {
  if (!fs.existsSync(file)) {
    return 0;
  }

  const existing = fs.readFileSync(file, 'utf-8');
  const lines = new Set(existing.split(/\r?\n/).map((line) => line.trim()));
  const missing = CODUMENT_GITIGNORE_RULES.filter((rule) => !lines.has(rule));
  if (missing.length === 0) {
    return 0;
  }

  const prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(file, `${existing}${prefix}${missing.join('\n')}\n`, 'utf-8');
  return missing.length;
}

function writeFile(dest: string, content: string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content.endsWith('\n') ? content : `${content}\n`, 'utf-8');
}

function resetManagedSkillDirs(skillsDir: string): void {
  const names = new Set<string>();
  for (const file of TEMPLATE_FILES) {
    const match = /^skills\/([^/]+)\//.exec(file.path);
    if (match) names.add(match[1]);
  }
  for (const name of names) {
    fs.rmSync(path.join(skillsDir, name), { recursive: true, force: true });
  }
}

export interface InstallResult {
  workspaceWritten: number;
  workspaceSkipped: number;
  skillsWritten: number;
  skillsRemoved: number;
}

export interface SkillInstallResult {
  skillsWritten: number;
  skillsRemoved: number;
}

export interface InstallOptions {
  skillsDir: string;
  /** Overwrite the codument/std/** subtree (true for upgrade-workspace; false for init which preserves existing files). */
  overwriteStd: boolean;
  /** Overwrite every codument/** file regardless (init --force). */
  force?: boolean;
}

/**
 * Copy embedded templates into the project.
 * - skills/**           → always overwritten (generated shells).
 * - codument/std/**     → overwritten when overwriteStd|force, else written only if missing.
 * - other codument/**   → written only if missing (preserves user content), unless force.
 */
export function installTemplates(opts: InstallOptions): InstallResult {
  const result: InstallResult = {
    workspaceWritten: 0,
    workspaceSkipped: 0,
    skillsWritten: 0,
    skillsRemoved: cleanupDeprecatedSkills(opts.skillsDir),
  };
  resetManagedSkillDirs(opts.skillsDir);

  for (const file of TEMPLATE_FILES) {
    if (file.path.startsWith('skills/')) {
      const dest = path.join(opts.skillsDir, file.path.slice('skills/'.length));
      writeFile(dest, file.content);
      result.skillsWritten++;
      continue;
    }

    if (!file.path.startsWith('codument/')) {
      continue;
    }

    const dest = file.path; // relative to cwd (= workspace)
    const isStd = file.path.startsWith('codument/std/');
    const overwrite = opts.force || (isStd && opts.overwriteStd);

    if (!overwrite && fs.existsSync(dest)) {
      result.workspaceSkipped++;
      continue;
    }
    writeFile(dest, file.content);
    result.workspaceWritten++;
  }

  return result;
}

export function installSkillTemplates(skillsDir: string): SkillInstallResult {
  const result: SkillInstallResult = { skillsWritten: 0, skillsRemoved: cleanupDeprecatedSkills(skillsDir) };
  resetManagedSkillDirs(skillsDir);
  for (const file of TEMPLATE_FILES) {
    if (!file.path.startsWith('skills/')) {
      continue;
    }
    const dest = path.join(skillsDir, file.path.slice('skills/'.length));
    writeFile(dest, file.content);
    result.skillsWritten++;
  }
  return result;
}

export function cleanupDeprecatedSkills(skillsDir: string): number {
  let removed = 0;
  for (const skill of DEPRECATED_SKILLS) {
    const dir = path.join(skillsDir, skill);
    if (!fs.existsSync(dir)) {
      continue;
    }
    fs.rmSync(dir, { recursive: true, force: true });
    removed++;
  }
  return removed;
}

/**
 * Inject / refresh the codument managed pointer block in the project-root AGENTS.md.
 * Matches the managed block case-insensitively and across legacy marker words
 * (codument:begin/end and CODUMENT:START/END), replacing the first occurrence and
 * removing any duplicates so re-running never stacks blocks.
 */
const MANAGED_BLOCK_RE = /<!--\s*codument:(?:begin|start)\s*-->[\s\S]*?<!--\s*codument:end\s*-->/gi;

export function injectAgentsBlock(): void {
  const block = `${AGENTS_BEGIN}\n\n${AGENTS_MANAGED_BODY}\n\n${AGENTS_END}`;
  const file = 'AGENTS.md';

  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, `${block}\n`, 'utf-8');
    return;
  }

  const existing = fs.readFileSync(file, 'utf-8');

  if (MANAGED_BLOCK_RE.test(existing)) {
    MANAGED_BLOCK_RE.lastIndex = 0;
    let replaced = false;
    const updated = existing
      .replace(MANAGED_BLOCK_RE, () => {
        if (replaced) return ''; // drop duplicate managed blocks
        replaced = true;
        return block;
      })
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\n+/, '');
    fs.writeFileSync(file, updated, 'utf-8');
    return;
  }

  // No (recognizable) existing block — prepend.
  const updated = existing.trim().length > 0 ? `${block}\n\n${existing}` : `${block}\n`;
  fs.writeFileSync(file, updated, 'utf-8');
}
