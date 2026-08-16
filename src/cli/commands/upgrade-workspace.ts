import * as fs from 'fs';
import * as path from 'path';

import { parseOptions, codumentExists } from '../utils';
import { migrateWorkspaceResources, type ResourceMigrationResult } from '../migrations';
import {
  installSkillTemplates,
  installTemplates,
  ensureCodumentGitignoreRules,
  injectAgentsBlock,
  parseAgents,
  readCliToolsConfig,
  resolveSkillsTargets,
  toPortablePath,
  writeCliToolsConfig,
  type CLITool,
} from '../utils/install';
import type { CommandRuntime } from '../contracts/command';
import { createCommandRuntime } from '../runtime';

interface WorkspaceSkillReceipt {
  agent: string;
  directory: string;
  written: number;
  removed: number;
}

export interface WorkspaceUpgradeReceipt {
  status: 'upgraded' | 'review-required';
  backupRoot: string;
  managedFiles: { written: number; kept: number };
  skills: WorkspaceSkillReceipt[];
  cliToolsUpdated: boolean;
  cleanup: {
    legacyPathsRemoved: number;
    legacyOperationHooksMigrated: number;
    obsoleteDefaultHooksRemoved: number;
    configReferencesUpdated: number;
    trackDirectoriesMigrated: { active: number; archived: number };
    trackDirectoryConflicts: string[];
    gitignoreRulesAdded: number;
  };
  resources: { upgraded: number; removed: number; unchanged: number };
  reviewRequired: ResourceMigrationResult[];
  semanticReviewRecommended: ResourceMigrationResult[];
  agentsBlockRefreshed: true;
  instructionFilesRefreshed: string[];
}

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
export async function upgradeWorkspaceCommand(
  args: string[],
  runtime: CommandRuntime = createCommandRuntime(),
): Promise<void> {
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
  const migratedLegacyOperationHooks = migrateLegacyOperationHooks(backupRoot);
  const removedObsoleteDefaultHooks = removeObsoleteDefaultAttractorHooks();
  const removedLegacyPaths = removeLegacyWorkspacePaths(backupRoot);
  const migratedConfigRefs = migrateWorkspaceConfigRefs(backupRoot);
  const targets = resolveSkillsTargets(options, selectedTools);
  const [firstTarget, ...additionalTargets] = targets;

  const result = await installTemplates({
    skillsDir: firstTarget.skillsDir,
    overwriteStd: true,
    resources: runtime.resources,
    workspace: runtime.workspace(),
    skills: runtime.workspace(firstTarget.skillsDir),
  });
  const skillResults = [{ ...firstTarget, skillsWritten: result.skillsWritten, skillsRemoved: result.skillsRemoved }];
  for (const target of additionalTargets) {
    skillResults.push({ ...target, ...await installSkillTemplates(
      target.skillsDir,
      runtime.resources,
      runtime.workspace(target.skillsDir),
    ) });
  }
  const instructionFiles = injectAgentsBlock(selectedTools);
  const gitignoreRulesAdded = ensureCodumentGitignoreRules();
  const resourceMigration = migrateWorkspaceResources('codument', { backupRoot });

  const receipt: WorkspaceUpgradeReceipt = {
    status: resourceMigration.reviewRequired.length > 0 || lifecycleMigration.conflicts.length > 0
      ? 'review-required'
      : 'upgraded',
    backupRoot,
    managedFiles: { written: result.workspaceWritten, kept: result.workspaceSkipped },
    skills: skillResults.map((skillResult) => ({
      agent: skillResult.agent,
      directory: toPortablePath(skillResult.skillsDir),
      written: skillResult.skillsWritten,
      removed: skillResult.skillsRemoved,
    })),
    cliToolsUpdated: shouldWriteCliToolsConfig,
    cleanup: {
      legacyPathsRemoved: removedLegacyPaths,
      legacyOperationHooksMigrated: migratedLegacyOperationHooks,
      obsoleteDefaultHooksRemoved: removedObsoleteDefaultHooks,
      configReferencesUpdated: migratedConfigRefs,
      trackDirectoriesMigrated: {
        active: lifecycleMigration.active,
        archived: lifecycleMigration.archived,
      },
      trackDirectoryConflicts: lifecycleMigration.conflicts,
      gitignoreRulesAdded,
    },
    resources: {
      upgraded: resourceMigration.applied,
      removed: resourceMigration.removed,
      unchanged: resourceMigration.noop,
    },
    reviewRequired: resourceMigration.reviewRequired,
    semanticReviewRecommended: resourceMigration.semanticReviewRecommended,
    agentsBlockRefreshed: true,
    instructionFilesRefreshed: instructionFiles,
  };

  if (options.json === true) {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    reportWorkspaceUpgrade(receipt);
  }
  if (resourceMigration.reviewRequired.length > 0) process.exitCode = 2;
}

function reportWorkspaceUpgrade(receipt: WorkspaceUpgradeReceipt): void {
  console.log('Codument workspace upgraded.');
  console.log(`  backup    : ${receipt.backupRoot}`);
  console.log(`  codument/ : ${receipt.managedFiles.written} written (managed authority refreshed), ${receipt.managedFiles.kept} kept`);
  for (const skill of receipt.skills) {
    const removed = skill.removed ? `, ${skill.removed} deprecated removed` : '';
    console.log(`  skills    : ${skill.written} → ${skill.directory} (agent: ${skill.agent}${removed})`);
  }
  if (receipt.cliToolsUpdated) {
    console.log('  config/cli-tools.json: tools updated');
  }
  if (receipt.cleanup.legacyPathsRemoved > 0) {
    console.log(`  cleanup   : ${receipt.cleanup.legacyPathsRemoved} legacy path(s) removed`);
  }
  if (receipt.cleanup.legacyOperationHooksMigrated > 0) {
    console.log(`  hooks     : ${receipt.cleanup.legacyOperationHooksMigrated} legacy hook file(s) migrated`);
  }
  if (receipt.cleanup.obsoleteDefaultHooksRemoved > 0) {
    console.log(`  hooks     : ${receipt.cleanup.obsoleteDefaultHooksRemoved} obsolete default attractor hook(s) removed`);
  }
  if (receipt.cleanup.configReferencesUpdated > 0) {
    console.log(`  config    : ${receipt.cleanup.configReferencesUpdated} legacy reference(s) updated`);
  }
  const trackMigration = receipt.cleanup.trackDirectoriesMigrated;
  if (trackMigration.active > 0 || trackMigration.archived > 0) {
    console.log(`  tracks    : ${trackMigration.active} active and ${trackMigration.archived} archived path(s) migrated`);
  }
  for (const conflict of receipt.cleanup.trackDirectoryConflicts) {
    console.log(`  tracks    : migration conflict left in place: ${conflict}`);
  }
  if (receipt.cleanup.gitignoreRulesAdded > 0) {
    console.log(`  .gitignore: ${receipt.cleanup.gitignoreRulesAdded} codument rule(s) added`);
  }
  if (receipt.resources.upgraded > 0 || receipt.resources.removed > 0) {
    console.log(`  migrate   : ${receipt.resources.upgraded} resource(s) versioned, ${receipt.resources.removed} empty decision file(s) removed`);
  }
  for (const review of receipt.reviewRequired) {
    console.log(`  migrate   : review-required ${review.path}: ${review.diagnostics.join('; ')}`);
  }
  for (const review of receipt.semanticReviewRecommended) {
    console.log(`  migrate   : semantic-review ${review.targetPath ?? review.path} (compare with ${review.backupPath ?? 'backup'})`);
  }
  for (const file of receipt.instructionFilesRefreshed) {
    console.log(`  ${file.padEnd(10)}: managed block refreshed`);
  }
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
  const paths = ['codument', 'AGENTS.md', 'CLAUDE.md'];
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
      if (!fs.existsSync(path.join(source, 'track.xnl')) && !fs.existsSync(path.join(source, 'track.xml')) && !fs.existsSync(path.join(source, 'plan.xml'))) {
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
    'codument/std/root-agents.md',
    'codument/std/actions',
    'codument/std/sop',
    'codument/std/plan-xml-spec.md',
    'codument/std/spec/track-xml-spec.md',
    'codument/std/spec/mission-xml-spec.md',
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

function migrateLegacyOperationHooks(backupRoot: string): number {
  const configDir = path.join('codument', 'config');
  const currentXnl = path.join(configDir, 'operation-hooks.xnl');
  if (fs.existsSync(currentXnl)) return 0;

  const legacySources = [
    path.join(configDir, 'action-hooks.xnl'),
    path.join(configDir, 'action-hooks.xml'),
    path.join(configDir, 'operation-hooks.xml'),
  ];
  const legacyPath = legacySources.find((candidate) => fs.existsSync(candidate));
  if (!legacyPath) return 0;

  const migrated = fs.readFileSync(legacyPath, 'utf-8')
    .replace(/ActionHooks/g, 'OperationHooks')
    .replace(/\bActions\b/g, 'Operations')
    .replace(/\bAction\b/g, 'Operation')
    .replace(/action hooks/gi, 'operation hooks')
    .replace(/codument\.config\.action_hooks/g, 'codument.config.operation_hooks');
  const targetPath = legacyPath.endsWith('.xnl')
    ? currentXnl
    : path.join(configDir, 'operation-hooks.xml');
  copyRecursive(legacyPath, path.join(backupRoot, legacyPath));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, migrated, 'utf-8');
  if (legacyPath !== targetPath) fs.rmSync(legacyPath, { force: true });
  return 1;
}

function removeObsoleteDefaultAttractorHooks(): number {
  const operationPath = path.join('codument', 'config', 'operation-hooks.xml');
  if (!fs.existsSync(operationPath)) {
    return 0;
  }

  const obsoletePoints = ['discuss:before', 'impl-quick:before', 'revise-track:before'];
  const original = fs.readFileSync(operationPath, 'utf-8');
  let updated = original;
  let removed = 0;

  for (const point of obsoletePoints) {
    const hook = new RegExp(
      `\\s*<Hook\\s+on=["']${point}["']\\s*>\\s*`
        + `<cdt:AttractorCheck\\s+use=["']coding["']\\s*/>\\s*</Hook>`,
      'g',
    );
    updated = updated.replace(hook, () => {
      removed++;
      return '';
    });
  }

  if (removed === 0) {
    return 0;
  }

  for (const operation of ['discuss', 'impl-quick', 'revise-track']) {
    const emptyOperation = new RegExp(
      `\\s*<Operation\\s+name=["']${operation}["']\\s*>\\s*<Hooks\\s*>\\s*</Hooks>\\s*</Operation>`,
      'g',
    );
    updated = updated.replace(emptyOperation, '');
  }

  fs.writeFileSync(operationPath, updated, 'utf-8');
  return removed;
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
    'codument/config/operation-hooks.xml',
    'codument/config/attractor-profiles.xnl',
    'codument/config/operation-hooks.xnl',
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
