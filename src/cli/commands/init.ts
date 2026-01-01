import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { CODUMENT_DIR, codumentExists } from '../utils';
import { generateClaudeCommands } from '../generators/claude';
import { generateCodexCommands } from '../generators/codex';
import { generateGeminiCommands } from '../generators/gemini';
import { generateEidolonCommands } from '../generators/eidolon';
import { TASKS_XML_SPEC } from '../templates/tasks-xml-spec';

type CLITool = 'claude' | 'codex' | 'gemini' | 'eidolon';

function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

function multiSelect(rl: readline.Interface, prompt: string, options: { key: string; label: string }[]): Promise<string[]> {
  return new Promise((resolve) => {
    console.log(prompt);
    options.forEach((opt) => {
      console.log(`  ${opt.key}. ${opt.label}`);
    });
    rl.question('请输入选项编号（逗号分隔，如 1,2,3）: ', (answer) => {
      const choices = answer.split(',').map((s) => s.trim());
      const selected = choices
        .map((c) => options.find((o) => o.key === c))
        .filter((o): o is { key: string; label: string } => o !== undefined)
        .map((o) => o.label);
      resolve(selected);
    });
  });
}

export async function initCommand(args: string[]): Promise<void> {
  const rl = createReadline();

  try {
    console.log('\n🚀 Codument Init - 规范驱动开发环境初始化\n');

    let initCodumentDir = true;
    let stepNumber = 1;

    // Check if codument directory already exists
    if (codumentExists()) {
      console.log('📁 检测到 codument/ 目录已存在\n');
      const answer = await question(rl, '是否重新初始化 codument/ 目录？(y/N): ');
      initCodumentDir = answer.toLowerCase() === 'y';
      if (!initCodumentDir) {
        console.log('  → 跳过 codument/ 目录初始化，保留现有配置\n');
      }
    }

    // Step: Select CLI tools
    console.log(`📌 步骤 ${stepNumber++}: 选择要支持的 AI CLI 工具\n`);
    const cliOptions = [
      { key: '1', label: 'Claude Code', tool: 'claude' as CLITool },
      { key: '2', label: 'OpenAI Codex CLI', tool: 'codex' as CLITool },
      { key: '3', label: 'Gemini CLI', tool: 'gemini' as CLITool },
      { key: '4', label: 'Eidolon', tool: 'eidolon' as CLITool },
    ];

    const selectedLabels = await multiSelect(
      rl,
      '请选择要支持的 CLI 工具（可多选）:',
      cliOptions
    );

    if (selectedLabels.length === 0) {
      console.log('❌ 未选择任何 CLI 工具，已取消初始化。');
      return;
    }

    const selectedTools = cliOptions
      .filter((o) => selectedLabels.includes(o.label))
      .map((o) => o.tool);

    console.log(`\n✅ 已选择: ${selectedLabels.join(', ')}\n`);

    // Initialize codument directory if needed
    let projectName = 'My Project';
    let projectDesc = '一个使用 Codument 管理的项目';

    if (initCodumentDir) {
      // Collect project info
      console.log(`📌 步骤 ${stepNumber++}: 收集项目信息\n`);
      projectName = (await question(rl, '项目名称: ')) || 'My Project';
      projectDesc = (await question(rl, '项目描述: ')) || '一个使用 Codument 管理的项目';

    // Create directory structure
    console.log(`\n📌 步骤 ${stepNumber++}: 创建目录结构...\n`);
    const dirs = [
      CODUMENT_DIR,
      path.join(CODUMENT_DIR, 'tracks'),
      path.join(CODUMENT_DIR, 'specs'),
      path.join(CODUMENT_DIR, 'archive'),
      path.join(CODUMENT_DIR, 'std'),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`  ✓ 创建 ${dir}/`);
      }
    }

    // Generate config files
    console.log(`\n📌 步骤 ${stepNumber++}: 生成配置文件...\n`);
    await generateConfigFiles(projectName, projectDesc, selectedLabels, selectedTools);
  }

  // Generate CLI-specific commands
  console.log(`\n📌 步骤 ${stepNumber++}: 生成 CLI 命令文件...\n`);

  for (const tool of selectedTools) {
    switch (tool) {
      case 'claude':
        await generateClaudeCommands();
        console.log('  ✓ 创建 .claude/commands/codument/*.md');
        break;
      case 'codex':
        await generateCodexCommands();
        console.log('  ✓ 创建 .codex/prompts/*.md');
        break;
      case 'gemini':
        await generateGeminiCommands();
        console.log('  ✓ 创建 .gemini/commands/codument/*.toml');
        break;
      case 'eidolon':
        await generateEidolonCommands();
        console.log('  ✓ 创建 .eidolon/commands/codument/*.toml');
        break;
    }
  }

  // Generate or update AGENTS.md
  console.log(`\n📌 步骤 ${stepNumber++}: 更新入口文件...\n`);
  await generateAgentsMd(selectedLabels, selectedTools);
  console.log('  ✓ 更新 AGENTS.md');

  // Update state.json if it exists
  if (codumentExists()) {
    const statePath = path.join(CODUMENT_DIR, 'state.json');
    if (fs.existsSync(statePath)) {
      try {
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        state.cli_tools = selectedTools;
        state.timestamp = new Date().toISOString();
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
        console.log('  ✓ 更新 state.json');
      } catch (e) {
        // Ignore parse errors
      }
    }
  }

  // Done
  console.log('\n' + '='.repeat(60));
  console.log('🎉 Codument 初始化完成！');
  console.log('='.repeat(60));

  if (initCodumentDir) {
    console.log(`
下一步:
  1. 编辑 codument/project.md 完善项目配置
  2. 编辑 codument/tech-stack.md 配置技术栈
  3. 运行相应的 slash command 创建第一个变更追踪
  4. 运行 codument status 查看项目状态
`);
  } else {
    console.log(`
已为以下 CLI 工具生成命令文件:
${selectedLabels.map((l) => `  - ${l}`).join('\n')}

现在可以使用对应的 slash command 了。
`);
    }
  } finally {
    rl.close();
  }
}

async function generateConfigFiles(
  projectName: string,
  projectDesc: string,
  selectedLabels: string[],
  selectedTools: CLITool[]
): Promise<void> {
  // Generate project.md
  const projectMd = `# ${projectName}

## 项目概述

${projectDesc}

## 目录结构

\`\`\`
codument/
├── project.md        # 项目配置
├── product.md        # 产品定义
├── workflow.md       # 工作流规范
├── tech-stack.md     # 技术栈配置
├── tracks.md         # track 索引
├── tracks/           # 变更追踪目录
├── specs/            # 规范目录
├── std/              # 标准规范目录（不可变）
└── archive/          # 归档目录
\`\`\`

## 支持的 CLI 工具

${selectedLabels.map((l) => `- ${l}`).join('\n')}

---

*初始化时间: ${new Date().toISOString()}*
`;

  fs.writeFileSync(path.join(CODUMENT_DIR, 'project.md'), projectMd);
  console.log('  ✓ 创建 project.md');

  // Generate product.md
  const productMd = `# ${projectName} - 产品定义

## 产品愿景

${projectDesc}

## 目标用户

- 待定义

## 核心功能

- 待定义

## 成功指标

- 待定义

---

*最后更新: ${new Date().toISOString()}*
`;

  fs.writeFileSync(path.join(CODUMENT_DIR, 'product.md'), productMd);
  console.log('  ✓ 创建 product.md');

  // Generate workflow.md
  const workflowMd = `# 项目工作流

## 指导原则

1. **规范是真实来源：** 所有工作必须在 tasks.xml 中追踪
2. **技术栈是慎重选择的：** 对技术栈的更改必须在实现前记录在 tech-stack.md 中
3. **测试驱动开发：** 在实现功能前编写单元测试
4. **高代码覆盖率：** 所有模块的代码覆盖率目标为 >80%

## 任务工作流

1. **选择任务：** 从 tasks.xml 按顺序选择下一个可用任务
2. **标记进行中：** 开始工作前，将任务状态从 \`TODO\` 改为 \`IN_PROGRESS\`
3. **编写测试：** 编写单元测试定义预期行为
4. **实现功能：** 编写使测试通过所需的最少代码
5. **验证覆盖率：** 运行覆盖率报告，目标 >80%
6. **提交代码：** 根据提交模式 (auto/manual) 处理
7. **更新任务状态：** 标记为 \`DONE\`

## 提交指南

### 消息格式
\`\`\`
<类型>(<范围>): <描述>
\`\`\`

### 类型
- \`feat\`: 新功能
- \`fix\`: Bug 修复
- \`docs\`: 文档
- \`refactor\`: 重构
- \`test\`: 测试
- \`chore\`: 维护任务
`;

  fs.writeFileSync(path.join(CODUMENT_DIR, 'workflow.md'), workflowMd);
  console.log('  ✓ 创建 workflow.md');

  // Generate tech-stack.md
  const techStackMd = `# 技术栈

## 编程语言

| 语言 | 版本 | 用途 |
|------|------|------|
| - | - | 待配置 |

## 运行时

| 运行时 | 版本 | 用途 |
|--------|------|------|
| - | - | 待配置 |

## 框架与库

| 名称 | 版本 | 用途 |
|------|------|------|
| - | - | 待配置 |

## 架构决策

待记录

---

*最后更新: ${new Date().toISOString()}*
`;

  fs.writeFileSync(path.join(CODUMENT_DIR, 'tech-stack.md'), techStackMd);
  console.log('  ✓ 创建 tech-stack.md');

  // Generate tracks.md
  const tracksMd = `# 项目变更追踪

此文件追踪项目的所有变更。每个 track 在各自的文件夹中有详细计划。

---

<!-- 新的 track 将在此处添加 -->
`;

  fs.writeFileSync(path.join(CODUMENT_DIR, 'tracks.md'), tracksMd);
  console.log('  ✓ 创建 tracks.md');

  // Generate state.json
  const stateJson = {
    active_track: null,
    current_phase: null,
    current_task: null,
    last_action: 'init',
    timestamp: new Date().toISOString(),
    commit_mode: 'manual',
    cli_tools: selectedTools,
  };

  fs.writeFileSync(
    path.join(CODUMENT_DIR, 'state.json'),
    JSON.stringify(stateJson, null, 2)
  );
  console.log('  ✓ 创建 state.json');

  // Generate std/tasks-xml-spec.md (immutable spec document)
  fs.writeFileSync(
    path.join(CODUMENT_DIR, 'std', 'tasks-xml-spec.md'),
    TASKS_XML_SPEC
  );
  console.log('  ✓ 创建 std/tasks-xml-spec.md');
}

async function generateAgentsMd(
  selectedLabels: string[],
  selectedTools: CLITool[]
): Promise<void> {
  const agentsMd = `# Codument 指令入口

本项目使用 Codument 规范驱动开发。

## 支持的 CLI 工具

${selectedLabels.map((l) => `- ${l}`).join('\n')}

## 快速开始

1. 阅读 \`codument/project.md\` 了解项目配置
2. 阅读 \`codument/workflow.md\` 了解工作流程
3. 运行 \`codument list\` 查看当前 track
4. 运行 \`codument status\` 查看项目状态

## Slash Commands

${selectedTools.includes('claude') ? `### Claude Code
- \`/codument:init\` - 初始化
- \`/codument:track\` - 创建变更追踪
- \`/codument:implement\` - 实现任务
- \`/codument:validate\` - 验证格式
- \`/codument:archive\` - 归档
- \`/codument:status\` - 查看状态
` : ''}
${selectedTools.includes('codex') ? `### Codex CLI
- \`/prompts:codument-init\` - 初始化
- \`/prompts:codument-track\` - 创建变更追踪
- \`/prompts:codument-implement\` - 实现任务
- \`/prompts:codument-validate\` - 验证格式
- \`/prompts:codument-archive\` - 归档
- \`/prompts:codument-status\` - 查看状态
` : ''}
${selectedTools.includes('gemini') ? `### Gemini CLI
- \`/codument:init\` - 初始化
- \`/codument:track\` - 创建变更追踪
- \`/codument:implement\` - 实现任务
- \`/codument:validate\` - 验证格式
- \`/codument:archive\` - 归档
- \`/codument:status\` - 查看状态
` : ''}
${selectedTools.includes('eidolon') ? `### Eidolon
- \`/codument:init\` - 初始化
- \`/codument:track\` - 创建变更追踪
- \`/codument:implement\` - 实现任务
- \`/codument:validate\` - 验证格式
- \`/codument:archive\` - 归档
- \`/codument:status\` - 查看状态
` : ''}
## 目录结构

\`\`\`
codument/
├── project.md        # 项目配置
├── product.md        # 产品定义
├── workflow.md       # 工作流规范
├── tech-stack.md     # 技术栈配置
├── tracks.md         # track 索引
├── tracks/           # 变更追踪目录
├── specs/            # 规范目录
├── std/              # 标准规范目录（不可变）
└── archive/          # 归档目录
\`\`\`

---

*由 Codument 生成 - ${new Date().toISOString()}*
`;

  fs.writeFileSync('AGENTS.md', agentsMd);
}
