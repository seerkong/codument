# 变更：将长期 Decision Registry 升级为完整 XNL 合并

## 背景和动机 (Context And Why)

当前 archive 对 `decisions.xnl` 的 durable decision 提升是有损的：实现先递归展平 decision tree，再只提取少数字段，最后为每条记录生成时间戳目录下的 `decision.md` 摘要。该过程会丢失 `question`、`recommendation`、`options`、`depends_on`、`activation`、`derived_from`、未知扩展字段和父子层级。

此外，当前实现把根 `decisions.xnl` 与 `decisions/` 视为互斥来源：只要 `decisions/` 存在，就不再读取根文件；`decisions/` 也只扫描直接子级 Markdown 文件。这与期望的 track/mission 决策模型不一致。长期 registry 应当是 track/mission 根 `decisions.xnl` 与层级化 `decisions/**/*.xnl` 的完整 XNL 合并结果，而不是 Markdown 投影。

本变更同时补齐历史迁移能力，并在当前仓库的 `codument/decisions/` 上执行 dogfood 迁移。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**

- 将 `codument/decisions/**/*.xnl` 定义为长期 Decision Registry 的 canonical 真源。
- 从 track/mission 根 `decisions.xnl` 和递归 `decisions/**/*.xnl` 同时发现 durable decision。
- 保留完整 XNL AST、稳定 decision id、嵌套层级、依赖/激活关系、回答反馈、选项及扩展字段。
- 按 decision id 做节点级合并与冲突检测；`decision://<id>` 不依赖物理文件路径。
- 把 decision registry 纳入 archive 的 prepare → validate/conflict-detect → stage → commit/rollback 边界。
- 保留 Markdown 作为 legacy migration input，但不再把它作为新 durable registry 的输出格式。
- 扩展 `codument-migrate`，支持历史 decisions 的可追溯迁移。
- build、升级当前 workspace，并迁移 `codument/decisions/` 中现有历史内容。

**非目标:**

- 不重写 XNL 语法或通用 parser。
- 不自动解决语义冲突或臆造历史缺失字段。
- 不在本 track 中启用 modeling 或 engineering registry。
- 不改变非 durable 过程决策的归档资格规则。
- 不删除 archive 中作为 provenance 的原始决策文件。

## 变更内容（What Changes）

- **BREAKING**：长期 decision registry 的 canonical 文件从时间戳目录中的 `decision.md` 改为递归 XNL registry。
- 新增通用 decision registry loader/index/serializer/merge 能力，按稳定 `#id` 管理节点。
- archive 同时扫描根 `decisions.xnl` 与递归 `decisions/**/*.xnl`，不再因某一来源存在而压制另一来源。
- 重复 id 进入节点级 merge/conflict 流程，不再生成多个重复 Markdown 摘要。
- archive 在移动 track/mission 前完成 decision registry 的解析、合并、校验和 staging。
- decisions validate/show/VFS 支持递归 registry 与全局 `decision://<id>` 解析。
- 更新 decision 相关 std、模板和回归测试，明确 Markdown 只用于 legacy input。
- 更新 `src/templates/skills/codument-migrate/SKILL.md`，新增 `references/decision-migration.md`。
- 更新权威 `src/templates/codument/std/actions/migrate.md`，使 `what` 支持 `decisions | all`。
- build 时刷新 `src/templates/manifest.ts`，随后运行 `upgrade-workspace`。
- 对现有 `codument/decisions/` 建立备份/manifest，恢复 archive 中的完整 XNL 节点，并安全转换仅有 Markdown 的历史记录。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`codument-core`
- 受影响的代码：
  - `src/cli/commands/decisions.ts`
  - `src/cli/commands/archive.ts`
  - `src/cli/commands/show.ts`
  - `src/cli/utils/vfs.ts` 及 decision URI 解析路径
  - `src/cli/modeling/{registry,merge}.ts`
  - `src/cli/engineering/{registry,merge}.ts`
  - 新增或重构的通用 XNL registry/merge 模块
- 受影响的模板与规范：
  - `src/templates/codument/std/actions/migrate.md`
  - decision/archive/VFS 相关 std
  - `src/templates/skills/codument-migrate/SKILL.md`
  - `src/templates/skills/codument-migrate/references/decision-migration.md`
  - `src/templates/manifest.ts`
- 受影响的数据：
  - `codument/decisions/**`
  - archive 中作为历史恢复来源的 `decisions.xnl`、`decisions/**/*.xnl` 与 legacy Markdown decisions

