import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { CODUMENT_DIR, codumentExists } from '../utils';
import { generateClaudeCommands } from '../generators/claude';
import { generateCodexCommands } from '../generators/codex';
import { generateEidolonCommands } from '../generators/eidolon';
import { generateOpenCodeCommands } from '../generators/opencode';
import { generateSparrowCommands } from '../generators/sparrow';
import {
  CLAUDE_WORKFLOW_SKILL_DISPLAY_PATH,
  CLAUDE_WORKFLOW_COMMAND_DISPLAY_PATH,
  CODEX_WORKFLOW_SKILL_DISPLAY_PATH,
  EIDOLON_WORKFLOW_SKILL_DISPLAY_PATH,
  EIDOLON_WORKFLOW_COMMAND_DISPLAY_PATH,
  OPENCODE_WORKFLOW_SKILL_DISPLAY_PATH,
  OPENCODE_WORKFLOW_COMMAND_DISPLAY_PATH,
  SPARROW_WORKFLOW_SKILL_DISPLAY_PATH,
} from '../../skills/codument-workflow';

import {
  stdAgentsPrompt,
  planXmlSpec,
  workflowTemplate,
  techStackTemplate,
  tracksTemplate,
  rootAgentsPrompt,
  protocolsPrompt,
} from '../../prompts'
let TASKS_XML_SPEC = planXmlSpec;
type CLITool = 'claude' | 'codex' | 'eidolon' | 'opencode' | 'sparrow';
const CODUMENT_MARKERS = {
  start: '<!-- CODUMENT:START -->',
  end: '<!-- CODUMENT:END -->',
};

function isMarkerOnOwnLine(content: string, markerIndex: number, markerLength: number): boolean {
  let leftIndex = markerIndex - 1;
  while (leftIndex >= 0 && content[leftIndex] !== '\n') {
    const char = content[leftIndex];
    if (char !== ' ' && char !== '\t' && char !== '\r') {
      return false;
    }
    leftIndex--;
  }

  let rightIndex = markerIndex + markerLength;
  while (rightIndex < content.length && content[rightIndex] !== '\n') {
    const char = content[rightIndex];
    if (char !== ' ' && char !== '\t' && char !== '\r') {
      return false;
    }
    rightIndex++;
  }

  return true;
}

function findMarkerIndex(content: string, marker: string, fromIndex = 0): number {
  let currentIndex = content.indexOf(marker, fromIndex);

  while (currentIndex !== -1) {
    if (isMarkerOnOwnLine(content, currentIndex, marker.length)) {
      return currentIndex;
    }

    currentIndex = content.indexOf(marker, currentIndex + marker.length);
  }

  return -1;
}

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
    rl.question('请输入选项编号（逗号分隔，如 1,2,3,4）: ', (answer) => {
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
      { key: '3', label: 'Eidolon', tool: 'eidolon' as CLITool },
      { key: '4', label: 'OpenCode', tool: 'opencode' as CLITool },
      { key: '5', label: 'Sparrow', tool: 'sparrow' as CLITool },
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
      path.join(CODUMENT_DIR, 'workflows'),
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
        console.log(`  ✓ 安装 ${CLAUDE_WORKFLOW_SKILL_DISPLAY_PATH}`);
        console.log(`  ✓ 创建 ${CLAUDE_WORKFLOW_COMMAND_DISPLAY_PATH}*.md`);
        break;
      case 'codex':
        await generateCodexCommands();
        console.log(`  ✓ 安装 ${CODEX_WORKFLOW_SKILL_DISPLAY_PATH}`);
        break;
      case 'eidolon':
        await generateEidolonCommands();
        console.log(`  ✓ 安装 ${EIDOLON_WORKFLOW_SKILL_DISPLAY_PATH}`);
        console.log(`  ✓ 创建 ${EIDOLON_WORKFLOW_COMMAND_DISPLAY_PATH}*.toml`);
        break;
      case 'opencode':
        await generateOpenCodeCommands();
        console.log(`  ✓ 安装 ${OPENCODE_WORKFLOW_SKILL_DISPLAY_PATH}`);
        console.log(`  ✓ 创建 ${OPENCODE_WORKFLOW_COMMAND_DISPLAY_PATH}codument-*.md`);
        break;
      case 'sparrow':
        await generateSparrowCommands();
        console.log(`  ✓ 安装 ${SPARROW_WORKFLOW_SKILL_DISPLAY_PATH}`);
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
  3. 运行相应的 AI 命令或加载生成的 workflow skill 创建第一个变更追踪
  4. 运行 codument status 查看项目状态
`);
  } else {
    console.log(`
已为以下 CLI 工具安装/生成工作流入口:
${selectedLabels.map((l) => `  - ${l}`).join('\n')}

现在可以使用对应 AI 工具入口了。
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
  const workflowMd = `# 项目级工作流

`;

  fs.writeFileSync(path.join(CODUMENT_DIR, "workflows", 'workflow.md'), workflowMd);
  console.log('  ✓ 创建 workflow.md');

  // Generate tech-stack.md
  const techStackMd = `${techStackTemplate}
---

*最后更新: ${new Date().toISOString()}*
`;

  fs.writeFileSync(path.join(CODUMENT_DIR, 'tech-stack.md'), techStackMd);
  console.log('  ✓ 创建 tech-stack.md');

  // Generate tracks.md
  const tracksMd = tracksTemplate;

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
    last_successful_step: "2.1_project"
  };

  fs.writeFileSync(
    path.join(CODUMENT_DIR, 'state.json'),
    JSON.stringify(stateJson, null, 2)
  );
  console.log('  ✓ 创建 state.json');

  fs.writeFileSync(
    path.join(CODUMENT_DIR, 'std', 'plan-xml-spec.md'),
    TASKS_XML_SPEC
  );
  console.log('  ✓ 创建 std/plan-xml-spec.md');


  fs.writeFileSync(
    path.join(CODUMENT_DIR, 'std', 'AGENTS.md'),
    stdAgentsPrompt
  );
  console.log('  ✓ 创建 std/AGENTS.md');

  fs.writeFileSync(
    path.join(CODUMENT_DIR, 'std', 'workflow.md'),
    workflowTemplate
  );
  console.log('  ✓ 创建 std/workflow.md');

  fs.writeFileSync(
    path.join(CODUMENT_DIR, 'std', 'protocols.md'),
    protocolsPrompt
  );
  console.log('  ✓ 创建 std/protocols.md');
}

async function generateAgentsMd(
  selectedLabels: string[],
  selectedTools: CLITool[]
): Promise<void> {
  void selectedLabels;
  void selectedTools;

  const managedContent = rootAgentsPrompt.trim();
  const managedBlock = `${CODUMENT_MARKERS.start}\n\n${managedContent}\n\n${CODUMENT_MARKERS.end}`;

  if (!fs.existsSync('AGENTS.md')) {
    fs.writeFileSync('AGENTS.md', managedBlock);
    return;
  }

  const existingContent = fs.readFileSync('AGENTS.md', 'utf-8');
  const startIndex = findMarkerIndex(existingContent, CODUMENT_MARKERS.start);
  const endIndex = startIndex !== -1
    ? findMarkerIndex(existingContent, CODUMENT_MARKERS.end, startIndex + CODUMENT_MARKERS.start.length)
    : findMarkerIndex(existingContent, CODUMENT_MARKERS.end);

  if (startIndex !== -1 && endIndex !== -1) {
    if (endIndex < startIndex) {
      throw new Error('Invalid CODUMENT marker order in AGENTS.md (end marker appears before start).');
    }
    const before = existingContent.substring(0, startIndex);
    const after = existingContent.substring(endIndex + CODUMENT_MARKERS.end.length);
    fs.writeFileSync('AGENTS.md', `${before}${managedBlock}${after}`);
    return;
  }

  if (startIndex === -1 && endIndex === -1) {
    const updatedContent = existingContent.trim().length > 0
      ? `${managedBlock}\n\n${existingContent}`
      : managedBlock;
    fs.writeFileSync('AGENTS.md', updatedContent);
    return;
  }

  throw new Error('Invalid CODUMENT marker state in AGENTS.md. Found only one marker.');
}
