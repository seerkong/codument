/**
 * OpenCode command generator
 * Generates .opencode/command/*.md files
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
  withTrackRequest,
  withImplementRequest,
  withChangeId,
} from './prompt-builders';

const OPENCODE_COMMANDS_DIR = '.opencode/command';

const COMMANDS = {
  'codument-init': {
    description: 'Initialize Codument in the current project',
    content: `---
description: Initialize Codument in the current project
allowed-tools: All
---
${initPrompt}

`,
  },
  'codument-track': {
    description: 'Create a new change track',
    content: `---
description: Create a new change track for a feature or bug fix
allowed-tools: All
---
${withTrackRequest(trackPrompt)}

`,
  },
  'codument-implement': {
    description: 'Implement tasks from a track',
    content: `---
description: Implement tasks from a track following the workflow
allowed-tools: All
---
${withImplementRequest(implementPrompt)}

`,
  },
  'codument-validate': {
    description: 'Validate track or spec format',
    content: `---
description: Validate track or spec format
allowed-tools: All
---
${withChangeId(validatePrompt, '$ARGUMENTS')}

`,
  },
  'codument-archive': {
    description: 'Archive a completed track',
    content: `---
description: Archive a completed track
allowed-tools: All
---
${withChangeId(archivePrompt, '$ARGUMENTS')}

`,
  },
  'codument-status': {
    description: 'Show project status overview',
    content: `---
description: Show project status overview
allowed-tools: All
---

${statusPrompt}
`,
  },
  'codument-discuss': {
    description: 'Discuss a phase for wave execution planning',
    content: `---
description: Discuss a phase for wave execution planning
allowed-tools: All
---
${discussPrompt}

`,
  },
  'codument-plan-wave': {
    description: 'Plan wave DAG for a track phase',
    content: `---
description: Plan wave DAG for a track phase
allowed-tools: All
---
${planWavePrompt}

`,
  },
  'codument-execute-wave': {
    description: 'Execute tasks by wave DAG scheduling',
    content: `---
description: Execute tasks by wave DAG scheduling
allowed-tools: All
---
${executeWavePrompt}

`,
  },
  'codument-verify': {
    description: 'Verify implementation with independent validation mode',
    content: `---
description: Verify implementation with independent validation mode
allowed-tools: All
---
${verifyPrompt}

`,
  },
};

export async function generateOpenCodeCommands(): Promise<void> {
  // Create directory
  if (!fs.existsSync(OPENCODE_COMMANDS_DIR)) {
    fs.mkdirSync(OPENCODE_COMMANDS_DIR, { recursive: true });
  }

  // Generate command files
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    const filePath = path.join(OPENCODE_COMMANDS_DIR, `${name}.md`);
    fs.writeFileSync(filePath, cmd.content);
  }
}
