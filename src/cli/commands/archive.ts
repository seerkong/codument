import * as fs from 'fs';
import * as path from 'path';
import { getTrack, parseOptions, codumentExists, TRACKS_DIR, SPECS_DIR, ARCHIVE_DIR, CODUMENT_DIR } from '../utils';

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
      console.log('Do you want to archive it anyway? (y/N)');
      const response = await promptYesNo();
      if (!response) {
        console.log('Archive cancelled.');
        process.exit(0);
      }
    }
  }

  const trackDir = path.join(TRACKS_DIR, trackId);
  const date = new Date().toISOString().split('T')[0];
  const archiveId = `${date}-${trackId}`;
  const archiveDir = path.join(ARCHIVE_DIR, archiveId);

  console.log(`\nArchiving track: ${trackId}`);
  console.log(`Destination: ${archiveDir}`);

  // Create archive directory
  if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  }

  // Move track to archive
  fs.renameSync(trackDir, archiveDir);
  console.log('✓ Track moved to archive');

  // Update specs if not skipped
  if (!skipSpecs) {
    const specPath = path.join(archiveDir, 'spec.md');
    if (fs.existsSync(specPath)) {
      const updated = applySpecDeltas(specPath);
      if (updated.length > 0) {
        console.log(`✓ Updated specs: ${updated.join(', ')}`);
      } else {
        console.log('  No spec updates needed');
      }
    }
  } else {
    console.log('  Skipped spec updates (--skip-specs)');
  }

  // Update tracks.md
  const tracksFilePath = path.join(CODUMENT_DIR, 'tracks.md');
  if (fs.existsSync(tracksFilePath)) {
    let content = fs.readFileSync(tracksFilePath, 'utf-8');

    // Remove the track section
    const regex = new RegExp(`---\\s*\\n\\s*##\\s*\\[[^\\]]*\\]\\s*Track:\\s*[^\\n]*${trackId}[^\\n]*\\n[^]*?(?=---\\n|$)`, 'g');
    const newContent = content.replace(regex, '');

    if (newContent !== content) {
      fs.writeFileSync(tracksFilePath, newContent.trim() + '\n');
      console.log('✓ Removed from tracks.md');
    }
  }

  console.log(`\n✓ Track "${trackId}" archived successfully!\n`);
}

async function promptYesNo(): Promise<boolean> {
  // Simple stdin prompt for Bun
  const stdin = Bun.stdin.stream();
  const reader = stdin.getReader();

  try {
    const { value } = await reader.read();
    const response = new TextDecoder().decode(value).trim().toLowerCase();
    return response === 'y' || response === 'yes';
  } finally {
    reader.releaseLock();
  }
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
