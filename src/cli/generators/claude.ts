/**
 * Claude Code command generator
 * Generates .claude/commands/codument/*.md files
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

const CLAUDE_COMMANDS_DIR = '.claude/commands/codument';

const COMMANDS = {
  init: {
    description: 'Initialize Codument in the current project',
    content: `---
description: Initialize Codument in the current project
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

$ARGUMENTS

${initPrompt}
`,
  },
  track: {
    description: 'Create a new change track',
    content: `---
description: Create a new change track for a feature or bug fix
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

$ARGUMENTS

${trackPrompt}
`,
  },
  implement: {
    description: 'Implement tasks from a track',
    content: `---
description: Implement tasks from a track following the workflow
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

$ARGUMENTS

${implementPrompt}
`,
  },
  validate: {
    description: 'Validate track or spec format',
    content: `---
description: Validate track or spec format
allowed-tools: Read, Bash, Glob, Grep
---

$ARGUMENTS

${validatePrompt}
`,
  },
  archive: {
    description: 'Archive a completed track',
    content: `---
description: Archive a completed track
allowed-tools: Read, Write, Edit, Bash, Glob
---

$ARGUMENTS

${archivePrompt}
`,
  },
  status: {
    description: 'Show project status overview',
    content: `---
description: Show project status overview
allowed-tools: Read, Bash, Glob
---

${statusPrompt}
`,
  },
  discuss: {
    description: 'Discuss a phase for wave execution planning',
    content: `---
description: Discuss a phase for wave execution planning
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

$ARGUMENTS

${discussPrompt}
`,
  },
  'plan-wave': {
    description: 'Plan wave DAG for a track phase',
    content: `---
description: Plan wave DAG for a track phase
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

$ARGUMENTS

${planWavePrompt}
`,
  },
  'execute-wave': {
    description: 'Execute tasks by wave DAG scheduling',
    content: `---
description: Execute tasks by wave DAG scheduling
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

$ARGUMENTS

${executeWavePrompt}
`,
  },
  verify: {
    description: 'Verify implementation with independent validation mode',
    content: `---
description: Verify implementation with independent validation mode
allowed-tools: Read, Bash, Glob, Grep
---

$ARGUMENTS

${verifyPrompt}
`,
  },
};

export async function generateClaudeCommands(): Promise<void> {
  // Create directory
  if (!fs.existsSync(CLAUDE_COMMANDS_DIR)) {
    fs.mkdirSync(CLAUDE_COMMANDS_DIR, { recursive: true });
  }

  // Generate command files
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    const filePath = path.join(CLAUDE_COMMANDS_DIR, `${name}.md`);
    fs.writeFileSync(filePath, cmd.content);
  }
}
