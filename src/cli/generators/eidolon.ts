/**
 * Eidolon CLI command generator
 * Generates Eidolon skills and .eidolon/commands/codument/*.toml files.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  CODUMENT_WORKFLOW_SKILL_NAME,
  EIDOLON_WORKFLOW_SKILL_DISPLAY_PATH,
  LEGACY_CODUMENT_SKILL_NAME,
  buildWorkflowSkillDirectories,
} from '../../skills/codument-workflow';
import { buildSkillWrapperBody } from './prompt-builders';
import { syncGeneratedSkillDirectories } from './skill-sync';

const EIDOLON_COMMANDS_DIR = '.eidolon/commands/codument';
const EIDOLON_SKILLS_DIR = path.join('.eidolon', 'skills');

const COMMANDS = {
  init: {
    description: 'Initialize Codument in the current project',
    prompt: buildSkillWrapperBody({
      commandId: 'init',
      skillDisplayPath: EIDOLON_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'init',
      argsToken: '{{args}}',
    }),
  },
  track: {
    description: 'Create a new change track for a feature or bug fix',
    prompt: buildSkillWrapperBody({
      commandId: 'track',
      skillDisplayPath: EIDOLON_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'track',
      argsToken: '{{args}}',
    }),
  },
  implement: {
    description: 'Implement tasks from a track following the workflow',
    prompt: buildSkillWrapperBody({
      commandId: 'implement',
      skillDisplayPath: EIDOLON_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'implement',
      argsToken: '{{args}}',
    }),
  },
  validate: {
    description: 'Validate track or spec format',
    prompt: buildSkillWrapperBody({
      commandId: 'validate',
      skillDisplayPath: EIDOLON_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'validate',
      argsToken: '{{args}}',
    }),
  },
  archive: {
    description: 'Archive a completed track',
    prompt: buildSkillWrapperBody({
      commandId: 'archive',
      skillDisplayPath: EIDOLON_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'archive',
      argsToken: '{{args}}',
    }),
  },
  status: {
    description: 'Show project status overview',
    prompt: buildSkillWrapperBody({
      commandId: 'status',
      skillDisplayPath: EIDOLON_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'status',
    }),
  },
  discuss: {
    description: 'Discuss a phase for wave execution planning',
    prompt: buildSkillWrapperBody({
      commandId: 'discuss',
      skillDisplayPath: EIDOLON_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'discuss',
      argsToken: '{{args}}',
    }),
  },
  'plan-wave': {
    description: 'Plan wave DAG for a track phase',
    prompt: buildSkillWrapperBody({
      commandId: 'plan-wave',
      skillDisplayPath: EIDOLON_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'plan-wave',
      argsToken: '{{args}}',
    }),
  },
  'execute-wave': {
    description: 'Execute tasks by wave DAG scheduling',
    prompt: buildSkillWrapperBody({
      commandId: 'execute-wave',
      skillDisplayPath: EIDOLON_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'execute-wave',
      argsToken: '{{args}}',
    }),
  },
  verify: {
    description: 'Verify implementation with independent validation mode',
    prompt: buildSkillWrapperBody({
      commandId: 'verify',
      skillDisplayPath: EIDOLON_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'verify',
      argsToken: '{{args}}',
    }),
  },
  'gap-loop': {
    description: 'Run a fresh gap loop for a track or phase',
    prompt: buildSkillWrapperBody({
      commandId: 'gap-loop',
      skillDisplayPath: EIDOLON_WORKFLOW_SKILL_DISPLAY_PATH,
      subskillName: 'gap-loop',
      argsToken: '{{args}}',
      extraRules: [
        'For Eidolon, the preferred fresh-child mechanism is a new agent or fresh session.',
        'Do not reuse the previous session when a new gap-loop round is required.',
      ],
    }),
  },
};

function escapeToml(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"');
}

export async function generateEidolonCommands(): Promise<void> {
  syncGeneratedSkillDirectories(
    EIDOLON_SKILLS_DIR,
    buildWorkflowSkillDirectories('eidolon'),
    [LEGACY_CODUMENT_SKILL_NAME, CODUMENT_WORKFLOW_SKILL_NAME]
  );

  if (!fs.existsSync(EIDOLON_COMMANDS_DIR)) {
    fs.mkdirSync(EIDOLON_COMMANDS_DIR, { recursive: true });
  }

  for (const [name, cmd] of Object.entries(COMMANDS)) {
    const content = `description = "${cmd.description}"

prompt = """
${escapeToml(cmd.prompt)}
"""
`;
    const filePath = path.join(EIDOLON_COMMANDS_DIR, `${name}.toml`);
    fs.writeFileSync(filePath, content);
  }
}
