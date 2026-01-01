# Codument 项目上下文

## 用途

Codument 是一个规范驱动开发（Spec-Driven Development）工具，融合了 OpenSpec 的规范管理理念和 Conductor 的产品驱动方法论，旨在帮助 AI 编程助手和开发者更好地管理软件项目的变更。

## 技术栈

- **运行时**: Node.js >= 18
- **语言**: TypeScript
- **包管理**: npm/pnpm
- **构建工具**: tsup（待定）
- **测试框架**: Vitest（待定）
- **命令行框架**: Commander.js 或 Yargs（待定）

## 项目约定

### 代码风格
- 使用 TypeScript 严格模式
- 遵循 ESLint 推荐配置
- 使用 Prettier 格式化
- 函数和类使用 JSDoc 注释

### 架构模式
- 命令行工具采用命令模式（Command Pattern）
- 提示词模板与代码逻辑分离
- 支持插件式扩展

### 测试策略
- 单元测试覆盖核心逻辑
- 集成测试覆盖命令行交互
- 目标覆盖率 >80%

### Git 工作流
- main 分支保护
- 功能开发使用 feature 分支
- 提交消息遵循 Conventional Commits

## 领域上下文

### 核心概念
- **Track**: 变更追踪单元，代表一个功能、Bug 修复或重构
- **Spec**: 规范文件，定义需求和场景
- **Phase**: 任务阶段，将任务组织成逻辑组
- **Task**: 具体实现任务

### 文件格式
- 规范使用 Markdown 格式
- 任务使用 XML 格式（便于程序化处理）
- 元数据使用 JSON 格式

## 重要约束

- 必须支持多种 AI 编程助手（Claude Code、Codex、Gemini 等）
- 提示词需支持中英文
- 不依赖特定云服务

## 外部依赖

- 无（CLI 工具独立运行）
