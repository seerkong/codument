# 变更：新增领域建模 registry（codument/modeling）

## 背景和动机 (Context And Why)

codument 的 `behaviors` 经 `behavior_deltas` 标准化增删改、archive 单写，知识晋升有效；但 `docs/modeling` 是 free-form Markdown、无 mutation 协议、由 discuss 实时收敛与 archive 兜底两处“半写入”，导致 track 完成后建模基本不更新。用 DEPA 事实源视角看：modeling 缺唯一写入者、存在多个半事实源。本变更给 modeling 配上与 behaviors 同级的「单一写入者 + 可定位 mutation + track 内 delta 物料」，并把建模升级为 codument 托管、可机械合并的 registry，让项目级 attractor 真正可落盘、可收敛。

## “要做”和“不做” (Goals / Non-Goals)

**目标:**
- 把 `docs/modeling` 升级为 `codument/modeling` registry（`docs/impl` 保留）。
- registry = xnl-vfs 工作树（可读 .xnl）+ xnl-vcs（git 历史）；delta = git 分支/提交，archive = 节点级 3-way merge。
- 节点载体用 XNL，融合 DEPA 四维 + modeling + 多表征 DSL；kind 谱系从内核裸名跨领域概念到 shell 命名空间领域概念。
- CLI 分形拆分检查；archive 把设计方案按类目回写 `docs/impl`。
- `config/modeling.xml` 开关（默认关）；清理 knowledgeSync 残留。

**非目标:**
- 不自建 delta 节点类型与 apply/merge 算法 —— 复用 xnl-core/xnl-vfs/xnl-vcs。
- 不在 codument 内 fork xnl；缺能力在 xnl.ts 侧另开 track（vfs-import 解析器）。
- 不强制存量项目迁移；默认关，无 profile 即行为不变。
- 不把可测行为契约搬进 modeling（仍归 behaviors，modeling 引用 behavior://）。

## 变更内容（What Changes）

- 新增 `codument/modeling/` registry（xnl-vfs + xnl-vcs）。
- 新增 std 规范 `modeling-registry.md` / `modeling-delta.md` 与节点 schema 指南（kind 谱系 + 最小表征）。
- 新增 CLI `codument modeling lint`（分形拆分检查）；archive 增 modeling merge + docs/impl 回写步骤。
- 新增 `codument/config/modeling.xml`（仿 attractor-profiles，默认关）。
- 修改 `std/operations/track.md`（产出 modeling_delta）、`archive.md`（merge）、`implement.md`（实现期可改）。
- 新增依赖 `xnl-core` / `xnl-vfs` / `xnl-vcs`。
- **BREAKING**（仅对启用 modeling 的项目）：建模真源从 `docs/modeling` 迁移到 `codument/modeling`，格式由 Markdown 改为 XNL。
- 清理项目内 `knowledgeSync` 字符串残留。

## 影响范围（Impact）

- 受影响的功能规范：`codument-core`（新增 modeling-registry / modeling-node-schema / modeling-delta-git / modeling-fractal-split / modeling-config / modeling-docs-impl-writeback 等 requirement）。
- 受影响代码/系统：CLI（新增 lint + archive merge）、std 操作提示词、模板与 attractor、config。
- 外部依赖：xnl.ts 侧 `add-vfs-import-resolver` track（前置/并行）。
