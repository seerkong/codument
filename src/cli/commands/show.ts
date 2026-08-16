import * as fs from 'fs';
import * as path from 'path';
import { wordToString } from 'xnl-core';
import {
  DECISIONS_DIR,
  getActiveTrackDir,
  getTrack,
  parseOptions,
  formatStatus,
  codumentExists,
  BEHAVIORS_DIR,
  SPECS_DIR,
} from '../utils';
import {
  decisionIdFromReference,
  loadDecisionRegistrySafe,
  resolveDecisionRegistryReference,
} from '../decisions/registry';
import { getSpecXmlStats, loadSpecXml } from '../utils/spec-xml';
import { parseBehaviorXnlContent } from '../behavior/resource';

export async function showCommand(args: string[]) {
  if (!codumentExists()) {
    console.error('Codument is not initialized. Run codument init first.');
    process.exit(1);
  }

  const { positional, options } = parseOptions(args);
  const itemId = positional[0];
  const itemType = options['type'] as string | undefined;
  const jsonOutput = options['json'] === true;
  const includeContent = options['include-content'] === true;

  if (!itemId) {
    console.error('Please specify a track, spec, or decision ID.');
    console.log('Usage: codument show <id|decision://id> [--type track|spec|decision] [--json] [--include-content]');
    process.exit(1);
  }

  // Try to determine type
  let foundType: 'track' | 'spec' | 'decision' | null = null;

  if (itemType === 'track' || itemType === 'spec' || itemType === 'decision') {
    foundType = itemType;
  } else {
    // Auto-detect
    const trackDir = getActiveTrackDir(itemId);
    const roots = [BEHAVIORS_DIR, SPECS_DIR];
    const hasSpec = roots.some((root) => fs.existsSync(path.join(root, itemId))
      || fs.existsSync(path.join(root, `${itemId}.xml`))
      || fs.existsSync(path.join(root, `${itemId}.xnl`)));

    if (fs.existsSync(trackDir)) {
      foundType = 'track';
    } else if (hasSpec) {
      foundType = 'spec';
    } else {
      const decisionId = decisionIdFromReference(itemId);
      const loaded = loadDecisionRegistrySafe(DECISIONS_DIR);
      if (loaded.issues.length > 0) {
        throw new Error(loaded.issues.map((issue) => issue.message).join('\n'));
      }
      if (loaded.registry.index.has(decisionId)) {
        foundType = 'decision';
      }
    }
  }

  if (!foundType) {
    console.error(`Item not found: ${itemId}`);
    console.log('Use --type to specify whether this is a track, spec, or decision.');
    process.exit(1);
  }

  if (foundType === 'track') {
    showTrack(itemId, jsonOutput, includeContent);
  } else if (foundType === 'spec') {
    showSpec(itemId, jsonOutput);
  } else {
    showDecision(itemId, jsonOutput);
  }
}

function showTrack(trackId: string, jsonOutput: boolean, includeContent: boolean) {
  const track = getTrack(trackId);

  if (!track) {
    console.error(`Track not found: ${trackId}`);
    process.exit(1);
  }

  if (jsonOutput) {
    const trackDir = getActiveTrackDir(trackId);
    const specDeltaFiles = collectTrackBehaviorDeltas(trackDir);
    const standardFiles = ['proposal.md', 'track.xnl', 'track.xml', 'design.md', 'decisions.xnl', 'decisions.md']
      .filter((file) => fs.existsSync(path.join(trackDir, file)));
    const relativeFiles = [...standardFiles, ...specDeltaFiles.map((filePath) => portableRelative(trackDir, filePath))];
    const result: Record<string, unknown> = {
      ...track,
      files: relativeFiles,
    };

    if (includeContent) {
      const contents: Record<string, string> = {};
      for (const file of relativeFiles) {
        contents[file] = fs.readFileSync(path.join(trackDir, file), 'utf-8');
      }
      result.contents = contents;
    }

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const trackDir = getActiveTrackDir(trackId);
  const specDeltaFiles = collectTrackBehaviorDeltas(trackDir);

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
  const files = ['proposal.md', 'track.xnl', 'track.xml', 'design.md', 'decisions.xnl', 'decisions.md'];
  for (const file of files) {
    const filePath = path.join(trackDir, file);
    const exists = fs.existsSync(filePath);
    const status = exists ? '✓' : '✗';
    console.log(`  ${status} ${file}`);
  }
  if (specDeltaFiles.length > 0) {
    for (const filePath of specDeltaFiles) {
      console.log(`  ✓ ${portableRelative(trackDir, filePath)}`);
    }
  } else {
    console.log(`  ✗ behavior_deltas/**/*.xnl`);
  }

  console.log('');
}

function portableRelative(base: string, file: string): string {
  return path.relative(base, file).split(path.sep).join('/');
}

function collectTrackBehaviorDeltas(trackDir: string): string[] {
  const results: string[] = [];
  const roots = [
    path.join(trackDir, 'behavior_deltas'),
    path.join(trackDir, 'spec_deltas'),
    path.join(trackDir, 'spec-deltas'),
  ];

  const visit = (dir: string) => {
    if (!fs.existsSync(dir)) {
      return;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile() && /\.(xnl|xml)$/i.test(entry.name)) {
        results.push(entryPath);
      }
    }
  };

  for (const root of roots) {
    visit(root);
  }
  return results.sort();
}

function showSpec(specId: string, jsonOutput: boolean) {
  const registryRoot = [BEHAVIORS_DIR, SPECS_DIR].find((candidate) =>
    fs.existsSync(path.join(candidate, specId))
    || fs.existsSync(path.join(candidate, `${specId}.xnl`))
    || fs.existsSync(path.join(candidate, `${specId}.xml`))) ?? BEHAVIORS_DIR;
  const specDir = path.join(registryRoot, specId);
  const specPath = path.join(specDir, 'spec.md');
  const specXnlFilePath = path.join(registryRoot, `${specId}.xnl`);
  const specXmlFilePath = path.join(registryRoot, `${specId}.xml`);
  const specXmlIndexPath = path.join(specDir, 'index.xml');

  const isXnl = fs.existsSync(specXnlFilePath);
  const isXml = fs.existsSync(specXmlFilePath) || fs.existsSync(specXmlIndexPath);
  if (!fs.existsSync(specPath) && !isXnl && !isXml) {
    console.error(`Spec not found: ${specId}`);
    process.exit(1);
  }

  if (isXnl || isXml) {
    const xnlContent = isXnl ? fs.readFileSync(specXnlFilePath, 'utf-8') : undefined;
    const xmlEntryPath = fs.existsSync(specXmlFilePath) ? specXmlFilePath : specDir;
    const displayPath = isXnl ? specXnlFilePath : fs.existsSync(specXmlFilePath) ? specXmlFilePath : specXmlIndexPath;
    const content = xnlContent ?? fs.readFileSync(displayPath, 'utf-8');
    const root = isXnl ? parseBehaviorXnlContent(content) : loadSpecXml(xmlEntryPath);
    const stats = getSpecXmlStats(root);

    if (jsonOutput) {
      console.log(JSON.stringify({
        id: specId,
        path: displayPath,
        format: isXnl ? 'xnl' : 'xml',
        requirements: stats.requirements,
        scenarios: stats.scenarios,
        content,
      }, null, 2));
      return;
    }

    console.log('\n' + '='.repeat(60));
    console.log(`Spec: ${specId}`);
    console.log('='.repeat(60));
    console.log(`\nFormat: ${isXnl ? 'XNL' : 'XML'}`);
    console.log(`Requirements: ${stats.requirements}`);
    console.log(`Scenarios: ${stats.scenarios}`);
    console.log('\nFiles:');
    console.log(`  ✓ ${path.relative(registryRoot, displayPath) || path.basename(displayPath)}`);
    console.log('');
    return;
  }

  const content = fs.readFileSync(specPath, 'utf-8');
  const requirements = content.match(/^### Requirement: (.+)$/gm) || [];
  const scenarios = content.match(/^#### Scenario: (.+)$/gm) || [];

  if (jsonOutput) {
    console.log(JSON.stringify({
      id: specId,
      path: specPath,
      format: 'markdown',
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

function displayValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const word = wordToString(value as Parameters<typeof wordToString>[0]);
    if (word !== undefined) return word;
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return JSON.stringify(value);
  return undefined;
}

function decisionField(
  node: ReturnType<typeof resolveDecisionRegistryReference>['node'],
  key: string,
): string | undefined {
  return displayValue(node.attributes?.[key] ?? node.metadata?.[key]);
}

function showDecision(reference: string, jsonOutput: boolean): void {
  const resolved = resolveDecisionRegistryReference(DECISIONS_DIR, reference);
  const status = decisionField(resolved.node, 'status');
  const source = decisionField(resolved.node, 'source');
  const provenance = decisionField(resolved.node, 'provenance');
  const ancestors = resolved.ancestors.map(({ tag, id }) => ({ tag, id }));

  if (jsonOutput) {
    console.log(JSON.stringify({
      id: resolved.id,
      uri: resolved.uri ?? `decision://${resolved.id}`,
      owner_file: resolved.file,
      owner: resolved.owner,
      status,
      source,
      provenance,
      ancestors,
      parent: resolved.parent,
      path: resolved.path,
      node: resolved.node,
    }, null, 2));
    return;
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Decision: ${resolved.id}`);
  console.log('='.repeat(60));
  console.log(`\nURI:         ${resolved.uri ?? `decision://${resolved.id}`}`);
  console.log(`Owner:       ${resolved.file}`);
  if (status) console.log(`Status:      ${status}`);
  if (source) console.log(`Source:      ${source}`);
  if (provenance) console.log(`Provenance:  ${provenance}`);
  if (ancestors.length > 0) {
    console.log('Hierarchy:');
    for (const ancestor of ancestors) {
      console.log(`  - ${ancestor.tag}${ancestor.id ? ` #${ancestor.id}` : ''}`);
    }
  }
  console.log('');
}
