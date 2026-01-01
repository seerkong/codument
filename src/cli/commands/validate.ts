import * as fs from 'fs';
import * as path from 'path';
import { getTracks, getSpecs, parseOptions, codumentExists, TRACKS_DIR, SPECS_DIR } from '../utils';

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
    const tracks = getTracks();
    const specs = getSpecs();

    for (const track of tracks) {
      results.push(validateTrack(track.id, strict));
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

  // Check metadata.json
  const metadataPath = path.join(trackDir, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    errors.push({ file: 'metadata.json', message: 'File not found' });
  } else {
    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      const requiredFields = ['track_id', 'type', 'status', 'created_at', 'updated_at', 'description'];
      for (const field of requiredFields) {
        if (!metadata[field]) {
          errors.push({ file: 'metadata.json', message: `Missing required field: ${field}` });
        }
      }
    } catch (e) {
      errors.push({ file: 'metadata.json', message: 'Invalid JSON format' });
    }
  }

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
    const badScenarios = lines.filter((line, i) => {
      return line.match(/^-\s+\*\*Scenario:/i) || line.match(/^\*\*Scenario\*\*:/i);
    });

    if (badScenarios.length > 0) {
      errors.push({ file: 'spec.md', message: 'Scenario format incorrect. Use "#### Scenario:" not list items or bold' });
    }
  }

  // Check tasks.xml
  const tasksPath = path.join(trackDir, 'tasks.xml');
  if (!fs.existsSync(tasksPath)) {
    errors.push({ file: 'tasks.xml', message: 'File not found' });
  } else {
    const content = fs.readFileSync(tasksPath, 'utf-8');

    // Basic XML validation
    if (!content.includes('<track>')) {
      errors.push({ file: 'tasks.xml', message: 'Missing <track> root element' });
    }
    if (!content.includes('<metadata>')) {
      errors.push({ file: 'tasks.xml', message: 'Missing <metadata> section' });
    }
    if (!content.includes('<phases>')) {
      errors.push({ file: 'tasks.xml', message: 'Missing <phases> section' });
    }

    // Check for valid status values
    const invalidStatuses = content.match(/<status>(?!TODO|IN_PROGRESS|DONE|BLOCKED|new|in_progress|completed|cancelled)[^<]+<\/status>/g);
    if (invalidStatuses) {
      errors.push({ file: 'tasks.xml', message: `Invalid status values found` });
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

function validateSpec(specId: string, strict: boolean): ValidationResult {
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
