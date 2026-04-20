# Codument

**面向 AI 编程助手的规范驱动开发工具**

Codument 是一个 CLI 工具，为 AI 辅助软件开发带来结构化和可追溯性。它通过系统化的 "track" 工作流，帮助你管理功能开发、Bug 修复和代码重构，包含结构化的规范和任务分解。

[English Documentation](./README.md)

## 为什么选择 Codument？

在使用 AI 编程助手时，很容易忘记计划了什么、实现了什么、还有什么待完成。Codument 通过以下方式解决这个问题：

- **结构化规划**：把工作拆解到 `plan.xml` 的阶段、任务和子任务
- **规范优先**：先在 `spec.md` 中定义需求，再编码
- **进度追踪**：从 `plan.xml` 读取 TODO / IN_PROGRESS / DONE / BLOCKED 状态
- **Gap Loop 校验**：在收口前用 fresh 轮次做目标偏差复检与修正
- **支持波次工作流**：支持 discuss / plan-wave / execute-wave / verify 命令流
- **多工具支持**：支持 Claude Code、OpenAI Codex CLI、Sparrow、Eidolon 和 OpenCode

## 功能特性

### 基于 Track 的工作流

每个功能或 Bug 修复作为一个 "track" 进行管理，通常包含：
- **proposal.md** - 变更提案，包含背景和范围
- **spec.md** - 行为规范和需求增量
- **plan.xml** - 阶段 / 任务 / 子任务计划、状态、提交模式以及可选的 wave DAG
- **metadata.json** - Track 元数据和状态快照
- **design.md** - 可选的技术设计

### 层级化任务管理

```
Track（变更追踪）
└── Phase（阶段 P1, P2, ...）
    └── Task（任务 T1.1, T1.2, ...）
        └── Subtask（子任务 T1.1.1, T1.1.2, ...）
```

### 支持的 AI CLI 工具

| 工具 | 工作流入口生成位置 | 常见调用方式 |
|------|--------------------|----------------|
| Claude Code | `.claude/skills/codument-workflow/` + `.claude/commands/codument/` | `/codument:init`、`/codument:track`、`/codument:gap-loop` |
| OpenAI Codex CLI | `~/.codex/skills/codument-workflow/` | `使用 $codument-workflow 执行 init、track、implement、gap-loop、archive 等流程` |
| Sparrow | `.sparrow/skill/codument-workflow/` | `加载 codument-workflow skill 后继续对应的 Codument 生命周期流程` |
| Eidolon | `.eidolon/skills/codument-workflow/` + `.eidolon/commands/codument/` | `/codument:init`、`/codument:track`、`/codument:gap-loop` |
| OpenCode | `.opencode/skills/codument-workflow/` + `.opencode/command/` | 由 `codument-*.md` 生成的 wrapper 命令文件 |

## 安装

### 前置要求

- [Bun](https://bun.sh) 运行时（v1.0+）

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/seerkong/codument.git
cd codument

# 安装依赖
bun install

# 构建 CLI
bun run build

# 可选：安装到 ~/.local/bin（或自定义 CODUMENT_BIN_DIR）
bun run scripts/install.ts
```

构建后可执行文件位于 `dist/codument`。
安装脚本默认安装到 `~/.local/bin`，如 PATH 未包含该目录，会打印提示。

## 快速开始

### 1. 初始化项目

```bash
cd your-project
codument init
codument init --agent=claude,codex
```

这将：
- 创建 `codument/` 目录结构
- 生成 `project.md`、`product.md`、`tech-stack.md`、`tracks.md`、`state.json`
- 生成 `codument/std/` 和 `codument/workflows/workflow.md`
- 为你选择的 target 生成对应的 `codument-workflow` skill 目录
- 对仍支持 command 的 target 额外生成 command wrapper

当传入 `--agent=<tool>[,<tool>...]` 时，`codument init` 会跳过交互式 target 选择，也不会再提示输入 project / product 名称。支持的 tool id 为 `claude`、`codex`、`eidolon`、`opencode`、`sparrow`。

### 2. 创建变更追踪（Track）

使用你所选 AI 工具生成的命令即可，例如：

```text
Claude / Eidolon：/codument:track 添加用户认证功能
Codex：使用 $codument-workflow 创建 “添加用户认证功能” 的 track
Sparrow：加载 `codument-workflow` 并创建“添加用户认证功能”的 track
```

对 Claude、Eidolon 和 OpenCode，这些 command wrapper 会加载同一套共享的 `codument-workflow` sub-skill，而不是再维护一份独立 prompt 副本。

助手会引导你完成：
1. 讨论需求
2. 创建 `spec.md`、`proposal.md` 和 `plan.xml`
3. 将工作拆解为阶段、任务和子任务
4. 选择提交模式（`auto` / `manual`）

### 3. 实现任务

```text
Claude / Eidolon：/codument:implement <track-id>
Codex：使用 $codument-workflow 实现 track <track-id>
Sparrow：加载 `codument-workflow` 并实现 track <track-id>
```

如果采用 wave 工作流，生成的命令集还包括：
- `discuss`
- `plan-wave`
- `execute-wave`
- `gap-loop`
- `verify`

启用 `yield-gap-loop` 时应使用 fresh round；若已有上层编排应用接管该协议，则遵循上层协议，不再在当前节点启动冲突的嵌套 loop。

### 4. 归档已完成的 Track

```text
Claude / Eidolon：/codument:archive add-user-auth
Codex：使用 $codument-workflow 归档 track add-user-auth
Sparrow：加载 `codument-workflow` 并归档 track add-user-auth
```

将 track 移动到 `codument/archive/YYYY-MM-DD-add-user-auth/`。

## 升级已有工作区

当你的项目已存在 `codument/` 目录，并且你更新了 Codument CLI 版本后，可以用下面的命令将工作区文件升级到最新内置版本：

```bash
codument upgrade-workspace
```

该命令会升级 `codument/std/`，并根据 `codument/state.json` 中的 `cli_tools` 重新生成对应 AI CLI 工具的工作流入口。
对于命令型 target，会先同步工作区内的 skill 模板，再重新生成 command wrapper。
对于 Codex，会将内置 skill 模板同步到 `~/.codex/skills/codument-workflow/`。
对于 Claude，会将内置 skill 模板同步到 `.claude/skills/codument-workflow/`。
对于 Eidolon，会将内置 skill 模板同步到 `.eidolon/skills/codument-workflow/`。
对于 OpenCode，会将内置 skill 模板同步到 `.opencode/skills/codument-workflow/`。
对于 Sparrow，会将内置 skill 模板同步到 `.sparrow/skill/codument-workflow/`。
默认会在 `./.tmp/codument/` 下创建回滚备份。

详见 `UPGRADE_WORKSPACE.md`。

## 升级已有 Track

将单个 track（活跃或已归档）升级到支持波次的新 plan.xml 版本：

```bash
codument upgrade-track <track-id-或-archive-id>
```

详见 `UPGRADE_TRACK.md`。

## CLI 命令

| 命令 | 描述 |
|------|------|
| `codument init [--agent <tool[,tool...]>]` | 初始化当前项目中的 Codument；传入 `--agent` 时跳过 target 提示 |
| `codument list [--specs] [--json]` | 列出活跃 track 或 specs |
| `codument show <id> [--type track\|spec] [--json]` | 显示 track 或 spec 详情 |
| `codument status` | 显示项目状态概览 |
| `codument validate [id] [--type track\|spec] [--strict]` | 验证 track 或 spec |
| `codument archive <track-id> [--skip-specs] [--yes]` | 归档已完成的 track |
| `codument upgrade-workspace [--no-backup] [--backup-dir <path>]` | 升级内置工作区文件和 AI 命令 |
| `codument upgrade-track <track-id-or-archive-id> [--mode wave\|sequential]` | 将单个 track 升级到当前 `plan.xml` 约定 |
| `codument --help` / `codument --version` | 显示帮助或版本号 |

### 全局选项

| 选项 | 描述 |
|------|------|
| `-w, --workspace-dir <path>` | 指定工作目录 |

## 目录结构

初始化后：

```text
your-project/
├── codument/
│   ├── project.md
│   ├── product.md
│   ├── tech-stack.md
│   ├── tracks.md
│   ├── state.json
│   ├── std/
│   │   ├── AGENTS.md
│   │   ├── plan-xml-spec.md
│   │   ├── workflow.md
│   │   └── protocols.md
│   ├── workflows/
│   │   └── workflow.md
│   ├── tracks/
│   │   └── <track-id>/          # 由 AI 命令后续创建
│   │       ├── proposal.md
│   │       ├── spec.md
│   │       ├── plan.xml
│   │       ├── metadata.json
│   │       ├── design.md        # 可选
│   │       ├── analysis/        # 可选，规划产物
│   │       ├── context.md       # 可选，wave 工作流
│   │       ├── state.md         # 可选，wave 工作流
│   │       ├── phases/          # 可选，wave 工作流
│   │       └── waves/           # 可选，wave 工作流
│   ├── specs/
│   └── archive/
├── .claude/skills/codument-workflow/  # 选择 Claude Code 时生成
├── .claude/commands/codument/    # 选择 Claude Code 时生成
├── .sparrow/skill/codument-workflow/  # 选择 Sparrow 时生成
├── .eidolon/skills/codument-workflow/ # 选择 Eidolon 时生成
├── .eidolon/commands/codument/   # 选择 Eidolon 时生成
├── .opencode/skills/codument-workflow/ # 选择 OpenCode 时生成
├── .opencode/command/            # 选择 OpenCode 时生成
├── AGENTS.md
└── ~/.codex/skills/codument-workflow/  # 选择 Codex CLI 时生成
```

## plan.xml 格式

```xml
<?xml version="1.0" encoding="UTF-8"?>
<plan>
  <metadata>
    <track_id>add-user-auth</track_id>
    <track_name>添加用户认证</track_name>
    <goal>实现登录和注册功能</goal>
    <created_at>2026-01-01T10:00:00Z</created_at>
    <updated_at>2026-01-01T10:00:00Z</updated_at>
    <status>new</status>
    <commit_mode>auto</commit_mode>
  </metadata>

  <phases>
    <phase id="P1" name="基础设施">
      <goal>搭建认证基础架构</goal>
      <tasks>
        <task id="T1.1" name="创建用户模型" status="TODO" priority="P0">
          <description>定义 User 模型，包含用户名、密码哈希、邮箱</description>
          <acceptance_criteria>
            <criterion id="T1.1-AC1" checked="false">User 模型包含必要字段</criterion>
          </acceptance_criteria>
          <subtasks>
            <subtask id="T1.1.1" name="编写测试" status="TODO" estimated_hours="2"/>
            <subtask id="T1.1.2" name="实现模型" status="TODO" estimated_hours="4"/>
          </subtasks>
        </task>
      </tasks>
      <gate_criteria>
        <criterion>所有 P0 任务完成</criterion>
        <criterion>测试覆盖率 >80%</criterion>
      </gate_criteria>
    </phase>
  </phases>

  <summary>
    <total_phases>1</total_phases>
    <total_tasks>1</total_tasks>
    <completed>0</completed>
    <in_progress>0</in_progress>
    <todo>1</todo>
    <blocked>0</blocked>
  </summary>
</plan>
```

### 优先级

| 优先级 | 描述 |
|--------|------|
| P0 | 紧急 - 影响核心功能 |
| P1 | 高 - 重要但不阻塞 |
| P2 | 中 - 有则更好 |

### 任务状态

| 状态 | 描述 |
|------|------|
| TODO | 待处理 |
| IN_PROGRESS | 进行中 |
| DONE | 已完成 |
| BLOCKED | 被阻塞 |
| CANCELLED | 已取消 |

## 提交模式

### 自动模式（Auto）
- 每个任务完成后自动提交
- 阶段边界创建检查点提交
- 是否自动提交取决于所选工作流和 AI 助手的执行能力

### 手动模式（Manual）
- 由你控制何时提交
- 不执行自动 Git 操作

## 最佳实践

1. **规范优先**：始终在实现前定义 spec.md
2. **小任务**：将任务分解为 1-4 小时的小块
3. **TDD 工作流**：实现前先编写测试
4. **阶段门控**：在进入下一阶段前验证门控标准
5. **定期检查状态**：运行 `codument status` 追踪进度

## 核心优势

### 1. 规范驱动

Codument 强制先定义规范再实现代码。通过 GIVEN/WHEN/THEN 格式，你可以：
- 清晰定义预期行为
- 为 AI 助手提供明确的实现目标
- 生成可验证的验收标准

### 2. 可追溯性

每个变更都有完整的文档记录：
- 变更背景和动机（proposal.md）
- 行为规范（spec.md）
- 任务分解和进度（plan.xml）
- 相关实现记录与状态追踪

### 3. AI 友好

专门为 AI 编程助手设计：
- 结构化的任务描述便于 AI 理解
- 验收标准提供明确的完成定义
- 阶段门控防止 AI 跳过测试或质量检查

### 4. 多工具兼容

一套规范，多种 AI 工具可用：
- 无需为不同 AI 工具重复配置
- 统一的工作流和命令结构
- 轻松在不同 AI 助手间切换

## 工作流示意

```
┌─────────────────────────────────────────────────────────────┐
│                     Codument 工作流                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐  │
│  │  Init   │───▶│  Track  │───▶│Implement│───▶│ Archive │  │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘  │
│       │              │              │              │        │
│       ▼              ▼              ▼              ▼        │
│  创建目录结构    定义规范和     逐个实现任务    归档完成的   │
│  选择 AI 工具    分解任务        阶段门控        Track      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 常见问题

### Q: Codument 和普通的任务管理工具有什么区别？

A: Codument 专门为 AI 辅助开发设计。它：
- 将任务与代码规范紧密关联
- 提供 AI 可理解的结构化格式
- 集成到 AI CLI 工具的工作流中

### Q: 我需要使用所有支持的 AI 工具吗？

A: 不需要。在 `codument init` 时选择你实际使用的工具即可。

### Q: plan.xml 格式是否可以扩展？

A: 是的。plan.xml 设计为可扩展格式，你可以添加自定义字段，但不应删除必需字段。

### Q: 如何处理跨 Track 的依赖？

A: 建议将有依赖关系的变更放在同一个 Track 中，或者在 Track 的 proposal.md 中明确说明依赖关系。

## 许可证

MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

---

使用 Bun 和 TypeScript 构建。
