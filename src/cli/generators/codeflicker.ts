/**
 * CodeFlicker command generator
 * Generates CodeFlicker skills and .codeflicker/commands/codument/*.md files.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  CODEFLICKER_WORKFLOW_COMMAND_DISPLAY_PATH,
  CODEFLICKER_WORKFLOW_SKILL_DISPLAY_PATH,
  CODUMENT_WORKFLOW_SKILL_NAME,
  LEGACY_CODUMENT_SKILL_NAME,
  buildWorkflowSkillDirectories,
} from '../../skills/codument-lifecycle';
import { buildSkillWrapperBody } from './prompt-builders';
import { syncGeneratedSkillDirectories } from './skill-sync';

const CODEFLICKER_COMMANDS_DIR = '.codeflicker/commands/codument';
const CODEFLICKER_SKILLS_DIR = path.join('.codeflicker', 'skills');

const COMMANDS = {
  init: {
    description: 'Initialize Codument in the current project',
    content: buildSkillWrapperBody({
      commandId: 'init',
      skillDisplayPath: CODEFLICKER_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'init',
      argsToken: '$ARGUMENTS',
    }),
  },
  track: {
    description: 'Create a new change track',
    content: buildSkillWrapperBody({
      commandId: 'track',
      skillDisplayPath: CODEFLICKER_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'track',
      argsToken: '$ARGUMENTS',
    }),
  },
  implement: {
    description: 'Implement tasks from a track',
    content: buildSkillWrapperBody({
      commandId: 'implement',
      skillDisplayPath: CODEFLICKER_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'implement',
      argsToken: '$ARGUMENTS',
    }),
  },
  validate: {
    description: 'Validate track or spec format',
    content: buildSkillWrapperBody({
      commandId: 'validate',
      skillDisplayPath: CODEFLICKER_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'validate',
      argsToken: '$ARGUMENTS',
    }),
  },
  archive: {
    description: 'Archive a completed track',
    content: buildSkillWrapperBody({
      commandId: 'archive',
      skillDisplayPath: CODEFLICKER_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'archive',
      argsToken: '$ARGUMENTS',
    }),
  },
  status: {
    description: 'Show project status overview',
    content: buildSkillWrapperBody({
      commandId: 'status',
      skillDisplayPath: CODEFLICKER_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'status',
    }),
  },
  discuss: {
    description: 'Discuss a phase for wave execution planning',
    content: buildSkillWrapperBody({
      commandId: 'discuss',
      skillDisplayPath: CODEFLICKER_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'discuss',
      argsToken: '$ARGUMENTS',
    }),
  },
  'plan-wave': {
    description: 'Plan wave DAG for a track phase',
    content: buildSkillWrapperBody({
      commandId: 'plan-wave',
      skillDisplayPath: CODEFLICKER_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'plan-wave',
      argsToken: '$ARGUMENTS',
    }),
  },
  'execute-wave': {
    description: 'Execute tasks by wave DAG scheduling',
    content: buildSkillWrapperBody({
      commandId: 'execute-wave',
      skillDisplayPath: CODEFLICKER_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'execute-wave',
      argsToken: '$ARGUMENTS',
    }),
  },
  verify: {
    description: 'Verify implementation with independent validation mode',
    content: buildSkillWrapperBody({
      commandId: 'verify',
      skillDisplayPath: CODEFLICKER_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'verify',
      argsToken: '$ARGUMENTS',
    }),
  },
  'gap-loop': {
    description: 'Run a fresh gap loop for a track or phase',
    content: buildSkillWrapperBody({
      commandId: 'gap-loop',
      skillDisplayPath: CODEFLICKER_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'gap-loop',
      argsToken: '$ARGUMENTS',
      extraRules: [
        'For CodeFlicker, the preferred fresh-child mechanism is a newly created child agent.',
        'Each gap-loop round must run in a brand-new child agent instead of reusing the previous child context.',
      ],
    }),
  },
};

export async function generateCodeFlickerCommands(): Promise<void> {
  syncGeneratedSkillDirectories(
    CODEFLICKER_SKILLS_DIR,
    buildWorkflowSkillDirectories('codeflicker'),
    [LEGACY_CODUMENT_SKILL_NAME, CODUMENT_WORKFLOW_SKILL_NAME]
  );

  if (!fs.existsSync(CODEFLICKER_COMMANDS_DIR)) {
    fs.mkdirSync(CODEFLICKER_COMMANDS_DIR, { recursive: true });
  }

  for (const [name, cmd] of Object.entries(COMMANDS)) {
    const filePath = path.join(CODEFLICKER_COMMANDS_DIR, `${name}.md`);
    const content = `---
description: ${cmd.description}
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

${cmd.content}
`;

    fs.writeFileSync(filePath, content);
  }
}
