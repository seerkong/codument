/**
 * Gemini CLI command generator
 * Generates .gemini/commands/codument/*.toml files
 */

import * as fs from 'fs';
import * as path from 'path';

const GEMINI_COMMANDS_DIR = '.gemini/commands/codument';

const COMMANDS = {
  init: {
    description: 'Initialize Codument in the current project',
    prompt: `{{args}}

初始化 Codument：检查目录 → 收集信息 → 创建结构 → 生成 AGENTS.md
`,
  },
  track: {
    description: 'Create a new change track for a feature or bug fix',
    prompt: `{{args}}

创建变更追踪（track ID: 小写英文+中横线，不含日期）：
1. 阅读 project.md/product.md 了解上下文
2. 在 \`codument/tracks/<track-id>/\` 创建：proposal.md、spec.md、tasks.xml、metadata.json
3. **等待用户确认后再实现**

参考：\`codument/std/tasks-xml-spec.md\`
`,
  },
  implement: {
    description: 'Implement tasks from a track following the workflow',
    prompt: `{{args}}

**⚠️ 先执行 \`codument status\` 命令，禁止猜测。**

按 workflow.md 流程实现任务，执行阶段门控，更新状态。
`,
  },
  validate: {
    description: 'Validate track or spec format',
    prompt: `{{args}}

**⚠️ 先执行 \`codument validate --strict\` 命令，禁止猜测。**

验证：目录结构、spec.md 格式、tasks.xml 格式。
`,
  },
  archive: {
    description: 'Archive a completed track',
    prompt: `{{args}}

归档：验证 completed 状态 → 移动到 archive/ → 更新 specs/ → 移除 tracks.md 条目
`,
  },
  status: {
    description: 'Show project status overview',
    prompt: `**⚠️ 先执行 \`codument status\` 命令，禁止猜测。**

整理展示：项目进度、活跃 track、统计信息、提交模式。
`,
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
