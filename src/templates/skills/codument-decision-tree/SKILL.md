---
name: codument-decision-tree
description: 为 plan-track / plan-mission 或已有 track/mission 修订做有界决策树式澄清：先查代码和 codument owner 文档，生成 analysis/decision-tree.xnl，按 severity=auto|light|normal|deep 控制是否提问，并回写 decisions.xnl。pre-plan codument-discuss 应直接与人对话，不使用本 skill 生成文件化讨论。
---

# Codument · decision-tree

用于给 track / mission 规划或修订增加有界决策树式澄清。权威规则在工作区：

- `@/codument/std/sop/questioning.md`
- `@/codument/std/attractors/knowledge-tiers.md`

## 输入

- 当前 track 或 mission 目录，或将进入 plan-track / plan-mission 的规划目标。
- 可选 severity：`auto | light | normal | deep`；未指定默认 `light`。

## 执行

1. 先读取本地代码、测试、schema、config、behaviors、modeling、engineering、decisions、archive；能查证的问题不要问用户。
2. 写入或更新 `analysis/decision-tree.xnl`：
   - Root Question
   - Severity
   - Decision Frontier
   - Assumptions
3. 对非 auto 模式，只问当前 frontier 中最阻塞下游产物、且无法查证的问题；每题给推荐答案、完整选项、取舍和无回复默认。
4. 对 auto 模式，不提问；选择保守默认并写入 Assumptions / Evidence。
5. 把稳定决策回写 `decisions.xnl`，推荐属性 / 子节点：
   - `status`
   - `priority`
   - `blocks`
   - `<answer>`：唯一回答反馈容器
   - `<raw-answer>`：用户或外部参与者的原始回答
   - `<decision-text>`：整理后的正式决策
   - `<rationale>`：选择或归纳理由
   - `<evidence>`：支撑回答和决策的证据
   - `<options>`：决策的唯一备选方案集合，放在 decision 的 `()` 中
   - `<option>`：放在 `<options>` 自己的 `[]` 中，必须有 `key`、`<title>`、`<description>`，可补 `<tradeoff>`
   - `recommended = true`：提出带选项的新决策点时恰好标记一个推荐项
   - `durable_candidate = true`（仅长期决策候选需要）
   - `confidence` / `reversibility`（仅 durable 或高风险取舍需要）
   - 父子关系只用 decision 自身的 `[]` 嵌套 `<decision>` 表达，不把 `<options>` / `<option>` 放入该 `[]`
   - 不要把原始回答继续写成直接的 `<answer ?>...?></?>`；新写法必须使用 `<answer>` 容器和 `<raw-answer>`。

## 输出

- `analysis/decision-tree.xnl`
- 更新后的 `decisions.xnl`
- 必要时提示运行 `codument decisions validate <track-id>`
