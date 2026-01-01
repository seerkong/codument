# Codument 指令入口

本项目使用 Codument 规范驱动开发。

## 支持的 CLI 工具

- Claude Code
- OpenAI Codex CLI
- Gemini CLI
- Eidolon

## 快速开始

1. 阅读 `codument/project.md` 了解项目配置
2. 阅读 `codument/workflow.md` 了解工作流程
3. 运行 `codument list` 查看当前 track
4. 运行 `codument status` 查看项目状态

## Slash Commands

### Claude Code
- `/codument:init` - 初始化
- `/codument:track` - 创建变更追踪
- `/codument:implement` - 实现任务
- `/codument:validate` - 验证格式
- `/codument:archive` - 归档
- `/codument:status` - 查看状态

### Codex CLI
- `/prompts:codument-init` - 初始化
- `/prompts:codument-track` - 创建变更追踪
- `/prompts:codument-implement` - 实现任务
- `/prompts:codument-validate` - 验证格式
- `/prompts:codument-archive` - 归档
- `/prompts:codument-status` - 查看状态

### Gemini CLI
- `/codument:init` - 初始化
- `/codument:track` - 创建变更追踪
- `/codument:implement` - 实现任务
- `/codument:validate` - 验证格式
- `/codument:archive` - 归档
- `/codument:status` - 查看状态

### Eidolon
- `/codument:init` - 初始化
- `/codument:track` - 创建变更追踪
- `/codument:implement` - 实现任务
- `/codument:validate` - 验证格式
- `/codument:archive` - 归档
- `/codument:status` - 查看状态

## 目录结构

```
codument/
├── project.md        # 项目配置
├── product.md        # 产品定义
├── workflow.md       # 工作流规范
├── tech-stack.md     # 技术栈配置
├── tracks.md         # track 索引
├── tracks/           # 变更追踪目录
├── specs/            # 规范目录
└── archive/          # 归档目录
```

---

*由 Codument 生成 - 2026-01-01T19:59:37.359Z*
