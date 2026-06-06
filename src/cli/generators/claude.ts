/**
 * Claude Code command generator
 * Generates Claude skills and .claude/commands/codument/*.md files.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  CODUMENT_WORKFLOW_SKILL_NAME,
  CLAUDE_WORKFLOW_SKILL_DISPLAY_PATH,
  LEGACY_DOCS_SYNC_TRACK_SKILL_NAME,
  LEGACY_CODUMENT_SKILL_NAME,
  buildWorkflowSkillDirectories,
} from '../../skills/codument-lifecycle';
import { buildSkillWrapperBody } from './prompt-builders';
import { syncGeneratedSkillDirectories } from './skill-sync';

const CLAUDE_COMMANDS_DIR = '.claude/commands/codument';
const CLAUDE_SKILLS_DIR = path.join('.claude', 'skills');

const COMMANDS = {
  init: {
    description: 'Initialize Codument in the current project',
    content: buildSkillWrapperBody({
      commandId: 'init',
      skillDisplayPath: CLAUDE_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'init',
      argsToken: '$ARGUMENTS',
    }),
  },
  track: {
    description: 'Create a new change track',
    content: buildSkillWrapperBody({
      commandId: 'track',
      skillDisplayPath: CLAUDE_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'track',
      argsToken: '$ARGUMENTS',
    }),
  },
  implement: {
    description: 'Implement tasks from a track',
    content: buildSkillWrapperBody({
      commandId: 'implement',
      skillDisplayPath: CLAUDE_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'implement',
      argsToken: '$ARGUMENTS',
    }),
  },
  validate: {
    description: 'Validate track or spec format',
    content: buildSkillWrapperBody({
      commandId: 'validate',
      skillDisplayPath: CLAUDE_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'validate',
      argsToken: '$ARGUMENTS',
    }),
  },
  archive: {
    description: 'Archive a completed track',
    content: buildSkillWrapperBody({
      commandId: 'archive',
      skillDisplayPath: CLAUDE_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'archive',
      argsToken: '$ARGUMENTS',
    }),
  },
  status: {
    description: 'Show project status overview',
    content: buildSkillWrapperBody({
      commandId: 'status',
      skillDisplayPath: CLAUDE_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'status',
    }),
  },
  discuss: {
    description: 'Discuss a phase for wave execution planning',
    content: buildSkillWrapperBody({
      commandId: 'discuss',
      skillDisplayPath: CLAUDE_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'discuss',
      argsToken: '$ARGUMENTS',
    }),
  },
  'plan-wave': {
    description: 'Plan wave DAG for a track phase',
    content: buildSkillWrapperBody({
      commandId: 'plan-wave',
      skillDisplayPath: CLAUDE_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'plan-wave',
      argsToken: '$ARGUMENTS',
    }),
  },
  'execute-wave': {
    description: 'Execute tasks by wave DAG scheduling',
    content: buildSkillWrapperBody({
      commandId: 'execute-wave',
      skillDisplayPath: CLAUDE_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'execute-wave',
      argsToken: '$ARGUMENTS',
    }),
  },
  verify: {
    description: 'Verify implementation with independent validation mode',
    content: buildSkillWrapperBody({
      commandId: 'verify',
      skillDisplayPath: CLAUDE_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'verify',
      argsToken: '$ARGUMENTS',
    }),
  },
  'artifact-sync': {
    description: 'Sync an explicitly selected artifact',
    content: buildSkillWrapperBody({
      commandId: 'artifact-sync',
      skillDisplayPath: CLAUDE_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'artifact-sync',
      argsToken: '$ARGUMENTS',
    }),
  },
  'gap-loop': {
    description: 'Run a fresh gap loop for a track or phase',
    content: buildSkillWrapperBody({
      commandId: 'gap-loop',
      skillDisplayPath: CLAUDE_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'gap-loop',
      argsToken: '$ARGUMENTS',
      extraRules: [
        'For Claude Code, the preferred fresh-child mechanism is a newly created child agent.',
        'Each gap-loop round must run in a brand-new child agent instead of reusing the previous child context.',
      ],
    }),
  },
};

export async function generateClaudeCommands(): Promise<void> {
  syncGeneratedSkillDirectories(
    CLAUDE_SKILLS_DIR,
    buildWorkflowSkillDirectories('claude'),
    [LEGACY_CODUMENT_SKILL_NAME, CODUMENT_WORKFLOW_SKILL_NAME, LEGACY_DOCS_SYNC_TRACK_SKILL_NAME]
  );

  if (!fs.existsSync(CLAUDE_COMMANDS_DIR)) {
    fs.mkdirSync(CLAUDE_COMMANDS_DIR, { recursive: true });
  }

  fs.rmSync(path.join(CLAUDE_COMMANDS_DIR, 'docs-sync-track.md'), { force: true });

  for (const [name, cmd] of Object.entries(COMMANDS)) {
    const filePath = path.join(CLAUDE_COMMANDS_DIR, `${name}.md`);
    const content = `---
description: ${cmd.description}
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

${cmd.content}
`;

    fs.writeFileSync(filePath, content);
  }
}
