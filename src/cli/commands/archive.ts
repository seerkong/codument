import * as fs from 'fs';
import * as path from 'path';
import {
  ARCHIVE_DIR,
  BEHAVIORS_DIR,
  DECISIONS_DIR,
  MEMORY_DIR,
  SPECS_DIR,
  TRACKS_DIR,
  codumentExists,
  getTrack,
  parseOptions,
} from '../utils';
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

  // Apply behavior/spec registry updates BEFORE moving the track. The registry
  // write is all-or-nothing (applySpecXmlPatchToRegistry stages every mutation in
  // memory and only flushes on success), so a delta failure now leaves the track
  // in place and re-runnable instead of stranding a half-archived, inconsistent state.
  let updatedRegistries: string[] | null = null;
  if (!skipSpecs) {
    updatedRegistries = applyArchivedSpecDeltas(trackDir);
  }

  // Move track to archive
  fs.renameSync(trackDir, archiveDir);
  console.log('✓ Track moved to archive');
  console.log(`✓ Archive ID: ${archiveId}`);

  if (updatedRegistries === null) {
    console.log('  Skipped behavior/spec updates (--skip-specs)');
  } else if (updatedRegistries.length > 0) {
    console.log(`✓ Updated behavior/spec registry: ${updatedRegistries.join(', ')}`);
  } else {
    console.log('  No behavior/spec updates needed');
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

function applyArchivedSpecDeltas(archiveDir: string): string[] {
  const behaviorPatches = collectXmlPatches(archiveDir, ['behavior_deltas', 'behavior-deltas']);
  if (behaviorPatches.length > 0) {
    const updated = new Set<string>();
    for (const patchPath of behaviorPatches) {
      for (const capability of applySpecXmlPatchToRegistry(fs.readFileSync(patchPath, 'utf-8'), BEHAVIORS_DIR)) {
        updated.add(capability);
      }
    }
    return [...updated];
  }

  const legacyXmlPatches = collectXmlPatches(archiveDir, ['spec_deltas', 'spec-deltas']);
  if (legacyXmlPatches.length > 0) {
    const updated = new Set<string>();
    for (const patchPath of legacyXmlPatches) {
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

function promoteDecisionRecord(archiveDir: string, archiveId: string, trackId: string, updatedDate: Date): string | null {
  const decisionsDir = path.join(archiveDir, 'decisions');
  if (!fs.existsSync(decisionsDir) || !fs.statSync(decisionsDir).isDirectory()) {
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
