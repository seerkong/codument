/**
 * OpenCode command generator
 * Generates .opencode/command/*.md files
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  initPrompt, trackPrompt,
  implementPrompt, validatePrompt,
  archivePrompt, statusPrompt
} from '../../prompts'

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

The user has requested the following change track.
<UserRequest>
  $ARGUMENTS
</UserRequest>


${trackPrompt}
`,
  },
  'codument-implement': {
    description: 'Implement tasks from a track',
    content: `---
description: Implement tasks from a track following the workflow
allowed-tools: All
---

The user has requested to implement the following change track. 
Find the change track and follow the instructions below. 
If you're not sure or if ambiguous, ask for clarification from the user.
<UserRequest>
  $ARGUMENTS
</UserRequest>

${implementPrompt}
`,
  },
  'codument-validate': {
    description: 'Validate track or spec format',
    content: `---
description: Validate track or spec format
allowed-tools: All
---

<ChangeId>
  $ARGUMENTS
</ChangeId>

${validatePrompt}
`,
  },
  'codument-archive': {
    description: 'Archive a completed track',
    content: `---
description: Archive a completed track
allowed-tools: All
---

<ChangeId>
  $ARGUMENTS
</ChangeId>

${archivePrompt}
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
