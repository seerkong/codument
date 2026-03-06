/**
 * Codex CLI command generator
 * Generates ~/.codex/prompts/*.md files
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  initPrompt, trackPrompt,
  implementPrompt, validatePrompt,
  archivePrompt, statusPrompt,
  discussPrompt, planWavePrompt, executeWavePrompt,
  verifyPrompt
} from '../../prompts'
import {
  withLeadingArgs,
  withTrackRequest,
  withImplementRequest,
  withChangeId,
} from './prompt-builders';

const CODEX_PROMPTS_DIR = path.join(os.homedir(), '.codex', 'prompts');

const COMMANDS = {
  'codument-init': {
    description: 'Initialize Codument in the current project',
    argumentHint: '[project-name]',
    content: withLeadingArgs(initPrompt, '$ARGUMENTS'),
  },
  'codument-track': {
    description: 'Create a new change track for a feature or bug fix',
    argumentHint: '[description]',
    content: withTrackRequest(trackPrompt, '$ARGUMENTS'),
  },
  'codument-implement': {
    description: 'Implement tasks from a track following the workflow',
    argumentHint: '[track-id]',
    content: withImplementRequest(implementPrompt, '$ARGUMENTS'),
  },
  'codument-validate': {
    description: 'Validate track or spec format',
    argumentHint: '[track-id]',
    content: withChangeId(validatePrompt, '$ARGUMENTS'),
  },
  'codument-archive': {
    description: 'Archive a completed track',
    argumentHint: '<track-id>',
    content: withChangeId(archivePrompt, '$ARGUMENTS'),
  },
  'codument-status': {
    description: 'Show project status overview',
    argumentHint: '',
    content: `${statusPrompt}`,
  },
  'codument-discuss': {
    description: 'Discuss a phase for wave execution planning',
    argumentHint: '<track-id>',
    content: withLeadingArgs(discussPrompt, '$ARGUMENTS'),
  },
  'codument-plan-wave': {
    description: 'Plan wave DAG for a track phase',
    argumentHint: '<track-id>',
    content: withLeadingArgs(planWavePrompt, '$ARGUMENTS'),
  },
  'codument-execute-wave': {
    description: 'Execute tasks by wave DAG scheduling',
    argumentHint: '<track-id> [phase]',
    content: withLeadingArgs(executeWavePrompt, '$ARGUMENTS'),
  },
  'codument-verify': {
    description: 'Verify implementation with independent validation mode',
    argumentHint: '<track-id> [phase|wave]',
    content: withLeadingArgs(verifyPrompt, '$ARGUMENTS'),
  },
};

export async function generateCodexCommands(): Promise<void> {
  // Create directory
  if (!fs.existsSync(CODEX_PROMPTS_DIR)) {
    fs.mkdirSync(CODEX_PROMPTS_DIR, { recursive: true });
  }

  // Generate command files
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    const content = `---
description: ${cmd.description}
argument-hint: ${cmd.argumentHint}
---

${cmd.content}
`;
    const filePath = path.join(CODEX_PROMPTS_DIR, `${name}.md`);
    fs.writeFileSync(filePath, content);
  }
}
