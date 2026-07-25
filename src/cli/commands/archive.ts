import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import type { XnlNode } from 'xnl-core';
import {
  ARCHIVED_TRACKS_DIR,
  BEHAVIORS_DIR,
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
import { applySpecXmlPatchToRegistry } from '../utils/spec-xml';
import { buildArchiveDestination, formatLocalMinutePrefix, resolveTrackUpdatedDate } from '../utils/track-time';
import {
  readXnlDecisionRecords,
  type XnlDecisionRecord,
} from './decisions';

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
  const engineeringPlan = prepareEngineeringDeltaMerge(trackDir);
  const modelingPlan = prepareModelingDeltaMerge(trackDir);
  const transaction = createRegistryStagingTransaction();
  let updatedBehaviorCapabilities: string[] | null = null;
  let updatedEngineeringFiles: string[] = [];
  let updatedModelingFiles: string[] = [];
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

    if (engineeringStage) {
      validateStagedRegistry(engineeringStage);
    }
    if (modelingStage) {
      validateStagedRegistry(modelingStage);
    }

    updatedBehaviorCapabilities = skipSpecs ? null : behaviorUpdate?.updated ?? [];
    const commitReceipt = commitRegistryStages(
      transaction,
      [behaviorUpdate?.stage, engineeringStage, modelingStage],
    );
    if (engineeringStage) {
      updatedEngineeringFiles = engineeringStage.changedFiles;
    }
    if (modelingStage) {
      updatedModelingFiles = modelingStage.changedFiles;
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

  const promotedDecision = promoteDecisionRecord(archiveDir, archiveId, trackId, updatedDate);
  if (promotedDecision) {
    console.log(`✓ Promoted decision record: ${promotedDecision}`);
  }

  const summaryPath = generateArchiveSummary(archiveDir, trackId);
  if (summaryPath) {
    console.log(`✓ Generated archive summary: ${summaryPath}`);
  }

  // Promote memory candidates the track explicitly provided (no-op when none exist).
  const promotedMemory = promoteMemoryRecords(archiveDir, archiveId, trackId, updatedDate);
  if (promotedMemory.length > 0) {
    console.log(`✓ Promoted memory records: ${promotedMemory.join(', ')}`);
  }

  console.log(`\n✓ Track "${trackId}" archived successfully!\n`);
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

interface StagedSpecUpdate {
  stage: StagedRegistry | null;
  updated: string[];
}

function stageArchivedSpecDeltas(
  transaction: RegistryStagingTransaction,
  trackDir: string,
): StagedSpecUpdate {
  const behaviorPatches = collectXmlPatches(trackDir, ['behavior_deltas', 'behavior-deltas']);
  if (behaviorPatches.length > 0) {
    const staged = stageRegistry(transaction, 'behavior', BEHAVIORS_DIR, (stagedDir) => {
      const updated = new Set<string>();
      for (const patchPath of behaviorPatches) {
        for (const capability of applySpecXmlPatchToRegistry(fs.readFileSync(patchPath, 'utf-8'), stagedDir)) {
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
    console.error('Resolve conflicts manually or adjust codument/config/modeling.xml MergePolicy.');
    process.exit(1);
  }

  return { kind: 'modeling', registryDir, files: mergedFiles };
}

function materializeModelingBase(trackDir: string, registryDir: string): string {
  const commit = readModelingBaseCommit(trackDir);
  if (!commit) {
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
  const trackXml = path.join(trackDir, 'track.xml');
  if (!fs.existsSync(trackXml)) {
    return null;
  }
  const content = fs.readFileSync(trackXml, 'utf-8');
  return content.match(/<ModelingBaseCommit>([^<]+)<\/ModelingBaseCommit>/)?.[1]?.trim() || null;
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
    console.error('Resolve conflicts manually or adjust codument/config/engineering.xml MergePolicy.');
    process.exit(1);
  }

  return { kind: 'engineering', registryDir, files: mergedFiles };
}

function materializeEngineeringBase(trackDir: string, registryDir: string): string {
  const commit = readEngineeringBaseCommit(trackDir);
  if (!commit) {
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
  const trackXml = path.join(trackDir, 'track.xml');
  if (!fs.existsSync(trackXml)) {
    return null;
  }
  const content = fs.readFileSync(trackXml, 'utf-8');
  return content.match(/<EngineeringBaseCommit>([^<]+)<\/EngineeringBaseCommit>/)?.[1]?.trim() || null;
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

function decisionUriForSlug(slug: string): string {
  return `decision://${slug}`;
}

function durableXnlDecisionRecords(file: string): XnlDecisionRecord[] {
  return readXnlDecisionRecords(file).filter(record =>
    record.durableCandidate &&
    record.status !== undefined &&
    ['accepted', 'resolved'].includes(record.status)
  );
}

function formatXnlDecisionArtifact(record: XnlDecisionRecord, archiveId: string): string {
  const lines = [
    `# Decision: ${record.id}`,
    '',
    `Decision URI: ${decisionUriForSlug(record.id)}`,
    `Source: archive://${archiveId}`,
    '',
    `Status: ${record.status ?? ''}`,
    `Durable candidate: ${record.durableCandidate ? 'yes' : 'no'}`,
  ];
  if (record.evidence) lines.push(`Evidence: ${record.evidence}`);
  if (record.confidence) lines.push(`Confidence: ${record.confidence}`);
  if (record.reversibility) lines.push(`Reversibility: ${record.reversibility}`);
  lines.push('');
  return lines.join('\n');
}

function promoteDecisionRecord(archiveDir: string, archiveId: string, trackId: string, updatedDate: Date): string | null {
  const decisionsDir = path.join(archiveDir, 'decisions');
  if (!fs.existsSync(decisionsDir) || !fs.statSync(decisionsDir).isDirectory()) {
    const xnlPath = path.join(archiveDir, 'decisions.xnl');
    if (fs.existsSync(xnlPath)) {
      let promoted: string | null = null;
      for (const record of durableXnlDecisionRecords(xnlPath)) {
        promoted = writePromotedArtifact(
          DECISIONS_DIR,
          'decision.md',
          record.id,
          updatedDate,
          formatXnlDecisionArtifact(record, archiveId),
        );
      }
      return promoted;
    }

    // legacy fallback: single decisions.md file
    const legacyPath = path.join(archiveDir, 'decisions.md');
    if (!fs.existsSync(legacyPath)) {
      return null;
    }
    const source = fs.readFileSync(legacyPath, 'utf-8').trim();
    if (!source || source === '# Decisions') {
      return null;
    }
    if (!hasDurableDecision(source)) {
      return null;
    }
    const content = [
      `# Decision: ${trackId}`,
      '',
      `Decision URI: ${decisionUriForSlug(trackId)}`,
      `Source: archive://${archiveId}`,
      '',
      source,
      '',
    ].join('\n');
    return writePromotedArtifact(DECISIONS_DIR, 'decision.md', trackId, updatedDate, content);
  }

  const decisionFiles = fs.readdirSync(decisionsDir)
    .filter(f => f.endsWith('.md') && f !== 'summary.md');

  if (decisionFiles.length === 0) {
    return null;
  }

  let promoted: string | null = null;
  for (const fileName of decisionFiles) {
    const source = fs.readFileSync(path.join(decisionsDir, fileName), 'utf-8').trim();
    if (!source) {
      continue;
    }
    if (!hasDurableDecision(source)) {
      continue;
    }
    const slug = path.basename(fileName, '.md');
    const content = [
      `# Decision: ${slug}`,
      '',
      `Decision URI: ${decisionUriForSlug(slug)}`,
      `Source: archive://${archiveId}`,
      '',
      source,
      '',
    ].join('\n');
    promoted = writePromotedArtifact(DECISIONS_DIR, 'decision.md', slug, updatedDate, content);
  }

  return promoted;
}

function generateArchiveSummary(archiveDir: string, trackId: string): string | null {
  const decisionsDir = path.join(archiveDir, 'decisions');
  if (!fs.existsSync(decisionsDir) || !fs.statSync(decisionsDir).isDirectory()) {
    const xnlPath = path.join(archiveDir, 'decisions.xnl');
    if (fs.existsSync(xnlPath)) {
      const records = readXnlDecisionRecords(xnlPath);
      if (records.length === 0) {
        return null;
      }
      const lines = [`# Archive Summary: ${trackId}`, '', ...records.map(record => `- ${record.id}`), ''];
      const summaryPath = path.join(archiveDir, 'summary.md');
      fs.writeFileSync(summaryPath, lines.join('\n'), 'utf-8');
      return summaryPath;
    }

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

function hasDurableDecision(source: string): boolean {
  return /\bdurable\b/i.test(source)
    || /长期(项目)?决策/.test(source)
    || /未来仍(然)?(需要|要|应当|必须)遵守/.test(source);
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
