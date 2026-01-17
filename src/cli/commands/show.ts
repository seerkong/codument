import * as fs from 'fs';
import * as path from 'path';
import { getTrack, getSpecs, parseOptions, formatStatus, codumentExists, TRACKS_DIR, SPECS_DIR } from '../utils';

export async function showCommand(args: string[]) {
  if (!codumentExists()) {
    console.error('Codument is not initialized. Run codument init first.');
    process.exit(1);
  }

  const { positional, options } = parseOptions(args);
  const itemId = positional[0];
  const itemType = options['type'] as string | undefined;
  const jsonOutput = options['json'] === true;

  if (!itemId) {
    console.error('Please specify a track or spec ID.');
    console.log('Usage: codument show <id> [--type track|spec] [--json]');
    process.exit(1);
  }

  // Try to determine type
  let foundType: 'track' | 'spec' | null = null;

  if (itemType === 'track' || itemType === 'spec') {
    foundType = itemType;
  } else {
    // Auto-detect
    const trackDir = path.join(TRACKS_DIR, itemId);
    const specDir = path.join(SPECS_DIR, itemId);

    if (fs.existsSync(trackDir)) {
      foundType = 'track';
    } else if (fs.existsSync(specDir)) {
      foundType = 'spec';
    }
  }

  if (!foundType) {
    console.error(`Item not found: ${itemId}`);
    console.log('Use --type to specify whether this is a track or spec.');
    process.exit(1);
  }

  if (foundType === 'track') {
    showTrack(itemId, jsonOutput);
  } else {
    showSpec(itemId, jsonOutput);
  }
}

function showTrack(trackId: string, jsonOutput: boolean) {
  const track = getTrack(trackId);

  if (!track) {
    console.error(`Track not found: ${trackId}`);
    process.exit(1);
  }

  if (jsonOutput) {
    // Include file contents in JSON output
    const trackDir = path.join(TRACKS_DIR, trackId);
    const result: Record<string, unknown> = {
      ...track,
      files: {},
    };

    const files = ['proposal.md', 'spec.md', 'plan.xml', 'design.md'];
    for (const file of files) {
      const filePath = path.join(trackDir, file);
      if (fs.existsSync(filePath)) {
        (result.files as Record<string, string>)[file] = fs.readFileSync(filePath, 'utf-8');
      }
    }

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const trackDir = path.join(TRACKS_DIR, trackId);

  console.log('\n' + '='.repeat(60));
  console.log(`Track: ${trackId}`);
  console.log('='.repeat(60));

  console.log(`\nStatus:      ${formatStatus(track.metadata.status)} ${track.metadata.status}`);
  console.log(`Type:        ${track.metadata.type}`);
  console.log(`Description: ${track.metadata.description}`);
  console.log(`Created:     ${track.metadata.created_at}`);
  console.log(`Updated:     ${track.metadata.updated_at}`);

  if (track.taskSummary) {
    const s = track.taskSummary;
    const pct = s.total_tasks > 0 ? Math.round((s.completed / s.total_tasks) * 100) : 0;
    console.log(`\nProgress:    ${s.completed}/${s.total_tasks} (${pct}%)`);
    console.log(`  Phases:    ${s.total_phases}`);
    console.log(`  Completed: ${s.completed}`);
    console.log(`  In Progress: ${s.in_progress}`);
    console.log(`  Todo:      ${s.todo}`);
    console.log(`  Blocked:   ${s.blocked}`);
  }

  console.log('\nFiles:');
  const files = ['proposal.md', 'spec.md', 'plan.xml', 'design.md', 'metadata.json'];
  for (const file of files) {
    const filePath = path.join(trackDir, file);
    const exists = fs.existsSync(filePath);
    const status = exists ? '✓' : '✗';
    console.log(`  ${status} ${file}`);
  }

  console.log('');
}

function showSpec(specId: string, jsonOutput: boolean) {
  const specDir = path.join(SPECS_DIR, specId);
  const specPath = path.join(specDir, 'spec.md');

  if (!fs.existsSync(specPath)) {
    console.error(`Spec not found: ${specId}`);
    process.exit(1);
  }

  const content = fs.readFileSync(specPath, 'utf-8');
  const requirements = content.match(/^### Requirement: (.+)$/gm) || [];
  const scenarios = content.match(/^#### Scenario: (.+)$/gm) || [];

  if (jsonOutput) {
    console.log(JSON.stringify({
      id: specId,
      path: specPath,
      requirements: requirements.map(r => r.replace('### Requirement: ', '')),
      scenarios: scenarios.map(s => s.replace('#### Scenario: ', '')),
      content,
    }, null, 2));
    return;
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Spec: ${specId}`);
  console.log('='.repeat(60));

  console.log(`\nRequirements: ${requirements.length}`);
  for (const req of requirements) {
    console.log(`  - ${req.replace('### Requirement: ', '')}`);
  }

  console.log(`\nScenarios: ${scenarios.length}`);

  console.log('\nFiles:');
  const files = ['spec.md', 'design.md'];
  for (const file of files) {
    const filePath = path.join(specDir, file);
    const exists = fs.existsSync(filePath);
    const status = exists ? '✓' : '✗';
    console.log(`  ${status} ${file}`);
  }

  console.log('');
}
