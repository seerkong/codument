/**
 * OpenCode command generator
 * Generates OpenCode skills and .opencode/command/*.md files.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  LEGACY_CODUMENT_SKILL_NAME,
  OPENCODE_WORKFLOW_SKILL_DISPLAY_PATH,
  buildWorkflowSkillDirectories,
} from '../../skills/codument-workflow';
import { buildSkillWrapperBody } from './prompt-builders';
import { syncGeneratedSkillDirectories } from './skill-sync';

const OPENCODE_COMMANDS_DIR = '.opencode/command';
const OPENCODE_SKILLS_DIR = path.join('.opencode', 'skills');

const COMMANDS = {
  'codument-init': {
    description: 'Initialize Codument in the current project',
    content: buildSkillWrapperBody({
      commandId: 'init',
      skillDisplayPath: OPENCODE_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'init',
      argsToken: '$ARGUMENTS',
    }),
  },
  'codument-track': {
    description: 'Create a new change track',
    content: buildSkillWrapperBody({
      commandId: 'track',
      skillDisplayPath: OPENCODE_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'track',
      argsToken: '$ARGUMENTS',
    }),
  },
  'codument-implement': {
    description: 'Implement tasks from a track',
    content: buildSkillWrapperBody({
      commandId: 'implement',
      skillDisplayPath: OPENCODE_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'implement',
      argsToken: '$ARGUMENTS',
    }),
  },
  'codument-validate': {
    description: 'Validate track or spec format',
    content: buildSkillWrapperBody({
      commandId: 'validate',
      skillDisplayPath: OPENCODE_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'validate',
      argsToken: '$ARGUMENTS',
    }),
  },
  'codument-archive': {
    description: 'Archive a completed track',
    content: buildSkillWrapperBody({
      commandId: 'archive',
      skillDisplayPath: OPENCODE_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'archive',
      argsToken: '$ARGUMENTS',
    }),
  },
  'codument-status': {
    description: 'Show project status overview',
    content: buildSkillWrapperBody({
      commandId: 'status',
      skillDisplayPath: OPENCODE_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'status',
    }),
  },
  'codument-discuss': {
    description: 'Discuss a phase for wave execution planning',
    content: buildSkillWrapperBody({
      commandId: 'discuss',
      skillDisplayPath: OPENCODE_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'discuss',
      argsToken: '$ARGUMENTS',
    }),
  },
  'codument-plan-wave': {
    description: 'Plan wave DAG for a track phase',
    content: buildSkillWrapperBody({
      commandId: 'plan-wave',
      skillDisplayPath: OPENCODE_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'plan-wave',
      argsToken: '$ARGUMENTS',
    }),
  },
  'codument-execute-wave': {
    description: 'Execute tasks by wave DAG scheduling',
    content: buildSkillWrapperBody({
      commandId: 'execute-wave',
      skillDisplayPath: OPENCODE_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'execute-wave',
      argsToken: '$ARGUMENTS',
    }),
  },
  'codument-verify': {
    description: 'Verify implementation with independent validation mode',
    content: buildSkillWrapperBody({
      commandId: 'verify',
      skillDisplayPath: OPENCODE_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'verify',
      argsToken: '$ARGUMENTS',
    }),
  },
  'codument-gap-loop': {
    description: 'Run a fresh gap loop for a track or phase',
    content: buildSkillWrapperBody({
      commandId: 'gap-loop',
      skillDisplayPath: OPENCODE_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'gap-loop',
      argsToken: '$ARGUMENTS',
      extraRules: [
        'For OpenCode, the preferred fresh-child mechanism is a fresh task or fresh session.',
        'Do not reuse a previous task ID when re-running a gap-loop round.',
      ],
    }),
  },
};

export async function generateOpenCodeCommands(): Promise<void> {
  syncGeneratedSkillDirectories(
    OPENCODE_SKILLS_DIR,
    buildWorkflowSkillDirectories('opencode'),
    [LEGACY_CODUMENT_SKILL_NAME]
  );

  if (!fs.existsSync(OPENCODE_COMMANDS_DIR)) {
    fs.mkdirSync(OPENCODE_COMMANDS_DIR, { recursive: true });
  }

  for (const [name, cmd] of Object.entries(COMMANDS)) {
    const filePath = path.join(OPENCODE_COMMANDS_DIR, `${name}.md`);
    const content = `---
description: ${cmd.description}
allowed-tools: All
---
${cmd.content}
`;

    fs.writeFileSync(filePath, content);
  }
}
