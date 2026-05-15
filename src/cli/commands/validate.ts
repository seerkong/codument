import * as fs from 'fs';
import * as path from 'path';
import { getTrack, getTrackIds, getSpecs, parseOptions, codumentExists, TRACKS_DIR, SPECS_DIR } from '../utils';

interface ValidationError {
  file: string;
  line?: number;
  message: string;
}

interface ValidationResult {
  id: string;
  type: 'track' | 'spec';
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export async function validateCommand(args: string[]) {
  if (!codumentExists()) {
    console.error('Codument is not initialized. Run codument init first.');
    process.exit(1);
  }

  const { positional, options } = parseOptions(args);
  const itemId = positional[0];
  const itemType = options['type'] as string | undefined;
  const strict = options['strict'] === true;

  const results: ValidationResult[] = [];

  if (itemId) {
    // Validate specific item
    let foundType: 'track' | 'spec' | null = null;

    if (itemType === 'track' || itemType === 'spec') {
      foundType = itemType;
    } else {
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
      process.exit(1);
    }

    if (foundType === 'track') {
      results.push(validateTrack(itemId, strict));
    } else {
      results.push(validateSpec(itemId, strict));
    }
  } else {
    // Validate all
    const trackIds = getTrackIds();
    const specs = getSpecs();

    for (const trackId of trackIds) {
      results.push(validateTrack(trackId, strict));
    }

    for (const spec of specs) {
      results.push(validateSpec(spec.id, strict));
    }
  }

  // Output results
  let hasErrors = false;

  console.log('\nValidation Results:\n');

  for (const result of results) {
    const icon = result.valid ? '✓' : '✗';
    console.log(`${icon} ${result.type}/${result.id}`);

    for (const error of result.errors) {
      hasErrors = true;
      const loc = error.line ? `:${error.line}` : '';
      console.log(`    ✗ ${error.file}${loc}: ${error.message}`);
    }

    for (const warning of result.warnings) {
      const loc = warning.line ? `:${warning.line}` : '';
      console.log(`    ⚠ ${warning.file}${loc}: ${warning.message}`);
    }
  }

  const passed = results.filter(r => r.valid).length;
  const failed = results.filter(r => !r.valid).length;

  console.log(`\nTotal: ${passed} passed, ${failed} failed\n`);

  if (hasErrors) {
    process.exit(1);
  }
}

function validateTrack(trackId: string, strict: boolean): ValidationResult {
  const trackDir = path.join(TRACKS_DIR, trackId);
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Trigger legacy metadata.json -> plan.xml metadata migration when possible.
  getTrack(trackId);

  // Check spec.md
  const specPath = path.join(trackDir, 'spec.md');
  if (!fs.existsSync(specPath)) {
    errors.push({ file: 'spec.md', message: 'File not found' });
  } else {
    const content = fs.readFileSync(specPath, 'utf-8');
    const lines = content.split('\n');

    // Check for delta operations
    const hasAdded = content.includes('## ADDED Requirements');
    const hasModified = content.includes('## MODIFIED Requirements');
    const hasRemoved = content.includes('## REMOVED Requirements');
    const hasRenamed = content.includes('## RENAMED Requirements');

    if (!hasAdded && !hasModified && !hasRemoved && !hasRenamed) {
      errors.push({ file: 'spec.md', message: 'Must have at least one delta operation (ADDED/MODIFIED/REMOVED/RENAMED)' });
    }

    // Check requirements have scenarios
    const requirements = content.match(/^### Requirement: .+$/gm) || [];
    const scenarios = content.match(/^#### Scenario: .+$/gm) || [];

    if (requirements.length > 0 && scenarios.length === 0) {
      errors.push({ file: 'spec.md', message: 'Requirements must have at least one scenario' });
    }

    // Check scenario format
    const badScenarios = lines.filter((line) => {
      return line.match(/^-\s+\*\*Scenario:/i) || line.match(/^\*\*Scenario\*\*:/i);
    });

    if (badScenarios.length > 0) {
      errors.push({ file: 'spec.md', message: 'Scenario format incorrect. Use "#### Scenario:" not list items or bold' });
    }
  }

  // Check plan.xml
  const planPath = path.join(trackDir, 'plan.xml');
  if (!fs.existsSync(planPath)) {
    errors.push({ file: 'plan.xml', message: 'File not found' });
  } else {
    const content = fs.readFileSync(planPath, 'utf-8');

    // Basic XML validation
    if (!content.includes('<plan>')) {
      errors.push({ file: 'plan.xml', message: 'Missing <plan> root element' });
    }
    if (!content.includes('<metadata>')) {
      errors.push({ file: 'plan.xml', message: 'Missing <metadata> section' });
    }
    if (!content.includes('<phases>')) {
      errors.push({ file: 'plan.xml', message: 'Missing <phases> section' });
    }

    const metadataBlockMatch = content.match(/<metadata>([\s\S]*?)<\/metadata>/);
    if (metadataBlockMatch) {
      const metadataBlock = metadataBlockMatch[1];
      const requiredMetadataFields = ['track_id', 'type', 'status', 'created_at', 'updated_at', 'description'];
      for (const field of requiredMetadataFields) {
        const value = metadataBlock.match(new RegExp(`<${field}>([\\s\\S]*?)</${field}>`))?.[1]?.trim();
        if (!value) {
          errors.push({ file: 'plan.xml', message: `Missing metadata field: ${field}` });
        }
      }

      const metadataStatus = metadataBlock.match(/<status>([^<]+)<\/status>/)?.[1]?.trim();
      if (metadataStatus) {
        const validMetadataStatuses = new Set(['new', 'in_progress', 'completed', 'cancelled']);
        if (!validMetadataStatuses.has(metadataStatus)) {
          errors.push({
            file: 'plan.xml',
            message: `Invalid metadata status value: ${metadataStatus}`,
          });
        }
      }

      const metadataType = metadataBlock.match(/<type>([^<]+)<\/type>/)?.[1]?.trim();
      if (metadataType) {
        const validMetadataTypes = new Set(['feature', 'bug', 'chore', 'refactor']);
        if (!validMetadataTypes.has(metadataType)) {
          errors.push({
            file: 'plan.xml',
            message: `Invalid metadata type value: ${metadataType}`,
          });
        }
      }
    }

    const taskStatusMatches = [...content.matchAll(/<(?:task|subtask)[^>]*\sstatus="([^"]+)"[^>]*>/g)];
    const validTaskStatuses = new Set(['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'CANCELLED']);
    const invalidTaskStatuses = taskStatusMatches
      .map((m) => m[1])
      .filter((status) => !validTaskStatuses.has(status));
    if (invalidTaskStatuses.length > 0) {
      errors.push({
        file: 'plan.xml',
        message: `Invalid task status values found: ${[...new Set(invalidTaskStatuses)].join(', ')}`,
      });
    }

    // Validate detail_ref targets
    const detailRefMatches = content.matchAll(/<detail_ref>([^<]+)<\/detail_ref>/g);
    for (const match of detailRefMatches) {
      const detailRefPath = match[1].trim();
      const absolutePath = path.join(trackDir, detailRefPath);
      if (!fs.existsSync(absolutePath)) {
        errors.push({
          file: 'plan.xml',
          message: `detail_ref file not found: ${detailRefPath}`,
        });
      }
    }

    // Wave mode validation
    const modeMatch = content.match(/<execution_mode>([^<]+)<\/execution_mode>/);
    let executionMode: 'wave' | 'sequential' = 'sequential';
    if (modeMatch) {
      const rawMode = modeMatch[1].trim();
      if (rawMode === 'wave' || rawMode === 'sequential') {
        executionMode = rawMode;
      } else {
        errors.push({
          file: 'plan.xml',
          message: `Invalid execution_mode value: ${rawMode}`,
        });
      }
    }

    if (executionMode === 'wave') {
      const phaseRegex = /<phase\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/phase>/g;
      let phaseMatch;

      while ((phaseMatch = phaseRegex.exec(content)) !== null) {
        const phaseId = phaseMatch[1];
        const phaseContent = phaseMatch[2];

        const wavesMatch = phaseContent.match(/<waves>([\s\S]*?)<\/waves>/);
        if (!wavesMatch) {
          errors.push({
            file: 'plan.xml',
            message: `Phase ${phaseId} is missing <waves> declaration in wave mode`,
          });
          continue;
        }

        const waveNodes = [...wavesMatch[1].matchAll(/<wave\s+id="([^"]+)"(?:\s+depends_on="([^"]*)")?[^>]*\/>/g)];
        const waveIds = waveNodes.map((m) => m[1]);

        if (waveIds.length === 0) {
          errors.push({
            file: 'plan.xml',
            message: `Phase ${phaseId} has empty <waves> declaration in wave mode`,
          });
          continue;
        }

        for (const waveId of waveIds) {
          const waveIdPattern = new RegExp(`^WAVE-${phaseId}-\\d{2}$`);
          if (!waveIdPattern.test(waveId)) {
            errors.push({
              file: 'plan.xml',
              message: `Phase ${phaseId} has invalid wave id format: ${waveId}`,
            });
          }
        }

        const duplicateWaves = waveIds.filter((id, idx) => waveIds.indexOf(id) !== idx);
        if (duplicateWaves.length > 0) {
          errors.push({
            file: 'plan.xml',
            message: `Phase ${phaseId} contains duplicate wave ids: ${[...new Set(duplicateWaves)].join(', ')}`,
          });
        }

        const adjacency = new Map<string, string[]>();
        const indegree = new Map<string, number>();
        for (const waveId of waveIds) {
          adjacency.set(waveId, []);
          indegree.set(waveId, 0);
        }

        for (const node of waveNodes) {
          const currentWaveId = node[1];
          const dependsRaw = node[2] || '';
          const dependsOn = dependsRaw.split(',').map(d => d.trim()).filter(Boolean);

          for (const dep of dependsOn) {
            if (!waveIds.includes(dep)) {
              errors.push({
                file: 'plan.xml',
                message: `Phase ${phaseId} wave ${currentWaveId} depends_on unknown wave: ${dep}`,
              });
              continue;
            }

            adjacency.get(dep)!.push(currentWaveId);
            indegree.set(currentWaveId, (indegree.get(currentWaveId) || 0) + 1);
          }
        }

        const queue: string[] = [];
        for (const [waveId, degree] of indegree.entries()) {
          if (degree === 0) {
            queue.push(waveId);
          }
        }

        let visited = 0;
        while (queue.length > 0) {
          const current = queue.shift()!;
          visited++;

          for (const next of adjacency.get(current) || []) {
            const nextDegree = (indegree.get(next) || 0) - 1;
            indegree.set(next, nextDegree);
            if (nextDegree === 0) {
              queue.push(next);
            }
          }
        }

        if (visited !== waveIds.length) {
          errors.push({
            file: 'plan.xml',
            message: `Phase ${phaseId} waves contain a cycle (not a valid DAG)`,
          });
        }

        const taskMatches = phaseContent.matchAll(/<task\s+([^>]+)>/g);
        for (const taskMatch of taskMatches) {
          const attrs = taskMatch[1];
          const taskId = attrs.match(/id="([^"]+)"/)?.[1] || '(unknown task)';
          const taskWave = attrs.match(/wave="([^"]+)"/)?.[1];

          if (!taskWave) {
            errors.push({
              file: 'plan.xml',
              message: `Task ${taskId} in phase ${phaseId} is missing wave attribute in wave mode`,
            });
            continue;
          }

          if (!waveIds.includes(taskWave)) {
            errors.push({
              file: 'plan.xml',
              message: `Task ${taskId} in phase ${phaseId} references unknown wave: ${taskWave}`,
            });
          }
        }
      }
    }
  }

  // Strict mode checks
  if (strict) {
    const proposalPath = path.join(trackDir, 'proposal.md');
    if (!fs.existsSync(proposalPath)) {
      warnings.push({ file: 'proposal.md', message: 'File not found (recommended for new tracks)' });
    }
  }

  return {
    id: trackId,
    type: 'track',
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateSpec(specId: string, _strict: boolean): ValidationResult {
  const specDir = path.join(SPECS_DIR, specId);
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const specPath = path.join(specDir, 'spec.md');
  if (!fs.existsSync(specPath)) {
    errors.push({ file: 'spec.md', message: 'File not found' });
  } else {
    const content = fs.readFileSync(specPath, 'utf-8');

    // Check for requirements
    const requirements = content.match(/^### Requirement: .+$/gm) || [];
    if (requirements.length === 0) {
      errors.push({ file: 'spec.md', message: 'Must have at least one requirement' });
    }

    // Check each requirement has scenarios
    const scenarios = content.match(/^#### Scenario: .+$/gm) || [];
    if (requirements.length > 0 && scenarios.length === 0) {
      errors.push({ file: 'spec.md', message: 'Requirements must have at least one scenario' });
    }

    // Check scenario format
    const lines = content.split('\n');
    const badScenarios = lines.filter(line => {
      return line.match(/^-\s+\*\*Scenario:/i) || line.match(/^\*\*Scenario\*\*:/i);
    });

    if (badScenarios.length > 0) {
      errors.push({ file: 'spec.md', message: 'Scenario format incorrect. Use "#### Scenario:" not list items or bold' });
    }
  }

  return {
    id: specId,
    type: 'spec',
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
