import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  CODUMENT_DIR,
  codumentExists,
  parseOptions,
} from '../utils';

import {
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
} from '../../skills/codument-workflow';

type CLITool = 'claude' | 'codeflicker' | 'codex' | 'eidolon' | 'opencode' | 'sparrow';

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

function removeLegacyCodumentSkill(skillsRootDir: string): void {
  const legacySkillPath = path.join(skillsRootDir, LEGACY_CODUMENT_SKILL_NAME);
  if (fs.existsSync(legacySkillPath) && fs.statSync(legacySkillPath).isDirectory()) {
    fs.rmSync(legacySkillPath, { recursive: true, force: true });
  }
}

function cleanupLegacyCodumentSkills(tools: CLITool[]): void {
  for (const tool of tools) {
    switch (tool) {
      case 'claude':
        removeLegacyCodumentSkill(path.join('.claude', 'skills'));
        break;
      case 'codeflicker':
        removeLegacyCodumentSkill(path.join('.codeflicker', 'skills'));
        break;
      case 'codex':
        removeLegacyCodumentSkill(path.join(os.homedir(), '.codex', 'skills'));
        break;
      case 'eidolon':
        removeLegacyCodumentSkill(path.join('.eidolon', 'skills'));
        break;
      case 'opencode':
        removeLegacyCodumentSkill(path.join('.opencode', 'skills'));
        break;
      case 'sparrow':
        removeLegacyCodumentSkill(path.join('.sparrow', 'skill'));
        break;
    }
  }
}

function workflowSkillDisplayPath(skillsDisplayPath: string): string {
  return `${skillsDisplayPath}${CODUMENT_WORKFLOW_SKILL_NAME}/`;
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

    backupIfExists(
      path.join(os.homedir(), '.codex', 'skills', CODUMENT_WORKFLOW_SKILL_NAME),
      backupRoot,
      path.join('.codex', 'skills', CODUMENT_WORKFLOW_SKILL_NAME)
    );
  }

  // Upgrade codument/std
  const stdDir = path.join(CODUMENT_DIR, 'std');
  if (!fs.existsSync(stdDir)) {
    fs.mkdirSync(stdDir, { recursive: true });
  }

  fs.writeFileSync(path.join(stdDir, 'AGENTS.md'), stdAgentsPrompt);
  fs.writeFileSync(path.join(stdDir, 'plan-xml-spec.md'), planXmlSpec);
  fs.writeFileSync(path.join(stdDir, 'workflow.md'), workflowTemplate);
  fs.writeFileSync(path.join(stdDir, 'protocols.md'), protocolsPrompt);
  console.log('✓ Updated codument/std (AGENTS.md, plan-xml-spec.md, workflow.md, protocols.md)');

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
        console.log('✓ Upgraded .claude/commands/codument');
        console.log(`✓ Upgraded ${workflowSkillDisplayPath(CLAUDE_WORKFLOW_SKILL_DISPLAY_PATH)}`);
        break;
      case 'codeflicker':
        await generateCodeFlickerCommands();
        console.log('✓ Upgraded .codeflicker/commands/codument');
        console.log(`✓ Upgraded ${workflowSkillDisplayPath(CODEFLICKER_WORKFLOW_SKILL_DISPLAY_PATH)}`);
        break;
      case 'codex':
        await generateCodexCommands();
        console.log(`✓ Upgraded ${workflowSkillDisplayPath(CODEX_WORKFLOW_SKILL_DISPLAY_PATH)}`);
        break;
      case 'eidolon':
        await generateEidolonCommands();
        console.log('✓ Upgraded .eidolon/commands/codument');
        console.log(`✓ Upgraded ${workflowSkillDisplayPath(EIDOLON_WORKFLOW_SKILL_DISPLAY_PATH)}`);
        break;
      case 'opencode':
        await generateOpenCodeCommands();
        console.log('✓ Upgraded .opencode/command (codument-*.md)');
        console.log(`✓ Upgraded ${workflowSkillDisplayPath(OPENCODE_WORKFLOW_SKILL_DISPLAY_PATH)}`);
        break;
      case 'sparrow':
        await generateSparrowCommands();
        console.log(`✓ Upgraded ${workflowSkillDisplayPath(SPARROW_WORKFLOW_SKILL_DISPLAY_PATH)}`);
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
