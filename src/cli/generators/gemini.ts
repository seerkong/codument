/**
 * Gemini CLI command generator
 * Generates .gemini/commands/codument/*.toml files
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  initPrompt, trackPrompt,
  implementPrompt, validatePrompt,
  archivePrompt, statusPrompt
} from '../../prompts'

const GEMINI_COMMANDS_DIR = '.gemini/commands/codument';

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
