# 变更：使用 decisions.xnl 承载过程决策

## 背景和动机 (Context And Why)

Codument 目前用 `decisions.md` 记录 track/mission 的过程决策，并用 `analysis/decision-tree.md` 表示决策树。这个 Markdown 载体便于人工阅读，但结构不稳定：字段依赖标题和列表行解析，决策树只能用表格或缩进隐式表达，后续与校验、归档提升、其他系统集成时成本较高。

本次变更将新建 track/mission 的过程决策载体改为 `decisions.xnl`，并为决策树提供一版 XNL DSL。XNL 文件根允许多个并列 `<decision>`；顶层多个 `<decision>` 是 decision forest；决策树本身用嵌套 `<decision>` 表达父子关系，不引入 `<decision-tree>` 包装节点。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**
- 设计并实现 `decisions.xnl` 作为新默认过程决策载体。
- 让 `codument decisions validate` 支持 XNL，并在 track-id 解析时优先读取 `decisions.xnl`。
- 更新 plan-track / plan-mission / decision-tree / impl / archive 等 std/template 文档中的 `decisions.md` 口径。
- 保留 legacy `decisions.md` 读取兼容，避免历史 track/archive 失效。
- 为决策树定义嵌套 XNL DSL，属性遵循 `{}` attributes 规则。

**非目标:**
- 本 track 不直接实现，先提交 DSL 与改造范围供 review。
- 不迁移所有历史 archive 的 `decisions.md` 文件。
- 不改变 `track.xml` 的 `<QuestionMode>decision-tree</QuestionMode>` 元数据语义。

## 变更内容（What Changes）

- 新增/固化 `decisions.xnl` DSL：
  - 文件根允许多个并列 `<decision>` 元素。
  - 普通节点属性放入 `{}` attributes。
  - 单例语义子节点使用 `()` extend block；decision 的 `[]` 只承载下级 `<decision>` 节点。
  - 备选方案使用唯一 `<options>` 节点；`<options>` 自己的 `[]` 承载多个 `<option>`，每个 option 使用 `<title>` / `<description>` / `<tradeoff>` 表达完整说明，并标记唯一 `recommended = true`。
  - 回答反馈使用唯一 `<answer>` 容器；原始回答使用 `<raw-answer>`，`<decision-text>` / `<rationale>` / `<evidence>` 作为其下的整理结论、理由和证据。
- CLI：
  - `codument decisions validate [file|track-id]` 支持 `.xnl`。
  - track-id 默认解析到 `codument/tracks/<id>/decisions.xnl`；缺失时 fallback 到 `decisions.md`。
- Archive：
  - 支持从 `decisions.xnl` 识别 durable decision candidate。
  - 保留 `decisions/*.md` 与 root `decisions.md` legacy promotion。
- Std/templates/skills：
  - plan-track / plan-mission / decision-tree / impl-track / verify / artifact-sync 等文档改为 `decisions.xnl` 口径。
  - 模板 manifest 同步刷新。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`codument-core`
- 受影响的代码：
  - `src/cli/commands/decisions.ts`
  - `src/cli/commands/decisions.ts`：校验 options wrapper、option key、标题/说明和唯一推荐项。
  - `src/cli/commands/decisions.ts`：读取新的 answer feedback 容器，并兼容历史直接 `<answer>` 文本节点。
  - `src/cli/commands/archive.ts`
  - `src/cli/commands/show.ts`
  - `src/templates/codument/std/**`
  - `src/templates/skills/codument-decision-tree/SKILL.md`
  - `test/cli/commands/decisions.test.ts`
  - `test/cli/commands/archive.test.ts`
  - `test/templates/**`
