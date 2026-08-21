import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { wordToString, type DataElementNode, type XnlNode } from 'xnl-core';
import {
  ACTIVE_TRACKS_DIR,
  ARCHIVED_TRACKS_DIR,
  BEHAVIORS_DIR,
  CONFIG_DIR,
  DECISIONS_DIR,
  MEMORY_DIR,
  SPECS_DIR,
  getActiveTrackDir,
  codumentExists,
  getTrack,
  parseOptions,
} from '../utils';
import {
  cleanupRegistryStagingTransaction,
  commitRegistryStages,
  createRegistryStagingTransaction,
  finalizeRegistryCommit,
  rollbackRegistryCommit,
  stageRegistry,
  shouldPreserveRegistryStagingTransaction,
  type RegistryStagingTransaction,
  type StagedRegistry,
} from '../archive/staging';
import { loadEngineeringConfig } from '../engineering/config';
import { loadEngineeringRegistry, saveEngineeringFile } from '../engineering/registry';
import { mergeEngineering, type MergeConflict } from '../engineering/merge';
import { validateEngineeringTree } from '../engineering/validate';
import { loadModelingConfig } from '../modeling/config';
import {
  loadModelingRegistry,
  modelingDeltaPathToRegistryOwnerPath,
  saveModelingFile,
} from '../modeling/registry';
import { mergeModeling, type MergeConflict as ModelingMergeConflict } from '../modeling/merge';
import { validateModelingTree } from '../modeling/validate';
import { applyBehaviorPatchToRegistry, applySpecXmlPatchToRegistry, parseSpecXmlContent } from '../utils/spec-xml';
import { buildArchiveDestination, formatLocalMinutePrefix, resolveTrackUpdatedDate } from '../utils/track-time';
import { applyDecisionSources, collectDecisionSourceFiles } from '../decisions/registry';
import { discoverXnlRegistryFiles, validateXnlFile } from '../xnl/registry';
import { parseTrackResource, resolveTrackAuthority } from '../track/resource';
import { parseMissionResource } from '../mission/resource';
import { markMissionArchived } from '../resources/lifecycle';
import { readXnlDecisionRecords } from './decisions';
import { parseConfigRoot } from '../config/resource';

export interface ArchiveEffects {
  moveTrack(source: string, destination: string): void;
}

const DEFAULT_ARCHIVE_EFFECTS: ArchiveEffects = {
  moveTrack: fs.renameSync,
};

export async function archiveCommand(
  args: string[],
  effects: ArchiveEffects = DEFAULT_ARCHIVE_EFFECTS,
) {
  if (!codumentExists()) {
    console.error('Codument is not initialized. Run codument init first.');
    process.exit(1);
  }

  const { positional, options } = parseOptions(args);
  const trackId = positional[0];
  const skipSpecs = options['skip-specs'] === true;
  const skipConfirm = options['yes'] === true || options['y'] === true;

  if (!trackId) {
    console.error('Please specify a track ID to archive.');
    console.log('Usage: codument archive <track-id> [--skip-specs] [--yes]');
    process.exit(1);
  }

  const track = getTrack(trackId);

  if (!track) {
    console.error(`Track not found: ${trackId}`);
    process.exit(1);
  }

  // Check if track is completed
  if (track.metadata.status !== 'completed') {
    console.log(`Warning: Track "${trackId}" is not marked as completed (status: ${track.metadata.status})`);

    if (!skipConfirm) {
      console.warn('Warning: Archive requires explicit confirmation for non-completed tracks. Re-run with --yes/-y to archive anyway, or mark the track as completed first.');
      process.exit(1);
    }
  }

  const trackDir = getActiveTrackDir(trackId);
  const updatedDate = resolveTrackUpdatedDate(trackDir);
  const archiveDir = buildArchiveDestination(trackDir, trackId, ARCHIVED_TRACKS_DIR);
  const archiveId = path.basename(archiveDir);

  console.log(`\nArchiving track: ${trackId}`);
  console.log(`Destination: ${archiveDir}`);

  // Ensure the archive parent exists, but do not create the destination before commit.
  const archiveParentDir = path.dirname(archiveDir);
  if (!fs.existsSync(archiveParentDir)) {
    fs.mkdirSync(archiveParentDir, { recursive: true });
  }
  if (fs.existsSync(archiveDir)) {
    console.error(`Archive destination already exists: ${archiveDir}`);
    process.exit(1);
  }

  assertValidArchiveDecisions(trackDir);
  assertNoLegacyDecisionMarkdown(trackDir);
  validateTrackXnlFiles(trackDir);
  const engineeringPlan = prepareEngineeringDeltaMerge(trackDir);
  const modelingPlan = prepareModelingDeltaMerge(trackDir);
  const decisionSources = collectDecisionSourceFiles(trackDir);
  const transaction = createRegistryStagingTransaction();
  let updatedBehaviorCapabilities: string[] | null = null;
  let updatedEngineeringFiles: string[] = [];
  let updatedModelingFiles: string[] = [];
  let updatedDecisionFiles: string[] = [];
  let preserveStaging = false;

  try {
    const behaviorUpdate = skipSpecs
      ? null
      : stageArchivedSpecDeltas(transaction, trackDir);
    const engineeringStage = engineeringPlan
      ? stagePreparedRegistryMerge(transaction, engineeringPlan)
      : null;
    const modelingStage = modelingPlan
      ? stagePreparedRegistryMerge(transaction, modelingPlan)
      : null;
    const decisionUpdate = decisionSources.length > 0
      ? stageRegistry(transaction, 'decision', DECISIONS_DIR, (stagedDir) =>
        applyDecisionSources(stagedDir, trackDir, decisionSources))
      : null;

    if (engineeringStage) {
      validateStagedRegistry(engineeringStage);
    }
    if (modelingStage) {
      validateStagedRegistry(modelingStage);
    }

    updatedBehaviorCapabilities = skipSpecs ? null : behaviorUpdate?.updated ?? [];
    const commitReceipt = commitRegistryStages(
      transaction,
      [behaviorUpdate?.stage, engineeringStage, modelingStage, decisionUpdate?.stage],
    );
    if (engineeringStage) {
      updatedEngineeringFiles = engineeringStage.changedFiles;
    }
    if (modelingStage) {
      updatedModelingFiles = modelingStage.changedFiles;
    }
    if (decisionUpdate) {
      updatedDecisionFiles = decisionUpdate.result;
    }

    try {
      effects.moveTrack(trackDir, archiveDir);
    } catch (moveError) {
      rollbackRegistryCommit(commitReceipt, moveError);
      throw moveError;
    }
    finalizeRegistryCommit(commitReceipt);
  } catch (error) {
    preserveStaging = shouldPreserveRegistryStagingTransaction(error);
    throw error;
  } finally {
    if (!preserveStaging) {
      cleanupRegistryStagingTransaction(transaction);
    }
  }

  console.log('✓ Track moved to tracks/archived');
  console.log(`✓ Archive ID: ${archiveId}`);

  if (updatedBehaviorCapabilities === null) {
    console.log('  Skipped behavior/spec updates (--skip-specs)');
  } else if (updatedBehaviorCapabilities.length > 0) {
    console.log(`✓ Updated behavior/spec registry: ${updatedBehaviorCapabilities.join(', ')}`);
  } else {
    console.log('  No behavior/spec updates needed');
  }

  if (updatedEngineeringFiles.length > 0) {
    console.log(`✓ Updated engineering registry: ${updatedEngineeringFiles.join(', ')}`);
  } else if (engineeringPlan) {
    console.log('  No engineering updates needed');
  }

  if (updatedModelingFiles.length > 0) {
    console.log(`✓ Updated modeling registry: ${updatedModelingFiles.join(', ')}`);
  } else if (modelingPlan) {
    console.log('  No modeling updates needed');
  }

  if (updatedDecisionFiles.length > 0) {
    console.log(`✓ Updated decision registry: ${updatedDecisionFiles.join(', ')}`);
  }

  const summaryPath = generateArchiveSummary(archiveDir, trackId);
  if (summaryPath) {
    console.log(`✓ Generated archive summary: ${summaryPath}`);
  }

  // Memory promotion requires both an enabled profile and explicit candidates.
  const promotedMemory = isMemoryProfileEnabled()
    ? promoteMemoryRecords(archiveDir, archiveId, trackId, updatedDate)
    : [];
  if (promotedMemory.length > 0) {
    console.log(`✓ Promoted memory records: ${promotedMemory.join(', ')}`);
  }

  console.log(`\n✓ Track "${trackId}" archived successfully!\n`);
}

export async function archiveMissionCommand(args: string[]): Promise<void> {
  if (!codumentExists()) throw new Error('Codument is not initialized. Run codument init first.');
  const { positional, options } = parseOptions(args);
  const missionId = positional[0];
  if (!missionId || positional.length !== 1) throw new Error('Usage: codument mission archive <mission-id> [--yes]');
  const yes = options.yes === true || options.y === true;
  const located = locateMissionForArchive(missionId);
  const root = parseMissionResource(path.join(located.dir, 'mission.xnl'));
  const status = missionMetadata(root, 'Status') ?? located.stage;
  if (!['completed', 'cancelled', 'superseded'].includes(status) && !yes) {
    throw new Error(`Mission '${missionId}' has status '${status}'. Re-run with --yes to archive it explicitly.`);
  }
  const unresolvedLinks = missionTrackLinkIssues(root);
  if (unresolvedLinks.length > 0 && !yes) {
    throw new Error(`Mission has active or missing bound tracks: ${unresolvedLinks.join(', ')}. Re-run with --yes to preserve them and continue.`);
  }
  assertValidArchiveDecisions(located.dir);
  assertNoLegacyDecisionMarkdown(located.dir);

  const destination = missionArchiveDestination(missionId);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const decisionSources = collectDecisionSourceFiles(located.dir);
  const transaction = createRegistryStagingTransaction();
  let receipt: ReturnType<typeof commitRegistryStages> | undefined;
  let moved = false;
  try {
    const decisionUpdate = decisionSources.length > 0
      ? stageRegistry(transaction, 'decision', DECISIONS_DIR, (stagedDir) =>
        applyDecisionSources(stagedDir, located.dir, decisionSources))
      : null;
    receipt = commitRegistryStages(transaction, [decisionUpdate?.stage]);
    fs.renameSync(located.dir, destination);
    moved = true;
    markMissionArchived(path.join(destination, 'mission.xnl'));
    finalizeRegistryCommit(receipt);
  } catch (error) {
    if (moved && fs.existsSync(destination) && !fs.existsSync(located.dir)) fs.renameSync(destination, located.dir);
    if (receipt && !receipt.settled) rollbackRegistryCommit(receipt, error);
    throw error;
  } finally {
    if (!receipt) cleanupRegistryStagingTransaction(transaction);
  }
  const promoted = isMemoryProfileEnabled()
    ? promoteMemoryRecords(destination, path.basename(destination), missionId, new Date())
    : [];
  console.log(`✓ Mission '${missionId}' archived to ${destination}`);
  if (unresolvedLinks.length > 0) console.log(`  preserved linked-track issues: ${unresolvedLinks.join(', ')}`);
  if (promoted.length > 0) console.log(`  promoted memory: ${promoted.join(', ')}`);
}

function locateMissionForArchive(id: string): { dir: string; stage: 'active' | 'pending' } {
  for (const stage of ['active', 'pending'] as const) {
    const dir = path.join('codument', 'missions', stage, id);
    if (fs.existsSync(path.join(dir, 'mission.xnl'))) return { dir, stage };
  }
  throw new Error(`Mission '${id}' was not found in active or pending.`);
}

function missionMetadata(root: import('../utils/spec-xml').SpecXmlNode, tag: string): string | undefined {
  return root.children.find((node) => node.tag === 'Metadata')?.children
    .find((node) => node.tag === tag)?.text?.trim();
}

function missionTrackLinkIssues(root: import('../utils/spec-xml').SpecXmlNode): string[] {
  const links: import('../utils/spec-xml').SpecXmlNode[] = [];
  const visit = (node: import('../utils/spec-xml').SpecXmlNode): void => {
    if (node.tag === 'cdt:TrackLink' && node.attrs.state === 'bound') links.push(node);
    for (const child of node.children) visit(child);
  };
  visit(root);
  return links.flatMap((link) => {
    const id = link.attrs.id;
    if (!id) return ['(missing-id)'];
    if (fs.existsSync(path.join(ACTIVE_TRACKS_DIR, id, 'track.xnl'))) return [`${id}:active`];
    const archived = findArchivedTrack(id);
    return archived ? [] : [`${id}:missing`];
  });
}

function findArchivedTrack(id: string): boolean {
  const visit = (dir: string): boolean => {
    if (!fs.existsSync(dir)) return false;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const candidate = path.join(dir, entry.name);
      if (entry.isDirectory() && visit(candidate)) return true;
      if (entry.isFile() && entry.name === 'track.xnl' && path.basename(path.dirname(candidate)).endsWith(`-${id}`)) return true;
    }
    return false;
  };
  return visit(ARCHIVED_TRACKS_DIR);
}

function missionArchiveDestination(id: string): string {
  const date = new Date();
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const root = path.join('codument', 'missions', 'archived');
  let destination = path.join(root, `${day}-${id}`);
  let suffix = 2;
  while (fs.existsSync(destination)) destination = path.join(root, `${day}-${id}-${suffix++}`);
  return destination;
}

function isMemoryProfileEnabled(): boolean {
  const xnl = path.join(CONFIG_DIR, 'attractor-profiles.xnl');
  if (fs.existsSync(xnl)) {
    try {
      const root = parseConfigRoot(xnl, 'AttractorProfiles');
      const profiles = root.extend?.children.Profiles;
      if (!isDataElementNode(profiles)) return false;
      const memory = (profiles.body ?? []).find((node) => isDataElementNode(node) && wordToString(node.id) === 'memory');
      return isDataElementNode(memory) && memory.attributes?.enabled === true;
    } catch {
      return false;
    }
  }

  const xml = path.join(CONFIG_DIR, 'attractor-profiles.xml');
  if (!fs.existsSync(xml)) return false;
  try {
    const root = parseSpecXmlContent(fs.readFileSync(xml, 'utf8'));
    const memory = root.children.find((node) => node.tag === 'Profile' && node.attrs.name === 'memory');
    return memory?.attrs.enabled === 'true';
  } catch {
    return false;
  }
}

function isDataElementNode(node: XnlNode | undefined): node is DataElementNode {
  return Boolean(node && typeof node === 'object' && !Array.isArray(node)
    && 'kind' in node && node.kind === 'DataElement');
}

function assertValidArchiveDecisions(trackDir: string): void {
  const file = path.join(trackDir, 'decisions.xnl');
  if (!fs.existsSync(file)) {
    return;
  }
  try {
    readXnlDecisionRecords(file);
  } catch (error) {
    throw new Error(`Invalid decisions.xnl before archive: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertNoLegacyDecisionMarkdown(trackDir: string): void {
  const legacyFiles: string[] = [];
  const decisionsDir = path.join(trackDir, 'decisions');
  const visit = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isFile() && (
        ['decision.md', 'decisions.md'].includes(entry.name.toLowerCase())
        || (entryPath.startsWith(`${decisionsDir}${path.sep}`) && entry.name.endsWith('.md'))
      )) {
        legacyFiles.push(path.relative(trackDir, entryPath));
      }
    }
  };
  visit(trackDir);
  if (legacyFiles.length === 0) return;
  throw new Error(
    `Legacy Decision Markdown requires upgrade-resource and AI review before archive: ${legacyFiles.sort().join(', ')}`,
  );
}

function validateTrackXnlFiles(trackDir: string): void {
  const findings: { file: string; line?: number; message: string }[] = [];
  const visit = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.xnl')) continue;
      const relFile = path.relative(trackDir, entryPath);
      const content = fs.readFileSync(entryPath, 'utf-8');
      for (const finding of validateXnlFile(relFile, content)) {
        findings.push(finding);
      }
    }
  };
  visit(trackDir);
  if (findings.length === 0) return;
  throw new Error(
    'XNL syntax validation failed before archive:\n'
      + findings.map((finding) => `  - ${finding.file}${finding.line ? `:${finding.line}` : ''}: ${finding.message}`).join('\n'),
  );
}

interface StagedSpecUpdate {
  stage: StagedRegistry | null;
  updated: string[];
}

function stageArchivedSpecDeltas(
  transaction: RegistryStagingTransaction,
  trackDir: string,
): StagedSpecUpdate {
  const behaviorPatches = collectBehaviorPatches(trackDir, ['behavior_deltas', 'behavior-deltas']);
  if (behaviorPatches.length > 0) {
    const staged = stageRegistry(transaction, 'behavior', BEHAVIORS_DIR, (stagedDir) => {
      const updated = new Set<string>();
      for (const patchPath of behaviorPatches) {
        for (const capability of applyBehaviorPatchToRegistry(fs.readFileSync(patchPath, 'utf-8'), stagedDir)) {
          updated.add(capability);
        }
      }
      return [...updated];
    });
    return { stage: staged.stage, updated: staged.result };
  }

  const legacyXmlPatches = collectXmlPatches(trackDir, ['spec_deltas', 'spec-deltas']);
  if (legacyXmlPatches.length > 0) {
    const staged = stageRegistry(transaction, 'spec', SPECS_DIR, (stagedDir) => {
      const updated = new Set<string>();
      for (const patchPath of legacyXmlPatches) {
        for (const capability of applySpecXmlPatchToRegistry(fs.readFileSync(patchPath, 'utf-8'), stagedDir)) {
          updated.add(capability);
        }
      }
      return [...updated];
    });
    return { stage: staged.stage, updated: staged.result };
  }

  const xmlPatchCandidates = ['spec.xml', 'spec.patch.xml', 'patch.xml'];
  for (const candidate of xmlPatchCandidates) {
    const patchPath = path.join(trackDir, candidate);
    if (fs.existsSync(patchPath)) {
      const staged = stageRegistry(transaction, 'spec', SPECS_DIR, (stagedDir) =>
        applySpecXmlPatchToRegistry(fs.readFileSync(patchPath, 'utf-8'), stagedDir));
      return { stage: staged.stage, updated: staged.result };
    }
  }

  const specPath = path.join(trackDir, 'spec.md');
  if (fs.existsSync(specPath)) {
    return { stage: null, updated: applySpecDeltas(specPath) };
  }

  return { stage: null, updated: [] };
}

type RegistryKind = 'modeling' | 'engineering';

interface MergedRegistryFile {
  relFile: string;
  nodes: XnlNode[];
}

interface PreparedRegistryMerge {
  kind: RegistryKind;
  registryDir: string;
  files: MergedRegistryFile[];
}

function formatValidationFinding(
  finding: { file: string; line?: number; layer: string; message: string },
): string {
  const line = finding.line === undefined ? '' : `:${finding.line}`;
  return `${finding.file}${line} [${finding.layer}] ${finding.message}`;
}

function validateStagedRegistry(stage: StagedRegistry): void {
  const label = stage.kind === 'modeling' ? 'Modeling' : 'Engineering';
  const findings = stage.kind === 'modeling'
    ? validateModelingTree(stage.stagedDir, { mode: 'registry' })
    : validateEngineeringTree(stage.stagedDir);
  const warnings = findings.filter((finding) => finding.severity === 'warning');
  const errors = findings.filter((finding) => finding.severity === 'error');

  for (const warning of warnings) {
    console.warn(`${label} registry validation warning: ${formatValidationFinding(warning)}`);
  }
  if (errors.length > 0) {
    throw new Error(
      `${label} registry validation failed:\n`
      + errors.map((finding) => `  - ${formatValidationFinding(finding)}`).join('\n'),
    );
  }
}

function stagePreparedRegistryMerge(
  transaction: RegistryStagingTransaction,
  prepared: PreparedRegistryMerge,
): StagedRegistry | null {
  const { kind, registryDir, files } = prepared;
  if (files.length === 0) {
    return null;
  }

  return stageRegistry(transaction, kind, registryDir, (stagedDir) => {
    for (const file of files) {
      const abs = path.join(stagedDir, file.relFile);
      if (file.nodes.length === 0) {
        fs.rmSync(abs, { recursive: true, force: true });
        continue;
      }

      if (fs.existsSync(abs) && !fs.statSync(abs).isFile()) {
        fs.rmSync(abs, { recursive: true, force: true });
      }
      if (kind === 'modeling') {
        saveModelingFile(stagedDir, file.relFile, file.nodes);
      } else {
        saveEngineeringFile(stagedDir, file.relFile, file.nodes);
      }
    }
  }).stage;
}

function prepareModelingDeltaMerge(trackDir: string): PreparedRegistryMerge | null {
  const config = loadModelingConfig();
  if (!config.enabled) {
    return null;
  }

  const deltaDir = path.join(trackDir, 'modeling_deltas');
  if (!fs.existsSync(deltaDir)) {
    return null;
  }

  const theirs = loadModelingRegistry(deltaDir);
  if (theirs.files.size === 0) {
    return { kind: 'modeling', registryDir: config.registryDir, files: [] };
  }

  const registryDir = config.registryDir;
  const baseDir = materializeModelingBase(trackDir, registryDir);
  const base = loadModelingRegistry(baseDir);
  const ours = loadModelingRegistry(registryDir);
  const mergedFiles: MergedRegistryFile[] = [];
  const conflicts: ModelingMergeConflict[] = [];

  for (const deltaRelFile of theirs.files.keys()) {
    const ownerRelFile = modelingDeltaPathToRegistryOwnerPath(deltaRelFile);
    const result = mergeModeling(
      base.files.get(ownerRelFile) ?? [],
      ours.files.get(ownerRelFile) ?? [],
      theirs.files.get(deltaRelFile) ?? [],
      config.mergePolicy,
    );
    conflicts.push(...result.conflicts);
    mergedFiles.push({ relFile: ownerRelFile, nodes: [...result.merged.values()] });
  }

  if (conflicts.length > 0) {
    console.error('Modeling delta merge conflicts:');
    for (const conflict of conflicts) {
      console.error(`  - ${conflict.id}: ${conflict.type}`);
    }
    console.error('Resolve conflicts manually or adjust codument/config/modeling.xnl MergePolicy.');
    process.exit(1);
  }

  return { kind: 'modeling', registryDir, files: mergedFiles };
}

function materializeModelingBase(trackDir: string, registryDir: string): string {
  const commit = readModelingBaseCommit(trackDir);
  if (!commit) {
    if (loadModelingRegistry(registryDir).files.size > 0) {
      throw new Error('Track has modeling deltas but no modeling_base_commit; recreate or migrate the Track baseline before archive.');
    }
    return registryDir;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-modeling-base-'));
  const gitPath = registryDir.split(path.sep).join('/');
  let files: string;
  try {
    files = execFileSync('git', ['ls-tree', '-r', '--name-only', commit, '--', gitPath], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    throw new Error(`Unable to read modeling base commit '${commit}': ${String(err)}`);
  }

  for (const fullPath of files.split('\n').filter(Boolean)) {
    if (!fullPath.endsWith('.xnl')) {
      continue;
    }
    const prefix = `${gitPath}/`;
    if (!fullPath.startsWith(prefix)) {
      continue;
    }
    const relFile = fullPath.slice(prefix.length).split('/').join(path.sep);
    const content = execFileSync('git', ['show', `${commit}:${fullPath}`], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const out = path.join(tempDir, relFile);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, content, 'utf-8');
  }

  return tempDir;
}

function readModelingBaseCommit(trackDir: string): string | null {
  return readTrackMetadataField(trackDir, 'ModelingBaseCommit');
}

function prepareEngineeringDeltaMerge(trackDir: string): PreparedRegistryMerge | null {
  const config = loadEngineeringConfig();
  if (!config.enabled) {
    return null;
  }

  const deltaDir = path.join(trackDir, 'engineering_deltas');
  if (!fs.existsSync(deltaDir)) {
    return null;
  }

  const theirs = loadEngineeringRegistry(deltaDir);
  if (theirs.files.size === 0) {
    return { kind: 'engineering', registryDir: config.registryDir, files: [] };
  }

  const registryDir = config.registryDir;
  const baseDir = materializeEngineeringBase(trackDir, registryDir);
  const base = loadEngineeringRegistry(baseDir);
  const ours = loadEngineeringRegistry(registryDir);
  const mergedFiles: MergedRegistryFile[] = [];
  const conflicts: MergeConflict[] = [];

  for (const relFile of theirs.files.keys()) {
    const result = mergeEngineering(
      base.files.get(relFile) ?? [],
      ours.files.get(relFile) ?? [],
      theirs.files.get(relFile) ?? [],
      config.mergePolicy,
    );
    conflicts.push(...result.conflicts);
    mergedFiles.push({ relFile, nodes: [...result.merged.values()] });
  }

  if (conflicts.length > 0) {
    console.error('Engineering delta merge conflicts:');
    for (const conflict of conflicts) {
      console.error(`  - ${conflict.id}: ${conflict.type}`);
    }
    console.error('Resolve conflicts manually or adjust codument/config/engineering.xnl MergePolicy.');
    process.exit(1);
  }

  return { kind: 'engineering', registryDir, files: mergedFiles };
}

function materializeEngineeringBase(trackDir: string, registryDir: string): string {
  const commit = readEngineeringBaseCommit(trackDir);
  if (!commit) {
    if (loadEngineeringRegistry(registryDir).files.size > 0) {
      throw new Error('Track has engineering deltas but no engineering_base_commit; recreate or migrate the Track baseline before archive.');
    }
    return registryDir;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-engineering-base-'));
  const gitPath = registryDir.split(path.sep).join('/');
  let files: string;
  try {
    files = execFileSync('git', ['ls-tree', '-r', '--name-only', commit, '--', gitPath], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    throw new Error(`Unable to read engineering base commit '${commit}': ${String(err)}`);
  }

  for (const fullPath of files.split('\n').filter(Boolean)) {
    if (!fullPath.endsWith('.xnl')) {
      continue;
    }
    const prefix = `${gitPath}/`;
    if (!fullPath.startsWith(prefix)) {
      continue;
    }
    const relFile = fullPath.slice(prefix.length).split('/').join(path.sep);
    const content = execFileSync('git', ['show', `${commit}:${fullPath}`], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const out = path.join(tempDir, relFile);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, content, 'utf-8');
  }

  return tempDir;
}

function readEngineeringBaseCommit(trackDir: string): string | null {
  return readTrackMetadataField(trackDir, 'EngineeringBaseCommit');
}

function readTrackMetadataField(trackDir: string, field: string): string | null {
  const authority = resolveTrackAuthority(trackDir);
  if (!authority) return null;
  const root = parseTrackResource(authority.file);
  const metadata = root.children.find((child) => child.tag === 'Metadata');
  return metadata?.children.find((child) => child.tag === field)?.text?.trim() || null;
}

function collectXmlPatches(archiveDir: string, rootNames: string[]): string[] {
  const results: string[] = [];
  const roots = rootNames.map((name) => path.join(archiveDir, name));

  const visit = (dir: string) => {
    if (!fs.existsSync(dir)) {
      return;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile() && entry.name.endsWith('.xml')) {
        results.push(entryPath);
      }
    }
  };

  for (const root of roots) {
    visit(root);
  }
  return results.sort();
}

function collectBehaviorPatches(archiveDir: string, rootNames: string[]): string[] {
  const results: string[] = [];
  const visit = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isFile() && /\.(xnl|xml)$/i.test(entry.name)) results.push(entryPath);
    }
  };
  for (const rootName of rootNames) visit(path.join(archiveDir, rootName));
  return results.sort();
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writePromotedArtifact(
  rootDir: string,
  fileName: string,
  trackId: string,
  updatedDate: Date,
  content: string,
): string {
  const prefix = formatLocalMinutePrefix(updatedDate);
  const dir = path.join(rootDir, prefix.monthBucket, `${prefix.minutePrefix}-${trackId}`);
  ensureDir(dir);
  const filePath = path.join(dir, fileName);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content, 'utf-8');
  }
  return filePath;
}

function generateArchiveSummary(archiveDir: string, trackId: string): string | null {
  const xnlFiles: string[] = [];
  const rootXnl = path.join(archiveDir, 'decisions.xnl');
  if (fs.existsSync(rootXnl)) {
    xnlFiles.push(rootXnl);
  }
  const decisionsDir = path.join(archiveDir, 'decisions');
  if (fs.existsSync(decisionsDir) && fs.statSync(decisionsDir).isDirectory()) {
    xnlFiles.push(...discoverXnlRegistryFiles(decisionsDir).map(
      (relFile) => path.join(decisionsDir, ...relFile.split('/')),
    ));
  }

  if (xnlFiles.length > 0) {
    const ids = [...new Set(
      xnlFiles.flatMap((file) => readXnlDecisionRecords(file).map((record) => record.id)),
    )].sort();
    if (ids.length === 0) {
      return null;
    }
    const lines = [`# Archive Summary: ${trackId}`, '', ...ids.map((id) => `- ${id}`), ''];
    const summaryPath = path.join(archiveDir, 'summary.md');
    fs.writeFileSync(summaryPath, lines.join('\n'), 'utf-8');
    return summaryPath;
  }

  if (!fs.existsSync(decisionsDir) || !fs.statSync(decisionsDir).isDirectory()) {
    const legacyPath = path.join(archiveDir, 'decisions.md');
    if (!fs.existsSync(legacyPath)) {
      return null;
    }
    const source = fs.readFileSync(legacyPath, 'utf-8').trim();
    if (!source) {
      return null;
    }
    const title = source.match(/^# (.+)$/m)?.[1] ?? trackId;
    const lines = [`# Archive Summary: ${trackId}`, '', `- ${title}`, ''];
    const summaryPath = path.join(archiveDir, 'summary.md');
    fs.writeFileSync(summaryPath, lines.join('\n'), 'utf-8');
    return summaryPath;
  }

  const decisionFiles = fs.readdirSync(decisionsDir)
    .filter(f => f.endsWith('.md') && f !== 'summary.md');

  if (decisionFiles.length === 0) {
    return null;
  }

  const lines = [`# Archive Summary: ${trackId}`, ''];
  for (const fileName of decisionFiles) {
    const source = fs.readFileSync(path.join(decisionsDir, fileName), 'utf-8').trim();
    const title = source.match(/^# (.+)$/m)?.[1] ?? fileName.replace('.md', '');
    lines.push(`- ${title}`);
  }
  const summaryPath = path.join(archiveDir, 'summary.md');
  fs.writeFileSync(summaryPath, lines.join('\n'), 'utf-8');
  return summaryPath;
}

function promoteMemoryRecords(archiveDir: string, archiveId: string, trackId: string, updatedDate: Date): string[] {
  const promoted: string[] = [];
  const typeConfigs = [
    { type: 'lessons', fileName: 'lesson.md' },
    { type: 'incidents', fileName: 'incident.md' },
    { type: 'patterns', fileName: 'pattern.md' },
    { type: 'summaries', fileName: 'summary.md' },
  ];

  for (const { type, fileName } of typeConfigs) {
    const sourceDir = path.join(archiveDir, 'memory', type);
    if (!fs.existsSync(sourceDir)) {
      continue;
    }

    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        continue;
      }
      const source = fs.readFileSync(path.join(sourceDir, entry.name), 'utf-8').trim();
      if (!source) {
        continue;
      }
      const slug = path.basename(entry.name, '.md');
      const content = [
        `# ${type.slice(0, -1)}: ${slug}`,
        '',
        `Memory URI: memory://${type}/${slug}`,
        `Source: archive://${archiveId}`,
        '',
        source,
        '',
      ].join('\n');
      promoted.push(writePromotedArtifact(path.join(MEMORY_DIR, type), fileName, slug, updatedDate, content));
    }
  }

  return promoted;
}

function applySpecDeltas(specPath: string): string[] {
  const content = fs.readFileSync(specPath, 'utf-8');
  const updatedSpecs: string[] = [];

  // Parse the spec file for delta operations
  const addedMatch = content.match(/## ADDED Requirements\n([\s\S]*?)(?=## (?:MODIFIED|REMOVED|RENAMED) Requirements|$)/);
  const modifiedMatch = content.match(/## MODIFIED Requirements\n([\s\S]*?)(?=## (?:ADDED|REMOVED|RENAMED) Requirements|$)/);
  const removedMatch = content.match(/## REMOVED Requirements\n([\s\S]*?)(?=## (?:ADDED|MODIFIED|RENAMED) Requirements|$)/);

  // Extract capability from first requirement
  // This is simplified - in a real implementation, you'd parse the full structure
  const requirements = content.match(/^### Requirement: (.+)$/gm) || [];

  if (requirements.length === 0) {
    return updatedSpecs;
  }

  // For simplicity, we'll just note which capabilities would be updated
  // A full implementation would parse and apply the deltas

  if (addedMatch && addedMatch[1].trim()) {
    // Would add new requirements to specs
    console.log('  Found ADDED requirements (would apply to specs)');
  }

  if (modifiedMatch && modifiedMatch[1].trim()) {
    // Would modify existing requirements
    console.log('  Found MODIFIED requirements (would apply to specs)');
  }

  if (removedMatch && removedMatch[1].trim()) {
    // Would remove requirements
    console.log('  Found REMOVED requirements (would apply to specs)');
  }

  return updatedSpecs;
}
