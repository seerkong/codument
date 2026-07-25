import * as fs from 'fs';
import * as path from 'path';

import { parseOptions, codumentExists } from '../utils';
import {
  installSkillTemplates,
  installTemplates,
  ensureCodumentGitignoreRules,
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
  const lifecycleMigration = migrateTrackLifecycleDirectories();
  const stateTools = readCliToolsConfig();
  const fallbackTools: CLITool[] = stateTools.length > 0 ? stateTools : ['claude'];
  const selectedTools = hasExplicitAgent
    ? parseAgents(typeof options['agent'] === 'string' ? String(options['agent']) : undefined, fallbackTools)
    : fallbackTools;
  const shouldWriteCliToolsConfig = stateTools.length > 0 || hasExplicitAgent;
  if (shouldWriteCliToolsConfig) {
    writeCliToolsConfig(selectedTools);
  }
  const migratedLegacyActionHooks = migrateLegacyActionHooks(backupRoot);
  const removedLegacyPaths = removeLegacyWorkspacePaths(backupRoot);
  const migratedConfigRefs = migrateWorkspaceConfigRefs(backupRoot);
  const targets = resolveSkillsTargets(options, selectedTools);
  const [firstTarget, ...additionalTargets] = targets;

  const result = installTemplates({ skillsDir: firstTarget.skillsDir, overwriteStd: true });
  const skillResults = [{ ...firstTarget, skillsWritten: result.skillsWritten, skillsRemoved: result.skillsRemoved }];
  for (const target of additionalTargets) {
    skillResults.push({ ...target, ...installSkillTemplates(target.skillsDir) });
  }
  injectAgentsBlock();
  const gitignoreRulesAdded = ensureCodumentGitignoreRules();

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
  if (migratedLegacyActionHooks > 0) {
    console.log(`  hooks     : ${migratedLegacyActionHooks} legacy hook file(s) migrated`);
  }
  if (migratedConfigRefs > 0) {
    console.log(`  config    : ${migratedConfigRefs} legacy reference(s) updated`);
  }
  if (lifecycleMigration.active > 0 || lifecycleMigration.archived > 0) {
    console.log(`  tracks    : ${lifecycleMigration.active} active and ${lifecycleMigration.archived} archived path(s) migrated`);
  }
  for (const conflict of lifecycleMigration.conflicts) {
    console.log(`  tracks    : migration conflict left in place: ${conflict}`);
  }
  if (gitignoreRulesAdded > 0) {
    console.log(`  .gitignore: ${gitignoreRulesAdded} codument rule(s) added`);
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

interface TrackLifecycleMigration {
  active: number;
  archived: number;
  conflicts: string[];
}

/**
 * Move the pre-lifecycle-layout track directories only after createWorkspaceBackup
 * has captured the whole codument tree. Existing new-layout destinations are never
 * overwritten; the legacy source remains available for an explicit resolution.
 */
function migrateTrackLifecycleDirectories(): TrackLifecycleMigration {
  const result: TrackLifecycleMigration = { active: 0, archived: 0, conflicts: [] };
  const tracksRoot = path.join('codument', 'tracks');
  const pendingRoot = path.join(tracksRoot, 'pending');
  const activeRoot = path.join(tracksRoot, 'active');
  const archivedRoot = path.join(tracksRoot, 'archived');
  const legacyArchiveRoot = path.join('codument', 'archive');
  fs.mkdirSync(pendingRoot, { recursive: true });
  fs.mkdirSync(activeRoot, { recursive: true });
  fs.mkdirSync(archivedRoot, { recursive: true });

  if (fs.existsSync(tracksRoot)) {
    const reserved = new Set(['pending', 'active', 'archived']);
    for (const entry of fs.readdirSync(tracksRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || reserved.has(entry.name)) {
        continue;
      }
      const source = path.join(tracksRoot, entry.name);
      if (!fs.existsSync(path.join(source, 'track.xml')) && !fs.existsSync(path.join(source, 'plan.xml'))) {
        continue;
      }
      const destination = path.join(activeRoot, entry.name);
      if (fs.existsSync(destination)) {
        result.conflicts.push(source);
        continue;
      }
      fs.renameSync(source, destination);
      result.active++;
    }
  }

  if (fs.existsSync(legacyArchiveRoot)) {
    result.archived += moveLegacyArchiveEntries(legacyArchiveRoot, archivedRoot, result.conflicts);
    removeEmptyDirectory(legacyArchiveRoot);
  }
  return result;
}

function moveLegacyArchiveEntries(sourceRoot: string, destinationRoot: string, conflicts: string[]): number {
  let moved = 0;
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    const source = path.join(sourceRoot, entry.name);
    const destination = path.join(destinationRoot, entry.name);
    if (!fs.existsSync(destination)) {
      fs.renameSync(source, destination);
      moved++;
      continue;
    }
    if (entry.isDirectory() && fs.statSync(destination).isDirectory()) {
      moved += moveLegacyArchiveEntries(source, destination, conflicts);
      removeEmptyDirectory(source);
      continue;
    }
    conflicts.push(source);
  }
  return moved;
}

function removeEmptyDirectory(dir: string): void {
  if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
  }
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
    'codument/std/operations',
    'codument/std/sop',
    'codument/std/actions/init.md',
    'codument/std/actions/status.md',
    'codument/std/plan-xml-spec.md',
    'codument/std/track-impl-gap-report-1.md',
    'codument/std/docs-modeling-fractal',
    'codument/std/docs-impl-fractal',
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

function migrateLegacyActionHooks(backupRoot: string): number {
  const legacyPath = path.join('codument', 'config', 'operation-hooks.xml');
  const actionPath = path.join('codument', 'config', 'action-hooks.xml');
  if (!fs.existsSync(legacyPath) || fs.existsSync(actionPath)) {
    return 0;
  }

  const original = fs.readFileSync(legacyPath, 'utf-8');
  const migrated = original
    .replace(/OperationHooks/g, 'ActionHooks')
    .replace(/\bOperation\b/g, 'Action')
    .replace(/\boperation hooks\b/gi, 'action hooks');
  copyRecursive(legacyPath, path.join(backupRoot, legacyPath));
  fs.mkdirSync(path.dirname(actionPath), { recursive: true });
  fs.writeFileSync(actionPath, migrated, 'utf-8');
  fs.rmSync(legacyPath, { force: true });
  return 1;
}

function migrateWorkspaceConfigRefs(backupRoot: string): number {
  const replacements: Array<[string, string]> = [
    [
      'vfs://@/codument/std/docs-modeling-fractal/index.md',
      'vfs://@/codument/std/skill/docs-modeling-fractal/index.md',
    ],
    [
      'vfs://@/codument/std/docs-impl-fractal/index.md',
      'vfs://@/codument/std/skill/docs-engineering-fractal/index.md',
    ],
    [
      '@codument/std/docs-modeling-fractal/index.md',
      '@codument/std/skill/docs-modeling-fractal/index.md',
    ],
    [
      '@codument/std/docs-impl-fractal/index.md',
      '@codument/std/skill/docs-engineering-fractal/index.md',
    ],
    [
      'codument/std/docs-modeling-fractal/index.md',
      'codument/std/skill/docs-modeling-fractal/index.md',
    ],
    [
      'codument/std/docs-impl-fractal/index.md',
      'codument/std/skill/docs-engineering-fractal/index.md',
    ],
    [
      'docs-impl-fractal',
      'docs-engineering-fractal',
    ],
  ];
  const candidateFiles = [
    'codument/config/attractor-profiles.xml',
    'codument/config/action-hooks.xml',
  ];

  let updatedRefs = 0;
  for (const file of candidateFiles) {
    if (!fs.existsSync(file)) {
      continue;
    }
    const original = fs.readFileSync(file, 'utf-8');
    let updated = original;
    for (const [from, to] of replacements) {
      const count = updated.split(from).length - 1;
      if (count > 0) {
        updatedRefs += count;
        updated = updated.split(from).join(to);
      }
    }
    if (updated !== original) {
      copyRecursive(file, path.join(backupRoot, file));
      fs.writeFileSync(file, updated, 'utf-8');
    }
  }

  return updatedRefs;
}
