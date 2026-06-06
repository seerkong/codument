import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ATTRACTORS_DIR,
  CODUMENT_DIR,
  CONFIG_DIR,
  DECISIONS_DIR,
  LEGACY_DIR,
  codumentExists,
  parseOptions,
  SPECS_DIR,
} from '../utils';
import {
  artifactsConfigPath,
  ensureFeatureArtifactDefaults,
  ensureFeatureConfig,
  removeDefaultOnlyAttractorProfiles,
} from '../utils/feature-config';

import {
  docsImplFractalTemplate,
  docsKnowledgeTemplate,
  docsModelingFractalTemplate,
  projectMemoryTemplate,
  stdAgentsPrompt,
  planXmlSpec,
  workflowTemplate,
  protocolsPrompt,
} from '../../prompts';

import { generateClaudeCommands } from '../generators/claude';
import { generateCodeFlickerCommands } from '../generators/codeflicker';
import { generateCodexCommands } from '../generators/codex';
import { generateEidolonCommands } from '../generators/eidolon';
import { generateOpenCodeCommands } from '../generators/opencode';
import { generateSparrowCommands } from '../generators/sparrow';
import {
  CLAUDE_WORKFLOW_SKILL_DISPLAY_PATH,
  CODEFLICKER_WORKFLOW_SKILL_DISPLAY_PATH,
  CODEX_WORKFLOW_SKILL_DISPLAY_PATH,
  CODUMENT_WORKFLOW_SKILL_NAME,
  EIDOLON_WORKFLOW_SKILL_DISPLAY_PATH,
  OPENCODE_WORKFLOW_SKILL_DISPLAY_PATH,
  SPARROW_WORKFLOW_SKILL_DISPLAY_PATH,
  LEGACY_CODUMENT_SKILL_NAME,
} from '../../skills/codument-lifecycle';

type CLITool = 'claude' | 'codeflicker' | 'codex' | 'eidolon' | 'sparrow' | 'opencode';

function safeTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function ensureParentDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyRecursive(src: string, dest: string): void {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyRecursive(s, d);
      } else if (entry.isFile()) {
        ensureParentDir(d);
        fs.copyFileSync(s, d);
      }
    }
    return;
  }

  // file
  ensureParentDir(dest);
  fs.copyFileSync(src, dest);
}

function backupPath(backupRoot: string, relativePath: string): string {
  // Keep relative paths stable inside backup root
  const normalized = relativePath.replace(/^\/+/, '');
  return path.join(backupRoot, normalized);
}

function readSelectedTools(): CLITool[] {
  const statePath = path.join(CODUMENT_DIR, 'state.json');
  if (!fs.existsSync(statePath)) {
    return [];
  }

  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as { cli_tools?: CLITool[] };
    return Array.isArray(state.cli_tools) ? state.cli_tools : [];
  } catch {
    return [];
  }
}

function backupIfExists(src: string, backupRoot: string, rel: string): void {
  if (!fs.existsSync(src)) {
    return;
  }
  const dest = backupPath(backupRoot, rel);
  copyRecursive(src, dest);
}

function copyIfMissing(src: string, dest: string): boolean {
  if (!fs.existsSync(src) || fs.existsSync(dest)) {
    return false;
  }
  copyRecursive(src, dest);
  return true;
}

function writeIfMissing(filePath: string, content: string): boolean {
  if (fs.existsSync(filePath)) {
    return false;
  }

  ensureParentDir(filePath);
  fs.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`, 'utf-8');
  return true;
}

function writeTextFile(filePath: string, content: string): void {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`, 'utf-8');
}

function preserveLegacyIfExists(src: string, relativeLegacyPath: string): boolean {
  if (!fs.existsSync(src)) {
    return false;
  }
  const dest = path.join(LEGACY_DIR, relativeLegacyPath);
  if (fs.existsSync(dest)) {
    return false;
  }
  copyRecursive(src, dest);
  return true;
}

function removeSkillIfDirectory(skillsRootDir: string, skillName: string): void {
  const legacySkillPath = path.join(skillsRootDir, skillName);
  if (fs.existsSync(legacySkillPath) && fs.statSync(legacySkillPath).isDirectory()) {
    fs.rmSync(legacySkillPath, { recursive: true, force: true });
  }
}

function cleanupLegacyCodumentSkills(tools: CLITool[]): void {
  const cleanupNames = [
    LEGACY_CODUMENT_SKILL_NAME,
    CODUMENT_WORKFLOW_SKILL_NAME,
  ];

  for (const tool of tools) {
    const removeFrom = (skillsRootDir: string) => {
      for (const skillName of cleanupNames) {
        removeSkillIfDirectory(skillsRootDir, skillName);
      }
    };

    switch (tool) {
      case 'claude':
        removeFrom(path.join('.claude', 'skills'));
        break;
      case 'codeflicker':
        removeFrom(path.join('.codeflicker', 'skills'));
        break;
      case 'codex':
        removeFrom(path.join(os.homedir(), '.codex', 'skills'));
        break;
      case 'eidolon':
        removeFrom(path.join('.eidolon', 'skills'));
        break;
      case 'sparrow':
        removeFrom(path.join('.sparrow', 'skill'));
        removeFrom(path.join('.sparrow', 'skills'));
        break;
      case 'opencode':
        removeFrom(path.join('.opencode', 'skills'));
        break;
    }
  }
}

function normalizeLegacyArtifactTargetLocations(): boolean {
  const configPath = artifactsConfigPath(CODUMENT_DIR);
  if (!fs.existsSync(configPath)) {
    return false;
  }

  const original = fs.readFileSync(configPath, 'utf-8');
  let normalized = original.replace(
    /(<target\b[^>]*\bid="knowledge-[^"]+"[^>]*?)\spath="([^"]+)"\soutput-path="knowledge\.md"/g,
    '$1 base-dir="$2" relative-dir="."'
  );
  normalized = normalized.replace(
    /(<target\b[^>]*?)\spath="([^"]+)"\soutput-path="([^"]+)"/g,
    '$1 base-dir="$2" relative-file="$3"'
  );

  if (normalized === original) {
    return false;
  }

  fs.writeFileSync(configPath, normalized, 'utf-8');
  return true;
}

function lifecycleSkillsDisplayPath(skillsDisplayPath: string): string {
  return `${skillsDisplayPath}codument-*/`;
}

export async function upgradeWorkspaceCommand(args: string[]): Promise<void> {
  if (!codumentExists()) {
    console.error('Codument is not initialized. Run codument init first.');
    process.exit(1);
  }

  const { options } = parseOptions(args);
  const noBackup = options['no-backup'] === true;
  const backupRoot = typeof options['backup-dir'] === 'string'
    ? path.resolve(String(options['backup-dir']))
    : path.join('.tmp', 'codument', `upgrade-workspace-${safeTimestamp()}`);

  console.log('🔧 Codument Upgrade Workspace');
  console.log(`Workspace: ${process.cwd()}`);
  if (!noBackup) {
    console.log(`Backup:    ${backupRoot}`);
  }
  console.log('');

  if (!noBackup) {
    // Backup codument/std and relevant command directories/files
    backupIfExists(path.join(CODUMENT_DIR, 'std'), backupRoot, path.join(CODUMENT_DIR, 'std'));
    backupIfExists(path.join(CODUMENT_DIR, 'workflows'), backupRoot, path.join(CODUMENT_DIR, 'workflows'));
    backupIfExists(path.join(CODUMENT_DIR, 'tracks.md'), backupRoot, path.join(CODUMENT_DIR, 'tracks.md'));
    backupIfExists(path.join(CODUMENT_DIR, 'project.md'), backupRoot, path.join(CODUMENT_DIR, 'project.md'));
    backupIfExists(path.join(CODUMENT_DIR, 'product.md'), backupRoot, path.join(CODUMENT_DIR, 'product.md'));
    backupIfExists(path.join(CODUMENT_DIR, 'tech-stack.md'), backupRoot, path.join(CODUMENT_DIR, 'tech-stack.md'));
    backupIfExists(SPECS_DIR, backupRoot, SPECS_DIR);

    // Backup assistant command directories (only if present)
    backupIfExists('.claude/commands/codument', backupRoot, '.claude/commands/codument');
    backupIfExists('.claude/skills/codument-workflow', backupRoot, '.claude/skills/codument-workflow');
    backupIfExists('.codeflicker/commands/codument', backupRoot, '.codeflicker/commands/codument');
    backupIfExists('.codeflicker/skills/codument-workflow', backupRoot, '.codeflicker/skills/codument-workflow');
    backupIfExists('.eidolon/commands/codument', backupRoot, '.eidolon/commands/codument');
    backupIfExists('.eidolon/skills/codument-workflow', backupRoot, '.eidolon/skills/codument-workflow');
    backupIfExists('.opencode/command', backupRoot, '.opencode/command');
    backupIfExists('.opencode/skills/codument-workflow', backupRoot, '.opencode/skills/codument-workflow');
    backupIfExists('.sparrow/skill/codument-workflow', backupRoot, '.sparrow/skill/codument-workflow');
    backupIfExists('.sparrow/skills/codument-workflow', backupRoot, '.sparrow/skills/codument-workflow');
    backupIfExists('.sparrow/skills', backupRoot, '.sparrow/skills');

    backupIfExists(
      path.join(os.homedir(), '.codex', 'skills', CODUMENT_WORKFLOW_SKILL_NAME),
      backupRoot,
      path.join('.codex', 'skills', CODUMENT_WORKFLOW_SKILL_NAME)
    );
  }

  if (!fs.existsSync(ATTRACTORS_DIR)) {
    fs.mkdirSync(ATTRACTORS_DIR, { recursive: true });
    console.log('✓ Created codument/attractors');
  }

  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  if (!fs.existsSync(LEGACY_DIR)) {
    fs.mkdirSync(LEGACY_DIR, { recursive: true });
    console.log('✓ Created codument/legacy');
  }

  if (!fs.existsSync(DECISIONS_DIR)) {
    fs.mkdirSync(DECISIONS_DIR, { recursive: true });
  }

  const legacyCopies: string[] = [];
  if (preserveLegacyIfExists(path.join(CODUMENT_DIR, 'product.md'), path.join('project-context', 'product.md'))) {
    legacyCopies.push('project-context/product.md');
  }
  if (preserveLegacyIfExists(path.join(CODUMENT_DIR, 'project.md'), path.join('project-context', 'project.md'))) {
    legacyCopies.push('project-context/project.md');
  }
  if (preserveLegacyIfExists(path.join(CODUMENT_DIR, 'tech-stack.md'), path.join('project-context', 'tech-stack.md'))) {
    legacyCopies.push('project-context/tech-stack.md');
  }
  if (preserveLegacyIfExists(SPECS_DIR, 'specs')) {
    legacyCopies.push('specs');
  }
  if (preserveLegacyIfExists(path.join(CODUMENT_DIR, 'tracks.md'), path.join('workspace', 'tracks.md'))) {
    legacyCopies.push('workspace/tracks.md');
  }

  if (legacyCopies.length > 0) {
    console.log(`✓ Preserved legacy content: ${legacyCopies.join(', ')}`);
  }

  const attractorCopies: string[] = [];
  if (copyIfMissing(path.join(CODUMENT_DIR, 'product.md'), path.join(ATTRACTORS_DIR, 'product.md'))) {
    attractorCopies.push('product.md');
  }
  if (copyIfMissing(path.join(CODUMENT_DIR, 'project.md'), path.join(ATTRACTORS_DIR, 'project.md'))) {
    attractorCopies.push('project.md');
  }
  if (attractorCopies.length > 0) {
    console.log(`✓ Created attractors from legacy context: ${attractorCopies.join(', ')}`);
  }

  const featureConfig = ensureFeatureConfig(CODUMENT_DIR);
  console.log('✓ Ensured codument/config/feature.json');

  if (removeDefaultOnlyAttractorProfiles(CODUMENT_DIR)) {
    console.log('✓ Removed redundant default-only codument/config/attractor-profiles.json');
  }

  const featureAttractors: string[] = [];
  if (featureConfig.knowledgeSync.enabled) {
    if (writeIfMissing(path.join(ATTRACTORS_DIR, 'docs-knowledge.md'), docsKnowledgeTemplate)) {
      featureAttractors.push('docs-knowledge.md');
    }
    if (writeIfMissing(path.join(ATTRACTORS_DIR, 'docs-modeling-fractal', 'index.md'), docsModelingFractalTemplate)) {
      featureAttractors.push('docs-modeling-fractal/index.md');
    }
    if (writeIfMissing(path.join(ATTRACTORS_DIR, 'docs-impl-fractal', 'index.md'), docsImplFractalTemplate)) {
      featureAttractors.push('docs-impl-fractal/index.md');
    }
  }
  if (featureConfig.projectMemory.enabled) {
    if (writeIfMissing(path.join(ATTRACTORS_DIR, 'project-memory.md'), projectMemoryTemplate)) {
      featureAttractors.push('project-memory.md');
    }
  }
  if (featureAttractors.length > 0) {
    console.log(`✓ Created feature attractors: ${featureAttractors.join(', ')}`);
  }

  const featureArtifactDefaults = ensureFeatureArtifactDefaults(featureConfig, CODUMENT_DIR);
  if (featureArtifactDefaults.addedProfiles.length > 0) {
    console.log(`✓ Added feature attractor profiles: ${featureArtifactDefaults.addedProfiles.join(', ')}`);
  }
  if (featureArtifactDefaults.createdArtifactsConfig) {
    console.log('✓ Created codument/config/artifacts.xml from enabled feature config');
  }
  if (featureArtifactDefaults.createdOperationHooksConfig) {
    console.log('✓ Created codument/config/operation-hooks.xml from enabled feature config');
  }
  if (featureArtifactDefaults.migratedKnowledgeTargets) {
    console.log('✓ Moved knowledgeSync targets into codument/config/artifacts.xml');
  }
  if (normalizeLegacyArtifactTargetLocations()) {
    console.log('✓ Migrated artifact targets to base-dir with relative-dir or relative-file');
  }

  const legacyTracksPath = path.join(CODUMENT_DIR, 'tracks.md');
  if (fs.existsSync(legacyTracksPath)) {
    fs.rmSync(legacyTracksPath, { force: true });
    console.log('✓ Removed legacy codument/tracks.md');
  }

  // Upgrade codument/std
  const stdDir = path.join(CODUMENT_DIR, 'std');
  if (!fs.existsSync(stdDir)) {
    fs.mkdirSync(stdDir, { recursive: true });
  }

  writeTextFile(path.join(stdDir, 'AGENTS.md'), stdAgentsPrompt);
  writeTextFile(path.join(stdDir, 'plan-xml-spec.md'), planXmlSpec);
  writeTextFile(path.join(stdDir, 'workflow.md'), workflowTemplate);
  writeTextFile(path.join(stdDir, 'protocols.md'), protocolsPrompt);
  writeTextFile(path.join(stdDir, 'docs-modeling-fractal', 'index.md'), docsModelingFractalTemplate);
  writeTextFile(path.join(stdDir, 'docs-impl-fractal', 'index.md'), docsImplFractalTemplate);
  console.log('✓ Updated codument/std (AGENTS.md, plan-xml-spec.md, workflow.md, protocols.md, docs-modeling-fractal, docs-impl-fractal)');

  // Ensure codument/workflows/workflow.md exists (required by prompts)
  const workflowsDir = path.join(CODUMENT_DIR, 'workflows');
  if (!fs.existsSync(workflowsDir)) {
    fs.mkdirSync(workflowsDir, { recursive: true });
  }
  const projectWorkflowPath = path.join(workflowsDir, 'workflow.md');
  if (!fs.existsSync(projectWorkflowPath)) {
    fs.writeFileSync(projectWorkflowPath, '# 项目级工作流\n');
    console.log('✓ Created codument/workflows/workflow.md');
  }

  // Upgrade selected CLI tool command files
  const tools = readSelectedTools();
  if (tools.length === 0) {
    console.log('⚠ No cli_tools found in codument/state.json; skipping CLI command regeneration.');
    console.log('  Tip: run codument init to (re)select CLI tools, or add cli_tools to codument/state.json.');
    return;
  }

  cleanupLegacyCodumentSkills(tools);

  for (const tool of tools) {
    switch (tool) {
      case 'claude':
        await generateClaudeCommands();
        console.log(`✓ Upgraded .claude/commands/codument`);
        console.log(`✓ Upgraded ${lifecycleSkillsDisplayPath(CLAUDE_WORKFLOW_SKILL_DISPLAY_PATH)}`);
        break;
      case 'codeflicker':
        await generateCodeFlickerCommands();
        console.log(`✓ Upgraded .codeflicker/commands/codument`);
        console.log(`✓ Upgraded ${lifecycleSkillsDisplayPath(CODEFLICKER_WORKFLOW_SKILL_DISPLAY_PATH)}`);
        break;
      case 'codex':
        await generateCodexCommands();
        console.log(`✓ Upgraded ${lifecycleSkillsDisplayPath(CODEX_WORKFLOW_SKILL_DISPLAY_PATH)}`);
        break;
      case 'eidolon':
        await generateEidolonCommands();
        console.log(`✓ Upgraded .eidolon/commands/codument`);
        console.log(`✓ Upgraded ${lifecycleSkillsDisplayPath(EIDOLON_WORKFLOW_SKILL_DISPLAY_PATH)}`);
        break;
      case 'sparrow':
        await generateSparrowCommands();
        console.log(`✓ Upgraded ${lifecycleSkillsDisplayPath(SPARROW_WORKFLOW_SKILL_DISPLAY_PATH)}`);
        break;
      case 'opencode':
        await generateOpenCodeCommands();
        console.log(`✓ Upgraded .opencode/command (codument-*.md)`);
        console.log(`✓ Upgraded ${lifecycleSkillsDisplayPath(OPENCODE_WORKFLOW_SKILL_DISPLAY_PATH)}`);
        break;
    }
  }

  console.log('');
  if (!noBackup) {
    console.log(`Done. Backup saved at: ${backupRoot}`);
  } else {
    console.log('Done. (no backup)');
  }
}
