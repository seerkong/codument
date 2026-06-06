import * as fs from 'fs';
import * as path from 'path';
import { getTrack, getTrackIds, getSpecs, parseOptions, codumentExists, TRACKS_DIR, SPECS_DIR } from '../utils';
import { artifactsConfigPath, attractorProfilesPath, operationHooksPath, resolveAttractorProfile } from '../utils/feature-config';
import type { SpecXmlNode } from '../utils/spec-xml';
import { getSpecPatchCapabilities, getSpecXmlStats, loadSpecXml, parseSpecXmlContent } from '../utils/spec-xml';

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
      const specXmlFile = path.join(SPECS_DIR, `${itemId}.xml`);

      if (fs.existsSync(trackDir)) {
        foundType = 'track';
      } else if (fs.existsSync(specDir) || fs.existsSync(specXmlFile)) {
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

  const xmlDeltaFiles = collectTrackXmlSpecDeltas(trackDir);
  for (const deltaPath of xmlDeltaFiles) {
    try {
      const content = fs.readFileSync(deltaPath, 'utf-8');
      const patchRoot = parseSpecXmlContent(content);
      if (patchRoot.tag !== 'spec-patch') {
        errors.push({ file: path.relative(trackDir, deltaPath), message: 'XML spec delta root must be <spec-patch>' });
      } else if (getSpecPatchCapabilities(content).length === 0) {
        errors.push({ file: path.relative(trackDir, deltaPath), message: 'XML spec delta must contain at least one mutation with a spec:// selector' });
      }
    } catch (error) {
      errors.push({
        file: path.relative(trackDir, deltaPath),
        message: error instanceof Error ? error.message : 'Invalid XML spec delta',
      });
    }
  }

  // Legacy Markdown spec delta is still accepted for old tracks.
  const specPath = path.join(trackDir, 'spec.md');
  if (!fs.existsSync(specPath) && xmlDeltaFiles.length === 0) {
    errors.push({ file: 'spec_deltas/*.xml|spec.md', message: 'No XML spec delta found (legacy spec.md also missing)' });
  } else {
    if (xmlDeltaFiles.length > 0 && fs.existsSync(specPath)) {
      warnings.push({ file: 'spec.md', message: 'Legacy Markdown spec.md is ignored when XML spec deltas exist' });
    }
  }

  if (fs.existsSync(specPath) && xmlDeltaFiles.length === 0) {
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

    validateAttractorCheckNodes(
      parseXmlForValidation(content, 'plan.xml', errors),
      'plan.xml',
      errors,
      path.resolve('.'),
      'codument',
    );

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

  const artifactIds = validateArtifactsConfig(errors, path.resolve('.'), 'codument');
  validateOperationHooks(errors, path.resolve('.'), 'codument', artifactIds);

  return {
    id: trackId,
    type: 'track',
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function parseXmlForValidation(content: string, file: string, errors: ValidationError[]): SpecXmlNode | null {
  try {
    return parseSpecXmlContent(content);
  } catch (error) {
    errors.push({
      file,
      message: error instanceof Error ? error.message : 'Invalid XML',
    });
    return null;
  }
}

function visitXml(node: SpecXmlNode, visitor: (node: SpecXmlNode, parent?: SpecXmlNode) => void, parent?: SpecXmlNode): void {
  visitor(node, parent);
  for (const child of node.children) {
    visitXml(child, visitor, node);
  }
}

function validateAttractorCheckNodes(
  root: SpecXmlNode | null,
  file: string,
  errors: ValidationError[],
  workspaceDir: string,
  codumentDir: string,
): void {
  if (!root) {
    return;
  }

  const validWhen = new Set(['before', 'after', 'both']);
  const validStatus = new Set(['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'CANCELLED']);
  const validExecutor = new Set(['main-agent', 'subagent', 'fresh-subagent']);
  const validOnGap = new Set(['fix-immediately', 'confirm-before-fix', 'block']);
  const validConfirmProtocol = new Set(['yield-human-confirm', 'yield-gap-loop']);

  visitXml(root, (node, parent) => {
    if (node.tag === 'attractor-check') {
      const profile = node.attrs.profile || 'default';
      const when = node.attrs.when;
      const status = node.attrs.status;
      const executor = node.attrs.executor || 'subagent';

      if (!when || !validWhen.has(when)) {
        errors.push({ file, message: `Invalid attractor-check when value: ${when || '(missing)'}` });
      }
      if (!status || !validStatus.has(status)) {
        errors.push({ file, message: `Invalid attractor-check status value: ${status || '(missing)'}` });
      }
      if (!validExecutor.has(executor)) {
        errors.push({ file, message: `Invalid attractor-check executor value: ${executor}` });
      }

      let resolved: ReturnType<typeof resolveAttractorProfile>;
      try {
        resolved = resolveAttractorProfile(profile, codumentDir, workspaceDir);
      } catch (error) {
        errors.push({
          file: path.relative('.', attractorProfilesPath(codumentDir)),
          message: `Invalid attractor profile configuration: ${error instanceof Error ? error.message : 'Unable to parse config'}`,
        });
        return;
      }
      if (!resolved) {
        errors.push({ file, message: `Unknown attractor profile referenced by attractor-check: ${profile}` });
      } else if (resolved.missingFiles.length > 0) {
        errors.push({ file, message: `Attractor profile ${profile} references missing files: ${resolved.missingFiles.join(', ')}` });
      }
    }

    if (node.tag === 'result-policy') {
      const onGap = node.attrs['on-gap'];
      if (!onGap || !validOnGap.has(onGap)) {
        errors.push({ file, message: `Invalid result-policy on-gap value: ${onGap || '(missing)'}` });
      }
    }

    if (node.tag === 'confirm' && parent?.tag === 'result-policy') {
      const protocol = node.attrs.protocol;
      const when = node.attrs.when;
      const status = node.attrs.status;
      if (!protocol || !validConfirmProtocol.has(protocol)) {
        errors.push({ file, message: `Invalid nested confirm protocol value: ${protocol || '(missing)'}` });
      }
      if (!when || !validWhen.has(when)) {
        errors.push({ file, message: `Invalid nested confirm when value: ${when || '(missing)'}` });
      }
      if (!status || !validStatus.has(status)) {
        errors.push({ file, message: `Invalid nested confirm status value: ${status || '(missing)'}` });
      }
    }
  });
}

const KNOWN_OPERATION_POINTS: Record<string, Set<string>> = {
  track: new Set(['before-start', 'after-spec-delta', 'after-proposal', 'after-design', 'after-plan', 'before-finish']),
  archive: new Set(['before-start', 'before-spec-apply', 'before-artifact-sync', 'before-archive', 'after-archive']),
  'revise-track': new Set(['before-revise', 'after-revise']),
};

function validateOperationHooks(errors: ValidationError[], workspaceDir: string, codumentDir: string, artifactIds = new Set<string>()): void {
  const hooksPath = operationHooksPath(codumentDir);
  if (!fs.existsSync(hooksPath)) {
    return;
  }

  const file = path.relative('.', hooksPath);
  const root = parseXmlForValidation(fs.readFileSync(hooksPath, 'utf-8'), file, errors);
  if (!root) {
    return;
  }
  if (root.tag !== 'operation-hooks') {
    errors.push({ file, message: 'operation hooks root must be <operation-hooks>' });
    return;
  }
  if (root.attrs.version !== '1') {
    errors.push({ file, message: `operation hooks version must be 1: ${root.attrs.version || '(missing)'}` });
  }

  for (const operation of root.children.filter((child) => child.tag === 'operation')) {
    const operationName = operation.attrs.name;
    if (!operationName) {
      errors.push({ file, message: 'operation entry is missing name attribute' });
      continue;
    }

    const knownPoints = KNOWN_OPERATION_POINTS[operationName];
    for (const hook of operation.children.filter((child) => child.tag === 'hook')) {
      const hookId = hook.attrs.id || '(missing)';
      const point = hook.attrs.point;
      const status = hook.attrs.status;
      if (!point) {
        errors.push({ file, message: `Hook ${hookId} in operation ${operationName} is missing point attribute` });
      } else if (knownPoints && !knownPoints.has(point)) {
        errors.push({ file, message: `Unknown hook point for operation ${operationName}: ${point}` });
      }
      if (!status || !new Set(['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'CANCELLED']).has(status)) {
        errors.push({ file, message: `Invalid hook status value for ${hookId}: ${status || '(missing)'}` });
      }
    }
  }

  validateAttractorCheckNodes(root, file, errors, workspaceDir, codumentDir);
  validateArtifactSyncNodes(root, file, errors, artifactIds);
}

function validateArtifactsConfig(errors: ValidationError[], workspaceDir: string, codumentDir: string): Set<string> {
  const configPath = artifactsConfigPath(codumentDir);
  const artifactIds = new Set<string>();
  if (!fs.existsSync(configPath)) {
    return artifactIds;
  }

  const file = path.relative('.', configPath);
  const root = parseXmlForValidation(fs.readFileSync(configPath, 'utf-8'), file, errors);
  if (!root) {
    return artifactIds;
  }

  if (root.tag !== 'artifact-config') {
    errors.push({ file, message: 'artifacts config root must be <artifact-config>' });
    return artifactIds;
  }
  if (root.attrs.version !== '1') {
    errors.push({ file, message: `artifacts config version must be 1: ${root.attrs.version || '(missing)'}` });
  }

  const resources = root.children.filter((child) => child.tag === 'resources');
  const artifacts = root.children.filter((child) => child.tag === 'artifacts');
  if (resources.length !== 1) {
    errors.push({ file, message: 'artifacts config must contain exactly one <resources> section' });
  }
  if (artifacts.length !== 1) {
    errors.push({ file, message: 'artifacts config must contain exactly one <artifacts> section' });
  }
  for (const child of root.children) {
    if (child.tag !== 'resources' && child.tag !== 'artifacts') {
      errors.push({ file, message: `Unsupported artifact-config child node: ${child.tag}` });
    }
  }

  const resourceIds = new Set<string>();
  const validResourceTags = new Set(['workflow', 'skill', 'attractor-profile', 'agent']);
  const validExecutor = new Set(['main-agent', 'subagent', 'fresh-subagent']);

  for (const section of resources) {
    for (const resource of section.children) {
      if (!validResourceTags.has(resource.tag)) {
        errors.push({ file, message: `Unsupported artifact resource type: ${resource.tag}` });
        continue;
      }

      const id = resource.attrs.id;
      if (!id) {
        errors.push({ file, message: `Artifact resource ${resource.tag} is missing id attribute` });
      } else if (resourceIds.has(id)) {
        errors.push({ file, message: `Duplicate artifact resource id: ${id}` });
      } else {
        resourceIds.add(id);
      }

      if (resource.tag === 'workflow' || resource.tag === 'skill') {
        const ref = resource.attrs.ref;
        if (!ref) {
          errors.push({ file, message: `Artifact resource ${id || resource.tag} is missing ref attribute` });
        } else {
          const refPath = path.isAbsolute(ref) ? ref : path.resolve(workspaceDir, ref);
          if (!fs.existsSync(refPath)) {
            errors.push({ file, message: `Artifact resource ${id || resource.tag} references missing file: ${ref}` });
          }
        }
      }
      if (resource.tag === 'attractor-profile') {
        const profile = resource.attrs.name;
        if (resource.attrs.attractor) {
          errors.push({
            file,
            message: `Artifact attractor-profile resource ${id || profile || resource.tag} must not use direct attractor attribute; define attractors in codument/config/attractor-profiles.json`,
          });
        }
        if (resource.attrs.ref) {
          errors.push({
            file,
            message: `Artifact attractor-profile resource ${id || profile || resource.tag} must not use ref attribute; define attractors in codument/config/attractor-profiles.json`,
          });
        }
        if (!profile) {
          errors.push({ file, message: `Artifact resource ${id || resource.tag} is missing name attribute` });
        } else {
          let resolved: ReturnType<typeof resolveAttractorProfile>;
          try {
            resolved = resolveAttractorProfile(profile, codumentDir, workspaceDir);
          } catch (error) {
            errors.push({
              file: path.relative('.', attractorProfilesPath(codumentDir)),
              message: `Invalid attractor profile configuration: ${error instanceof Error ? error.message : 'Unable to parse config'}`,
            });
            resolved = null;
          }
          if (!resolved) {
            errors.push({ file, message: `Unknown attractor profile referenced by artifact resource: ${profile}` });
          } else if (resolved.missingFiles.length > 0) {
            errors.push({ file, message: `Artifact attractor profile ${profile} references missing files: ${resolved.missingFiles.join(', ')}` });
          }
        }
      }
      if (resource.tag === 'agent') {
        const executor = resource.attrs.executor;
        if (!executor || !validExecutor.has(executor)) {
          errors.push({ file, message: `Invalid artifact agent executor value: ${executor || '(missing)'}` });
        }
      }
    }
  }

  const validArtifactStatus = new Set(['true', 'false']);
  const validTargetKinds = new Set(['local-dir', 'web', 'command']);
  const validDryRun = new Set(['never', 'first', 'always', 'changed']);
  const validConflict = new Set(['block', 'diff-confirm', 'merge', 'overwrite', 'append', 'skip']);
  const validProvenance = new Set(['none', 'manifest', 'inline', 'both']);

  for (const section of artifacts) {
    for (const artifact of section.children) {
      if (artifact.tag !== 'artifact') {
        errors.push({ file, message: `Unsupported artifacts child node: ${artifact.tag}` });
        continue;
      }

      const id = artifact.attrs.id;
      if (!id) {
        errors.push({ file, message: 'Artifact is missing id attribute' });
      } else if (artifactIds.has(id)) {
        errors.push({ file, message: `Duplicate artifact id: ${id}` });
      } else {
        artifactIds.add(id);
      }

      if (!artifact.attrs.kind) {
        errors.push({ file, message: `Artifact ${id || '(missing)'} is missing kind attribute` });
      }
      if (artifact.attrs.enabled && !validArtifactStatus.has(artifact.attrs.enabled)) {
        errors.push({ file, message: `Invalid artifact enabled value for ${id || '(missing)'}: ${artifact.attrs.enabled}` });
      }
      const targetKind = artifact.attrs['target-kind'];
      if (targetKind && !validTargetKinds.has(targetKind)) {
        errors.push({ file, message: `Invalid artifact target-kind value for ${id || '(missing)'}: ${targetKind}` });
      }

      for (const child of artifact.children) {
        if (child.tag !== 'uses' && child.tag !== 'targets' && child.tag !== 'policy') {
          errors.push({ file, message: `Unsupported artifact child node for ${id || '(missing)'}: ${child.tag}` });
        }
      }

      for (const uses of artifact.children.filter((child) => child.tag === 'uses')) {
        for (const use of uses.children) {
          if (use.tag !== 'use') {
            errors.push({ file, message: `Unsupported uses child node for ${id || '(missing)'}: ${use.tag}` });
            continue;
          }
          const resource = use.attrs.resource;
          if (!resource) {
            errors.push({ file, message: `Artifact ${id || '(missing)'} has use without resource attribute` });
          } else if (!resourceIds.has(resource)) {
            errors.push({ file, message: `Artifact ${id || '(missing)'} references unknown resource: ${resource}` });
          }
        }
      }

      for (const targets of artifact.children.filter((child) => child.tag === 'targets')) {
        for (const target of targets.children) {
          if (target.tag !== 'target') {
            errors.push({ file, message: `Unsupported targets child node for ${id || '(missing)'}: ${target.tag}` });
            continue;
          }
          const targetId = target.attrs.id || '(missing)';
          const targetKind = target.attrs.kind || artifact.attrs['target-kind'];
          const baseDir = target.attrs['base-dir'] || target.attrs.path;
          const relativeDir = target.attrs['relative-dir'];
          const relativeFile = target.attrs['relative-file'] || target.attrs['output-path'];
          if (!target.attrs.id) {
            errors.push({ file, message: `Artifact ${id || '(missing)'} has target without id attribute` });
          }
          if (!baseDir) {
            errors.push({ file, message: `Artifact ${id || '(missing)'} target ${targetId} is missing base-dir attribute` });
          }
          if (!relativeDir && !relativeFile) {
            errors.push({ file, message: `Artifact ${id || '(missing)'} target ${targetId} must define relative-dir or relative-file` });
          }
          if (relativeDir && relativeFile) {
            errors.push({ file, message: `Artifact ${id || '(missing)'} target ${targetId} must not define both relative-dir and relative-file` });
          }
          if (!targetKind || !validTargetKinds.has(targetKind)) {
            errors.push({ file, message: `Invalid artifact target kind value for ${id || '(missing)'} target ${targetId}: ${targetKind || '(missing)'}` });
          }
          const targetAttractor = target.attrs.attractor;
          if (targetAttractor) {
            const targetAttractorPath = path.isAbsolute(targetAttractor) ? targetAttractor : path.resolve(workspaceDir, targetAttractor);
            if (!fs.existsSync(targetAttractorPath)) {
              errors.push({ file, message: `Artifact ${id || '(missing)'} target ${targetId} references missing attractor file: ${targetAttractor}` });
            }
          }
        }
      }

      for (const policy of artifact.children.filter((child) => child.tag === 'policy')) {
        const dryRun = policy.attrs['dry-run'];
        const conflict = policy.attrs.conflict;
        const provenance = policy.attrs.provenance;
        if (dryRun && !validDryRun.has(dryRun)) {
          errors.push({ file, message: `Invalid artifact policy dry-run value for ${id || '(missing)'}: ${dryRun}` });
        }
        if (conflict && !validConflict.has(conflict)) {
          errors.push({ file, message: `Invalid artifact policy conflict value for ${id || '(missing)'}: ${conflict}` });
        }
        if (provenance && !validProvenance.has(provenance)) {
          errors.push({ file, message: `Invalid artifact policy provenance value for ${id || '(missing)'}: ${provenance}` });
        }
      }
    }
  }

  return artifactIds;
}

function validateArtifactSyncNodes(
  root: SpecXmlNode | null,
  file: string,
  errors: ValidationError[],
  artifactIds: Set<string>,
): void {
  if (!root) {
    return;
  }

  const validStatus = new Set(['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'CANCELLED']);
  const validExecutor = new Set(['main-agent', 'subagent', 'fresh-subagent']);

  visitXml(root, (node) => {
    if (node.tag !== 'artifact-sync') {
      return;
    }

    const artifact = node.attrs.artifact;
    const status = node.attrs.status;
    const executor = node.attrs.executor || 'subagent';

    if (!artifact) {
      errors.push({ file, message: 'artifact-sync is missing artifact attribute' });
    } else if (!artifactIds.has(artifact)) {
      errors.push({ file, message: `Unknown artifact referenced by artifact-sync: ${artifact}` });
    }
    if (!status || !validStatus.has(status)) {
      errors.push({ file, message: `Invalid artifact-sync status value: ${status || '(missing)'}` });
    }
    if (!validExecutor.has(executor)) {
      errors.push({ file, message: `Invalid artifact-sync executor value: ${executor}` });
    }
  });
}

function collectTrackXmlSpecDeltas(trackDir: string): string[] {
  const results: string[] = [];
  const roots = [
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

function validateSpec(specId: string, _strict: boolean): ValidationResult {
  const specDir = path.join(SPECS_DIR, specId);
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const specPath = path.join(specDir, 'spec.md');
  const specXmlFilePath = path.join(SPECS_DIR, `${specId}.xml`);
  const specXmlIndexPath = path.join(specDir, 'index.xml');
  const isXml = fs.existsSync(specXmlFilePath) || fs.existsSync(specXmlIndexPath);

  if (!fs.existsSync(specPath) && !isXml) {
    errors.push({ file: 'spec.md|index.xml', message: 'Spec file not found' });
  } else if (isXml) {
    try {
      const xmlEntryPath = fs.existsSync(specXmlFilePath) ? specXmlFilePath : specDir;
      const root = loadSpecXml(xmlEntryPath);
      if (root.tag !== 'capability') {
        errors.push({ file: 'index.xml', message: 'XML spec root must be <capability>' });
      }
      if (!root.attrs.id) {
        errors.push({ file: 'index.xml', message: 'XML capability must have an id attribute' });
      }
      const stats = getSpecXmlStats(root);
      if (stats.requirements === 0) {
        errors.push({ file: 'index.xml', message: 'XML spec must have at least one requirement' });
      }
      if (stats.scenarios === 0) {
        errors.push({ file: 'index.xml', message: 'XML spec must have at least one case' });
      }
    } catch (error) {
      errors.push({
        file: fs.existsSync(specXmlFilePath) ? `${specId}.xml` : 'index.xml',
        message: error instanceof Error ? error.message : 'Invalid XML spec',
      });
    }
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
