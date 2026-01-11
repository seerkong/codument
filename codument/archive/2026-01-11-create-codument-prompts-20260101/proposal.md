# 变更：创建 Codument 核心提示词和规范

## 背景

需要创建一个新的 spec coding 工具 Codument，融合 OpenSpec 的规范驱动理念和 Conductor 的产品驱动方法论。该工具将帮助 AI 编程助手和开发者以结构化、可追溯的方式管理软件变更。

## 变更内容

- 创建 AI 助手核心指令文档（agents.md）
- 创建 slash commands 提示词：init、track、implement、validate、archive、status
- 创建模板文件：project.md、product.md、workflow.md
- 创建 tasks.xml 格式规范
- 创建 AGENTS.md 入口文件
- 设置 codument/ 目录结构和初始规范文件

## 影响范围

- 受影响的规范：全新创建
- 受影响的代码：src/prompts/（提示词文件）
- 受影响的目录：codument/（规范目录）
