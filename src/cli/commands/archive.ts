import * as fs from 'fs';
import * as path from 'path';
import {
  ARCHIVE_DIR,
  DECISIONS_DIR,
  MEMORY_DIR,
  SPECS_DIR,
  TRACKS_DIR,
  codumentExists,
  getTrack,
  parseOptions,
} from '../utils';
import { loadFeatureConfig } from '../utils/feature-config';
import { applySpecXmlPatchToRegistry } from '../utils/spec-xml';
import { buildArchiveDestination, formatLocalMinutePrefix, resolveTrackUpdatedDate } from '../utils/track-time';

export async function archiveCommand(args: string[]) {
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

  const trackDir = path.join(TRACKS_DIR, trackId);
  const updatedDate = resolveTrackUpdatedDate(trackDir);
  const archiveDir = buildArchiveDestination(trackDir, trackId, ARCHIVE_DIR);
  const archiveId = path.basename(archiveDir);

  console.log(`\nArchiving track: ${trackId}`);
  console.log(`Destination: ${archiveDir}`);

  // Create archive directory
  const archiveParentDir = path.dirname(archiveDir);
  if (!fs.existsSync(archiveParentDir)) {
    fs.mkdirSync(archiveParentDir, { recursive: true });
  }
  if (fs.existsSync(archiveDir)) {
    console.error(`Archive destination already exists: ${archiveDir}`);
    process.exit(1);
  }

  // Move track to archive
  fs.renameSync(trackDir, archiveDir);
  console.log('✓ Track moved to archive');
  console.log(`✓ Archive ID: ${archiveId}`);

  // Update specs if not skipped
  if (!skipSpecs) {
    const updated = applyArchivedSpecDeltas(archiveDir);
    if (updated.length > 0) {
      console.log(`✓ Updated specs: ${updated.join(', ')}`);
    } else {
      console.log('  No spec updates needed');
    }
  } else {
    console.log('  Skipped spec updates (--skip-specs)');
  }

  const promotedDecision = promoteDecisionRecord(archiveDir, archiveId, trackId, updatedDate);
  if (promotedDecision) {
    console.log(`✓ Promoted decision record: ${promotedDecision}`);
  }

  const featureConfig = loadFeatureConfig();
  if (featureConfig.projectMemory.enabled) {
    const promotedMemory = promoteMemoryRecords(archiveDir, archiveId, trackId, updatedDate);
    if (promotedMemory.length > 0) {
      console.log(`✓ Promoted memory records: ${promotedMemory.join(', ')}`);
    }
  }

  if (featureConfig.knowledgeSync.enabled) {
    const targetNames = featureConfig.knowledgeSync.targets.map((target) => target.name).join(', ') || '(no targets configured)';
    console.log(`  Knowledge sync enabled; configured targets: ${targetNames}`);
  }

  console.log(`\n✓ Track "${trackId}" archived successfully!\n`);
}

function applyArchivedSpecDeltas(archiveDir: string): string[] {
  const xmlPatches = collectXmlSpecPatches(archiveDir);
  if (xmlPatches.length > 0) {
    const updated = new Set<string>();
    for (const patchPath of xmlPatches) {
      for (const capability of applySpecXmlPatchToRegistry(fs.readFileSync(patchPath, 'utf-8'), SPECS_DIR)) {
        updated.add(capability);
      }
    }
    return [...updated];
  }

  const xmlPatchCandidates = ['spec.xml', 'spec.patch.xml', 'patch.xml'];
  for (const candidate of xmlPatchCandidates) {
    const patchPath = path.join(archiveDir, candidate);
    if (fs.existsSync(patchPath)) {
      const updated = applySpecXmlPatchToRegistry(fs.readFileSync(patchPath, 'utf-8'), SPECS_DIR);
      if (updated.length > 0) {
        return updated;
      }
    }
  }

  const specPath = path.join(archiveDir, 'spec.md');
  if (fs.existsSync(specPath)) {
    return applySpecDeltas(specPath);
  }

  return [];
}

function collectXmlSpecPatches(archiveDir: string): string[] {
  const results: string[] = [];
  const roots = [
    path.join(archiveDir, 'spec_deltas'),
    path.join(archiveDir, 'spec-deltas'),
  ];

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

function promoteDecisionRecord(archiveDir: string, archiveId: string, trackId: string, updatedDate: Date): string | null {
  const decisionsPath = path.join(archiveDir, 'decisions.md');
  if (!fs.existsSync(decisionsPath)) {
    return null;
  }

  const source = fs.readFileSync(decisionsPath, 'utf-8').trim();
  if (!source || source === '# Decisions') {
    return null;
  }

  if (!hasDurableDecision(source)) {
    return null;
  }

  const content = [
    `# Decision: ${trackId}`,
    '',
    `Decision URI: decision://${trackId}`,
    `Source: archive://${archiveId}`,
    '',
    source,
    '',
  ].join('\n');

  return writePromotedArtifact(DECISIONS_DIR, 'decision.md', trackId, updatedDate, content);
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
