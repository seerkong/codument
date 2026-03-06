/**
 * Gemini CLI command generator
 * Generates .gemini/commands/codument/*.toml files
 */

import * as fs from 'fs';
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

const GEMINI_COMMANDS_DIR = '.gemini/commands/codument';

const COMMANDS = {
  init: {
    description: 'Initialize Codument in the current project',
    prompt: withLeadingArgs(initPrompt, '{{args}}'),
  },
  track: {
    description: 'Create a new change track for a feature or bug fix',
    prompt: withTrackRequest(trackPrompt, '{{args}}'),
  },
  implement: {
    description: 'Implement tasks from a track following the workflow',
    prompt: withImplementRequest(implementPrompt, '{{args}}'),
  },
  validate: {
    description: 'Validate track or spec format',
    prompt: withChangeId(validatePrompt, '{{args}}'),
  },
  archive: {
    description: 'Archive a completed track',
    prompt: withChangeId(archivePrompt, '{{args}}'),
  },
  status: {
    description: 'Show project status overview',
    prompt: `${statusPrompt}`,
  },
  discuss: {
    description: 'Discuss a phase for wave execution planning',
    prompt: withLeadingArgs(discussPrompt, '{{args}}'),
  },
  'plan-wave': {
    description: 'Plan wave DAG for a track phase',
    prompt: withLeadingArgs(planWavePrompt, '{{args}}'),
  },
  'execute-wave': {
    description: 'Execute tasks by wave DAG scheduling',
    prompt: withLeadingArgs(executeWavePrompt, '{{args}}'),
  },
  verify: {
    description: 'Verify implementation with independent validation mode',
    prompt: withLeadingArgs(verifyPrompt, '{{args}}'),
  },
};

function escapeToml(str: string): string {
  // Escape special characters for TOML multi-line strings
  return str.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"');
}

export async function generateGeminiCommands(): Promise<void> {
  // Create directory
  if (!fs.existsSync(GEMINI_COMMANDS_DIR)) {
    fs.mkdirSync(GEMINI_COMMANDS_DIR, { recursive: true });
  }

  // Generate command files
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    const content = `description = "${cmd.description}"

prompt = """
${escapeToml(cmd.prompt)}
"""
`;
    const filePath = path.join(GEMINI_COMMANDS_DIR, `${name}.toml`);
    fs.writeFileSync(filePath, content);
  }
}
