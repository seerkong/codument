/**
 * Claude Code command generator
 * Generates .claude/commands/codument/*.md files
 */

import * as fs from 'fs';
import * as path from 'path';

const CLAUDE_COMMANDS_DIR = '.claude/commands/codument';

const COMMANDS = {
  init: {
    description: 'Initialize Codument in the current project',
    content: `---
description: Initialize Codument in the current project
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

$ARGUMENTS

初始化 Codument：检查目录 → 收集信息 → 创建结构 → 生成 AGENTS.md
`,
  },
  track: {
    description: 'Create a new change track',
    content: `---
description: Create a new change track for a feature or bug fix
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

$ARGUMENTS

创建变更追踪（track ID: 小写英文+中横线，不含日期）：
1. 阅读 project.md/product.md 了解上下文
2. 在 \`codument/tracks/<track-id>/\` 创建：proposal.md、spec.md、tasks.xml、metadata.json
3. **等待用户确认后再实现**

参考：\`codument/std/tasks-xml-spec.md\`
`,
  },
  implement: {
    description: 'Implement tasks from a track',
    content: `---
description: Implement tasks from a track following the workflow
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

$ARGUMENTS

**⚠️ 先执行 \`codument status\` 命令，禁止猜测。**

按 workflow.md 流程实现任务，执行阶段门控，更新状态。
`,
  },
  validate: {
    description: 'Validate track or spec format',
    content: `---
description: Validate track or spec format
allowed-tools: Read, Bash, Glob, Grep
---

$ARGUMENTS

**⚠️ 先执行 \`codument validate --strict\` 命令，禁止猜测。**

验证：目录结构、spec.md 格式、tasks.xml 格式。
`,
  },
  archive: {
    description: 'Archive a completed track',
    content: `---
description: Archive a completed track
allowed-tools: Read, Write, Edit, Bash, Glob
---

$ARGUMENTS

归档：验证 completed 状态 → 移动到 archive/ → 更新 specs/ → 移除 tracks.md 条目
`,
  },
  status: {
    description: 'Show project status overview',
    content: `---
description: Show project status overview
allowed-tools: Read, Bash, Glob
---

**⚠️ 先执行 \`codument status\` 命令，禁止猜测。**

整理展示：项目进度、活跃 track、统计信息、提交模式。
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
