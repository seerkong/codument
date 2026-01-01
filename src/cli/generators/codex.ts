/**
 * Codex CLI command generator
 * Generates ~/.codex/prompts/*.md or .codex/prompts/*.md files
 */

import * as fs from 'fs';
import * as path from 'path';

// Project-level prompts directory
const CODEX_PROMPTS_DIR = '.codex/prompts';

const COMMANDS = {
  'codument-init': {
    description: 'Initialize Codument in the current project',
    argumentHint: '[project-name]',
    content: `$ARGUMENTS

初始化 Codument：检查目录 → 收集信息 → 创建结构 → 生成 AGENTS.md
`,
  },
  'codument-track': {
    description: 'Create a new change track for a feature or bug fix',
    argumentHint: '[description]',
    content: `$ARGUMENTS

创建变更追踪（track ID: 小写英文+中横线，不含日期）：
1. 阅读 project.md/product.md 了解上下文
2. 在 \`codument/tracks/<track-id>/\` 创建：proposal.md、spec.md、tasks.xml、metadata.json
3. **等待用户确认后再实现**
`,
  },
  'codument-implement': {
    description: 'Implement tasks from a track following the workflow',
    argumentHint: '[track-id]',
    content: `$ARGUMENTS

**⚠️ 先执行 \`codument status\` 命令，禁止猜测。**

按 workflow.md 流程实现任务，执行阶段门控，更新状态。
`,
  },
  'codument-validate': {
    description: 'Validate track or spec format',
    argumentHint: '[track-id]',
    content: `$ARGUMENTS

**⚠️ 先执行 \`codument validate --strict\` 命令，禁止猜测。**

验证：目录结构、spec.md 格式、tasks.xml 格式。
`,
  },
  'codument-archive': {
    description: 'Archive a completed track',
    argumentHint: '<track-id>',
    content: `$ARGUMENTS

归档：验证 completed 状态 → 移动到 archive/ → 更新 specs/ → 移除 tracks.md 条目
`,
  },
  'codument-status': {
    description: 'Show project status overview',
    argumentHint: '',
    content: `**⚠️ 先执行 \`codument status\` 命令，禁止猜测。**

整理展示：项目进度、活跃 track、统计信息、提交模式。
`,
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
