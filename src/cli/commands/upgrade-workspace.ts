import * as fs from 'fs';
import * as path from 'path';

import { parseOptions, codumentExists } from '../utils';
import {
  installSkillTemplates,
  installTemplates,
  injectAgentsBlock,
  parseAgents,
  readCliToolsConfig,
  resolveSkillsTargets,
  writeCliToolsConfig,
  type CLITool,
} from '../utils/install';

/**
 * `codument upgrade-workspace` — refresh the embedded templates in place.
 *
 * Pure text copy: overwrites the managed codument/std/** subtree and the agent
 * skill shells with the latest embedded templates; leaves user-owned files
 * (attractors content, config values, tracks, behaviors, backlog/memory) intact.
 * Creates a timestamped backup under .tmp/codument/ before touching workspace
 * files. No per-agent generators, no interactive prompts.
 *
 * Options: same --agent / --skills-dir as `init`.
 */
export async function upgradeWorkspaceCommand(args: string[]): Promise<void> {
  if (!codumentExists()) {
    console.error('Codument is not initialized. Run codument init first.');
    process.exit(1);
  }

  const { options } = parseOptions(args);
  const hasExplicitAgent = options['agent'] !== undefined;
  const hasExplicitSkillsDir = options['skills-dir'] !== undefined;
  const backupRoot = createWorkspaceBackup();
  const stateTools = readCliToolsConfig();
  const fallbackTools: CLITool[] = stateTools.length > 0 ? stateTools : ['claude'];
  const selectedTools = hasExplicitAgent
    ? parseAgents(typeof options['agent'] === 'string' ? String(options['agent']) : undefined, fallbackTools)
    : fallbackTools;
  const shouldWriteCliToolsConfig = stateTools.length > 0 || hasExplicitAgent;
  if (shouldWriteCliToolsConfig) {
    writeCliToolsConfig(selectedTools);
  }
  const removedLegacyPaths = removeLegacyWorkspacePaths(backupRoot);
  const targets = resolveSkillsTargets(options, selectedTools);
  const [firstTarget, ...additionalTargets] = targets;

  const result = installTemplates({ skillsDir: firstTarget.skillsDir, overwriteStd: true });
  const skillResults = [{ ...firstTarget, skillsWritten: result.skillsWritten, skillsRemoved: result.skillsRemoved }];
  for (const target of additionalTargets) {
    skillResults.push({ ...target, ...installSkillTemplates(target.skillsDir) });
  }
  injectAgentsBlock();

  console.log('Codument workspace upgraded.');
  console.log(`  backup    : ${backupRoot}`);
  console.log(`  codument/ : ${result.workspaceWritten} written (std refreshed), ${result.workspaceSkipped} kept`);
  for (const skillResult of skillResults) {
    const removed = skillResult.skillsRemoved ? `, ${skillResult.skillsRemoved} deprecated removed` : '';
    console.log(`  skills    : ${skillResult.skillsWritten} → ${skillResult.skillsDir} (agent: ${skillResult.agent}${removed})`);
  }
  if (shouldWriteCliToolsConfig) {
    console.log('  config/cli-tools.json: tools updated');
  }
  if (removedLegacyPaths > 0) {
    console.log(`  cleanup   : ${removedLegacyPaths} legacy path(s) removed`);
  }
  console.log('  AGENTS.md : managed block refreshed');
}

function safeTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function copyRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) {
    return;
  }
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      copyRecursive(path.join(src, entry.name), path.join(dest, entry.name));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function createWorkspaceBackup(): string {
  const backupRoot = path.join('.tmp', 'codument', `upgrade-workspace-${safeTimestamp()}`);
  const paths = ['codument', 'AGENTS.md'];
  for (const source of paths) {
    if (fs.existsSync(source)) {
      copyRecursive(source, path.join(backupRoot, source));
    }
  }
  return backupRoot;
}

function removeLegacyWorkspacePaths(backupRoot: string): number {
  const legacyPaths = [
    'codument/state.json',
    'codument/config/feature.json',
    'codument/workflows/workflow.md',
    'codument/workflows/bun-dev-cmds.md',
    'codument/legacy',
    'codument/specs',
    'codument/std/workflow.md',
    'codument/std/protocols.md',
    'codument/std/operations/init.md',
    'codument/std/operations/status.md',
    'codument/std/plan-xml-spec.md',
    'codument/std/track-impl-gap-report-1.md',
    'codument/attractors/knowledge-tiers.md',
    'codument/attractors/model-driven-docs.md',
    'codument/attractors/project-memory.md',
  ];

  let removed = 0;
  for (const legacyPath of legacyPaths) {
    if (!fs.existsSync(legacyPath)) {
      continue;
    }
    copyRecursive(legacyPath, path.join(backupRoot, legacyPath));
    fs.rmSync(legacyPath, { recursive: true, force: true });
    removed++;
  }
  return removed;
}
