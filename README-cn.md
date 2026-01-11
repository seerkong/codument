# Codument

**面向 AI 编程助手的规范驱动开发工具**

Codument 是一个 CLI 工具，为 AI 辅助软件开发带来结构化和可追溯性。它通过系统化的 "track" 工作流，帮助你管理功能开发、Bug 修复和代码重构，包含结构化的规范和任务分解。

[English Documentation](./README.md)

## 为什么选择 Codument？

在使用 AI 编程助手时，很容易忘记计划了什么、实现了什么、还有什么待完成。Codument 通过以下方式解决这个问题：

- **结构化规划**：将功能分解为阶段、任务和子任务
- **规范优先**：在编码前用 GIVEN/WHEN/THEN 格式定义需求
- **进度追踪**：追踪任务状态（TODO、IN_PROGRESS、DONE、BLOCKED）
- **多工具支持**：支持 Claude Code、OpenAI Codex CLI、Gemini CLI 和 Eidolon
- **Git 集成**：可选的自动提交和 Git Notes，实现完整的可追溯性

## 功能特性

### 基于 Track 的工作流

每个功能或 Bug 修复作为一个 "track" 进行管理，包含：
- **proposal.md** - 变更提案，包含背景和范围
- **spec.md** - GIVEN/WHEN/THEN 格式的行为规范
- **tasks.xml** - 层级化任务分解（阶段 → 任务 → 子任务）
- **metadata.json** - Track 元数据和状态

### 层级化任务管理

```
Track（变更追踪）
└── Phase（阶段 P1, P2, ...）
    └── Task（任务 T1.1, T1.2, ...）
        └── Subtask（子任务 T1.1.1, T1.1.2, ...）
```

### 支持的 AI CLI 工具

| 工具 | Slash 命令 |
|------|------------|
| Claude Code | `/codument:init`、`/codument:track`、`/codument:implement` 等 |
| OpenAI Codex CLI | `/prompts:codument-init`、`/prompts:codument-track` 等 |
| Gemini CLI | `/codument:init`、`/codument:track` 等 |
| Eidolon | `/codument:init`、`/codument:track` 等 |

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

# 可执行文件位于 dist/codument
# 可选：移动到 PATH 路径下
cp dist/codument /usr/local/bin/
```

## 快速开始

### 1. 初始化项目

```bash
cd your-project
codument init
```

这将：
- 创建 `codument/` 目录结构
- 生成配置文件
- 为你选择的 AI CLI 工具创建 slash 命令

### 2. 创建变更追踪（Track）

在你的 AI 助手中使用 slash 命令：

```
/codument:track 添加用户认证功能
```

AI 将引导你完成：
1. 讨论需求
2. 创建 GIVEN/WHEN/THEN 场景的 spec.md
3. 将任务分解为阶段和子任务
4. 选择提交模式（auto/manual）

### 3. 实现任务

```
/codument:implement
```

按照工作流：
1. 选择下一个 TODO 任务
2. 标记为 IN_PROGRESS
3. 编写测试（推荐 TDD）
4. 实现功能
5. 标记为 DONE
6. 继续下一个任务

### 4. 归档已完成的 Track

```
/codument:archive add-user-auth
```

将 track 移动到 `codument/archive/YYYY-MM-DD-add-user-auth/`

## CLI 命令

| 命令 | 描述 |
|------|------|
| `codument init` | 在当前项目初始化 Codument |
| `codument list` | 列出所有活跃的 track |
| `codument show <track-id>` | 显示 track 详情 |
| `codument status` | 显示项目状态概览 |
| `codument validate [track-id]` | 验证 track 格式 |
| `codument archive <track-id>` | 归档已完成的 track |

### 全局选项

| 选项 | 描述 |
|------|------|
| `-w, --workspace-dir <path>` | 指定工作目录 |

## 目录结构

初始化后：

```
your-project/
├── codument/
│   ├── project.md        # 项目配置
│   ├── product.md        # 产品定义
│   ├── workflow.md       # 工作流指南
│   ├── tech-stack.md     # 技术栈
│   ├── tracks.md         # Track 索引
│   ├── state.json        # 当前状态
│   ├── tracks/           # 活跃的 track
│   │   └── <track-id>/
│   │       ├── proposal.md
│   │       ├── spec.md
│   │       ├── tasks.xml
│   │       └── metadata.json
│   ├── specs/            # 共享规范
│   ├── std/              # 标准规范（不可变）
│   │   └── tasks-xml-spec.md
│   └── archive/          # 已归档的 track
├── .claude/commands/codument/     # Claude Code 命令
├── .codex/prompts/                # Codex CLI 提示词
├── .gemini/commands/codument/     # Gemini CLI 命令
├── .eidolon/commands/codument/    # Eidolon 命令
└── AGENTS.md                      # AI 代理入口文件
```

## tasks.xml 格式

```xml
<?xml version="1.0" encoding="UTF-8"?>
<track change_id="add-user-auth">
  <metadata>
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
          定义 User 模型，包含用户名、密码哈希、邮箱
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
</track>
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
- 附加 Git Notes 记录变更详情

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
- 任务分解和进度（tasks.xml）
- Git 提交历史和 Notes

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

### Q: tasks.xml 格式是否可以扩展？

A: 是的。tasks.xml 设计为可扩展格式，你可以添加自定义字段，但不应删除必需字段。

### Q: 如何处理跨 Track 的依赖？

A: 建议将有依赖关系的变更放在同一个 Track 中，或者在 Track 的 proposal.md 中明确说明依赖关系。

## 许可证

MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

---

使用 Bun 和 TypeScript 构建。
