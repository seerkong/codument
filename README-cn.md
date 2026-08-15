# Codument

**面向 AI 编程助手的规范驱动开发工具**

Codument 是一个 CLI 工具，为 AI 辅助软件开发带来结构化和可追溯性。它通过系统化的 "track" 工作流，帮助你管理功能开发、Bug 修复和代码重构，包含结构化的规范和任务分解。

[English Documentation](./README.md)

## 为什么选择 Codument？

在使用 AI 编程助手时，很容易忘记计划了什么、实现了什么、还有什么待完成。Codument 通过以下方式解决这个问题：

- **结构化规划**：把工作拆解到 `track.xml` 的阶段、任务和子任务
- **规范优先**：先用 XML behavior delta 定义需求，再编码
- **进度追踪**：从 `track.xml` 读取 NOT_STARTED / ACTIVE / DONE 等任务状态
- **Gap Loop 校验**：在收口前用 fresh 轮次做目标偏差复检与修正
- **支持 DAG 工作流**：支持 plan-track / impl-track / gap-loop / verify 命令流
- **多工具支持**：支持 Claude Code、CodeFlicker、OpenAI Codex CLI、Eidolon、Sparrow 和 OpenCode

## 功能特性

### 基于 Track 的工作流

每个功能或 Bug 修复作为一个 "track" 进行管理，通常包含：
- **proposal.md** - 变更提案，包含背景和范围
- **behavior_deltas/** - XML 行为增量（`<behavior-patch>`，旧 `spec_deltas/`）
- **track.xml** - 阶段 / 任务 / 子任务计划、状态、提交模式以及可选的 Schedule DAG
- **proposal/** 和 **design/** - 大型 track 可选的子目录
- **decisions.xnl** 和 **memory/** - track 内过程决策 forest 与记忆候选
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
| Claude Code | `.claude/skills/codument-*/` + `.claude/commands/codument/` | `/codument:init`、`/codument:track`、`/codument:gap-loop` |
| CodeFlicker | `.codeflicker/skills/codument-*/` + `.codeflicker/commands/codument/` | `/codument:init`、`/codument:track`、`/codument:gap-loop` |
| OpenAI Codex CLI | `~/.codex/skills/codument-*/` | `使用 codument:track 或 codument-track 等独立 skill` |
| Eidolon | `.eidolon/skills/codument-*/` + `.eidolon/commands/codument/` | `/codument:init`、`/codument:track`、`/codument:gap-loop` |
| Sparrow | `.sparrow/skills/codument-*/` | `使用 codument:track 或 codument-track 等独立 skill` |
| OpenCode | `.opencode/skills/codument-*/` + `.opencode/command/` | 由 `codument-*.md` 生成的 wrapper 命令文件 |

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
codument init --agent=claude,codeflicker,codex,eidolon,sparrow,opencode
```

这将：
- 创建 `codument/` 目录结构
- 生成 `codument/` 目录结构（config/*.xml、std/、tracks/、missions/、behaviors/、modeling/、engineering/、decisions/ 等）
- 生成 `codument/std/` 和 `codument/workflows/workflow.md`
- 为你选择的 target 生成对应的独立 `codument-*` skill 目录
- 对仍支持 command 的 target 额外生成 command wrapper

当传入 `--agent=<tool>[,<tool>...]` 时，`codument init` 会跳过交互式 target 选择，也不会再提示输入 project / product 名称。支持的 tool id 为 `claude`、`codeflicker`、`codex`、`eidolon`、`sparrow`、`opencode`。

### 2. 创建变更追踪（Track）

使用你所选 AI 工具生成的命令即可，例如：

```text
Claude / CodeFlicker / Eidolon / OpenCode：/codument:track 添加用户认证功能
Codex：使用 codument:track 或 codument-track 创建“添加用户认证功能”的 track
Sparrow：使用 codument:track 或 codument-track 创建“添加用户认证功能”的 track
```

对 Claude、CodeFlicker、Eidolon 和 OpenCode，这些 command wrapper 会加载对应的独立 `codument-*` skill。

助手会引导你完成：
1. 讨论需求
2. 创建 behavior delta、`proposal.md`、`design.md` 和 `track.xml`
3. 将工作拆解为阶段、任务和子任务
4. 选择提交模式（`auto` / `manual`）

### 3. 实现任务

```text
Claude / CodeFlicker / Eidolon / OpenCode：/codument:implement <track-id>
Codex：使用 codument:implement 或 codument-implement 实现 track <track-id>
Sparrow：使用 codument:implement 或 codument-implement 实现 track <track-id>
```

如果采用 DAG 波次工作流，相关命令还包括：
- `discuss`（plan-track 前置讨论）
- `gap-loop`（fresh 轮次目标偏差复检与修正）
- `verify`（独立验证）
- `archive-track`（归档）

启用 `yield-gap-loop` 时应使用 fresh round；若已有上层编排应用接管该协议，则遵循上层协议，不再在当前节点启动冲突的嵌套 loop。

### 4. 归档已完成的 Track

```text
Claude / CodeFlicker / Eidolon / OpenCode：/codument:archive add-user-auth
Codex：使用 codument:archive 或 codument-archive 归档 track add-user-auth
Sparrow：使用 codument:archive 或 codument-archive 归档 track add-user-auth
```

将 track 移动到 `codument/tracks/archived/YYYY-MM/YYYY-MM-DD-HHmm-add-user-auth/`，时间来自 track 的最后更新时间。

## 升级已有工作区

当你的项目已存在 `codument/` 目录，并且你更新了 Codument CLI 版本后，可以用下面的命令将工作区文件升级到最新内置版本：

```bash
codument upgrade-workspace
```

该命令会升级 `codument/std/`，并根据 `codument/config/cli-tools.json` 中的配置重新生成对应 AI CLI 工具的工作流入口。
对于命令型 target，会先同步工作区内的 skill 模板，再重新生成 command wrapper。
对于 Claude，会将内置 skill 模板同步到 `.claude/skills/codument-*/`。
对于 CodeFlicker，会将内置 skill 模板同步到 `.codeflicker/skills/codument-*/`。
对于 Codex，会将内置 skill 模板同步到 `~/.codex/skills/codument-*/`。
对于 Eidolon，会将内置 skill 模板同步到 `.eidolon/skills/codument-*/`。
对于 Sparrow，会将内置 skill 模板同步到 `.sparrow/skills/codument-*/`。
对于 OpenCode，会将内置 skill 模板同步到 `.opencode/skills/codument-*/`。
默认会在 `./.tmp/codument/` 下创建回滚备份。

详见 `UPGRADE_WORKSPACE.md`。

## 升级已有 Track

将单个 track（活跃或已归档）升级到当前 track.xml 约定（含 Schedule DAG 与 cdt: 节点迁移）：

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
| `codument upgrade-track <track-id-or-archive-id>` | 将单个 track 升级到当前 `track.xml` 约定 |
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
│   ├── config/
│   │   ├── modeling.xml          # modeling 默认启用开关与阈值
│   │   ├── engineering.xml
│   │   ├── attractor-profiles.xml # <cdt:AttractorCheck use="<name>"/> 的 profile 定义
│   │   ├── action-hooks.xml
│   │   └── cli-tools.json
│   ├── std/                      # 内置标准（AGENTS.md / actions / spec / methods / protocols）
│   │   ├── AGENTS.md
│   │   └── spec/
│   │       ├── track-xml-spec.md
│   │       ├── mission-xml-spec.md
│   │       ├── xnl-format.md
│   │       └── ...
│   ├── tracks/
│   │   ├── pending/<id>/         # 待批准的 track（track.xml / proposal.md / design.md / behavior_deltas/ / decisions.xnl）
│   │   ├── active/<id>/          # 执行中的 track
│   │   └── archived/YYYY-MM/     # 已归档 track
│   ├── missions/                 # 长周期 mission（pending / active / archived）
│   ├── behaviors/                # behavior 登记表（<capability>.xml）
│   ├── modeling/                 # 领域建模 XNL registry（plane/context）
│   ├── engineering/              # 工程知识 XNL registry
│   ├── decisions/                # 长期承重决策 canonical XNL registry
│   └── memory/                   # 长期记忆候选
├── .claude/skills/codument-*/    # 选择 Claude Code 时生成
├── .claude/commands/codument/    # 选择 Claude Code 时生成
├── .eidolon/skills/codument-*/   # 选择 Eidolon 时生成
└── AGENTS.md
```

## track.xml 格式

`track.xml` 是 track 的**结构 / 状态 / 调度真源**（根 `<Track xmlns:cdt="urn:codument:v1">`），由三轴组成：`TaskSpace`（结构轴）、`Schedule`（调度轴）、`Hooks`（行为轴）：

```xml
<Track id="add-user-auth" version="1" xmlns:cdt="urn:codument:v1">
  <Metadata>
    <Status>new</Status>
    <Goal>实现登录和注册功能</Goal>
    <Description>添加用户认证</Description>
    <QuestionMode>decision-tree</QuestionMode>
    <QuestionSeverity>light</QuestionSeverity>
    <CommitMode>manual</CommitMode>
  </Metadata>

  <TaskSpace id="space_add-user-auth" name="add-user-auth" version="1">
    <SubNodes>
      <!-- 第一层 TaskGroup = phase -->
      <TaskGroup id="P1" name="基础设施" status="NOT_STARTED" order="0">
        <cdt:Gate>
          <cdt:Criterion>所有 P0 任务 DONE</cdt:Criterion>
          <cdt:Criterion>测试覆盖率 &gt;80%</cdt:Criterion>
        </cdt:Gate>
        <SubNodes>
          <Task id="T1.1" name="创建用户模型" status="NOT_STARTED" order="0" priority="P0">
            <Description>定义 User 模型，包含用户名、密码哈希、邮箱</Description>
            <cdt:Acceptance>
              <cdt:Criterion id="T1.1-AC1">User 模型包含必要字段</cdt:Criterion>
            </cdt:Acceptance>
          </Task>
          <Task id="T1.2" name="实现模型与测试（TDD）" status="NOT_STARTED" order="1" priority="P0"/>
        </SubNodes>
      </TaskGroup>
    </SubNodes>
  </TaskSpace>

  <!-- 仅在被 cdt:child-mode="dag" 标记的层才声明依赖 -->
  <Schedule>
    <Dag for="P1">
      <Node id="T1.2"><After ref="T1.1"/></Node>
    </Dag>
  </Schedule>
</Track>
```

状态枚举：`NOT_STARTED` / `ACTIVE` / `DELEGATED` / `FORWARDED` / `DONE` / `REFUSED` / `ABANDONED`。
完整规范见 `codument/std/spec/track-xml-spec.md`；`codument validate` 会校验 track.xml / behavior delta / mission.xml，并以 rule-id + 文件位置 + 消息输出 AI 友好的 findings（`--json` 输出结构化结果）。
### 优先级

| 优先级 | 描述 |
|--------|------|
| P0 | 紧急 - 影响核心功能 |
| P1 | 高 - 重要但不阻塞 |
| P2 | 中 - 有则更好 |

### 任务状态

| 状态 | 描述 |
|------|------|
| NOT_STARTED | 未开始（旧 `TODO`） |
| ACTIVE | 进行中（旧 `IN_PROGRESS`） |
| DELEGATED | 已委派给子代理 |
| FORWARDED | 已转交其他 agent |
| DONE | 已完成 |
| REFUSED | 已拒绝 |
| ABANDONED | 已放弃 |

## 提交模式

### 自动模式（Auto）
- 每个任务完成后自动提交
- 阶段边界创建检查点提交
- 是否自动提交取决于所选工作流和 AI 助手的执行能力

### 手动模式（Manual）
- 由你控制何时提交
- 不执行自动 Git 操作

## 最佳实践

1. **规范优先**：始终在实现前定义 behavior delta
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
- 行为增量（XML behavior delta）
- 任务分解和进度（track.xml）
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

### Q: track.xml 格式是否可以扩展？

A: 是的。track.xml 设计为可扩展格式，你可以添加自定义字段，但不应删除必需字段；扩展节点建议使用 `cdt:` 命名空间。

### Q: 如何处理跨 Track 的依赖？

A: 建议将有依赖关系的变更放在同一个 Track 中，或者在 Track 的 proposal.md 中明确说明依赖关系。

## 许可证

MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

---

使用 Bun 和 TypeScript 构建。
