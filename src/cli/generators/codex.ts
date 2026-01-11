/**
 * Codex CLI command generator
 * Generates ~/.codex/prompts/*.md or .codex/prompts/*.md files
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  initPrompt, trackPrompt,
  implementPrompt, validatePrompt,
  archivePrompt, statusPrompt
} from '../../prompts'

// Project-level prompts directory
const CODEX_PROMPTS_DIR = '.codex/prompts';

const COMMANDS = {
  'codument-init': {
    description: 'Initialize Codument in the current project',
    argumentHint: '[project-name]',
    content: `$ARGUMENTS

${initPrompt}
`,
  },
  'codument-track': {
    description: 'Create a new change track for a feature or bug fix',
    argumentHint: '[description]',
    content: `$ARGUMENTS

${trackPrompt}
`,
  },
  'codument-implement': {
    description: 'Implement tasks from a track following the workflow',
    argumentHint: '[track-id]',
    content: `$ARGUMENTS

${implementPrompt}
`,
  },
  'codument-validate': {
    description: 'Validate track or spec format',
    argumentHint: '[track-id]',
    content: `$ARGUMENTS

${validatePrompt}
`,
  },
  'codument-archive': {
    description: 'Archive a completed track',
    argumentHint: '<track-id>',
    content: `$ARGUMENTS

${archivePrompt}
`,
  },
  'codument-status': {
    description: 'Show project status overview',
    argumentHint: '',
    content: `${statusPrompt}`,
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
