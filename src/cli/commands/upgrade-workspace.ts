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
import { generateCodexCommands } from '../generators/codex';
import { generateGeminiCommands } from '../generators/gemini';
import { generateEidolonCommands } from '../generators/eidolon';
import { generateOpenCodeCommands } from '../generators/opencode';

type CLITool = 'claude' | 'codex' | 'eidolon' | 'gemini' | 'opencode';

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
    backupIfExists('.gemini/commands/codument', backupRoot, '.gemini/commands/codument');
    backupIfExists('.eidolon/commands/codument', backupRoot, '.eidolon/commands/codument');
    backupIfExists('.opencode/command', backupRoot, '.opencode/command');

    // Codex prompts directory may contain other prompts; backup only codument-*.md
    const codexDir = path.join(os.homedir(), '.codex', 'prompts');
    if (fs.existsSync(codexDir)) {
      const entries = fs.readdirSync(codexDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.startsWith('codument-') || !entry.name.endsWith('.md')) continue;
        const src = path.join(codexDir, entry.name);
        const dest = backupPath(backupRoot, src);
        copyRecursive(src, dest);
      }
    }
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

  for (const tool of tools) {
    switch (tool) {
      case 'claude':
        await generateClaudeCommands();
        console.log('✓ Upgraded .claude/commands/codument');
        break;
      case 'codex':
        await generateCodexCommands();
        console.log('✓ Upgraded ~/.codex/prompts (codument-*.md)');
        break;
      case 'gemini':
        await generateGeminiCommands();
        console.log('✓ Upgraded .gemini/commands/codument');
        break;
      case 'eidolon':
        await generateEidolonCommands();
        console.log('✓ Upgraded .eidolon/commands/codument');
        break;
      case 'opencode':
        await generateOpenCodeCommands();
        console.log('✓ Upgraded .opencode/command (codument-*.md)');
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
