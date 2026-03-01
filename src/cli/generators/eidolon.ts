/**
 * Eidolon CLI command generator
 * Generates .eidolon/commands/codument/*.toml files
 * Format is the same as Gemini CLI
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

const EIDOLON_COMMANDS_DIR = '.eidolon/commands/codument';

const COMMANDS = {
  init: {
    description: 'Initialize Codument in the current project',
    prompt: `{{args}}

${initPrompt}
`,
  },
  track: {
    description: 'Create a new change track for a feature or bug fix',
    prompt: `{{args}}

${trackPrompt}
`,
  },
  implement: {
    description: 'Implement tasks from a track following the workflow',
    prompt: `{{args}}

${implementPrompt}
`,
  },
  validate: {
    description: 'Validate track or spec format',
    prompt: `{{args}}

${validatePrompt}
`,
  },
  archive: {
    description: 'Archive a completed track',
    prompt: `{{args}}

${archivePrompt}
`,
  },
  status: {
    description: 'Show project status overview',
    prompt: `${statusPrompt}`,
  },
  discuss: {
    description: 'Discuss a phase for wave execution planning',
    prompt: `{{args}}

${discussPrompt}
`,
  },
  'plan-wave': {
    description: 'Plan wave DAG for a track phase',
    prompt: `{{args}}

${planWavePrompt}
`,
  },
  'execute-wave': {
    description: 'Execute tasks by wave DAG scheduling',
    prompt: `{{args}}

${executeWavePrompt}
`,
  },
  verify: {
    description: 'Verify implementation with independent validation mode',
    prompt: `{{args}}

${verifyPrompt}
`,
  },
};

function escapeToml(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"');
}

export async function generateEidolonCommands(): Promise<void> {
  // Create directory
  if (!fs.existsSync(EIDOLON_COMMANDS_DIR)) {
    fs.mkdirSync(EIDOLON_COMMANDS_DIR, { recursive: true });
  }

  // Generate command files
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
