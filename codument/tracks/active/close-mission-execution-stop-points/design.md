# Design: close-mission-execution-stop-points

## 控制目标

本次变更的控制目标是"mission 自主迭代连续推进"：消除所有非用户意图导致的隐式中途停点，让停点只由显式 gate / 真实阻塞 / 终态 / 10-track checkpoint 触发。

## 事实源

- `mission.xml` / `track.xml` 是状态真源；`analysis/findings.md` 是执行期事实锚。
- `plan-track` 的 pending/批准语义只约束用户直接对话场景；mission 连续执行是它的调用方之一，需要显式调用方上下文。
- dogfood `codument/std` 与 `src/templates/codument/std` 当前一致，修改须以 `src/templates` 为源头再同步。

## 变更设计

### 1. 候选 track 激活（P0，桥接 plan-track 门禁与 impl-track active 选择）

`impl-mission` 的 ready action 为 `cdt:TrackLink state="candidate"` 时：

- `MissionApplier` 调用 `plan-track` 创建真实 track；
- `QuestionSeverity=auto`（或连续执行模式）下：**立即激活**到 `tracks/active/`、回写 `TrackLink state="bound"` + `reports/track-bind-XXX.md`，然后继续循环，不等待用户批准；
- 只有显式确认 gate（`cdt:HumanConfirm` 或显式更高 severity 且无保守默认可替代）才停在激活点。

`plan-track` 增加调用方上下文：由 `impl-mission` 以 auto 调用时，创建直接落 `tracks/active/`（"获批前不开始实现"门禁视为已由 mission 层批准）；用户直接对话场景保持 pending → 批准 → active。

### 2. 执行期 severity 继承（P1，消除规划预算泄漏为执行期停点）

问答预算（`light`/`normal`/`deep`）只作用于 plan/discuss 等规划期；进入 `impl-mission` / `impl-track` 连续执行后，未决决策按 `auto` 语义处理（把假设与保守默认写入 `decisions.xnl` / `analysis/decision-tree.xnl` 后继续），除非 mission.xml / track.xml 显式配置确认 gate。`plan-mission` 的默认 severity 建议改为 `auto`（用户未指定且目标是长时间自主迭代时）。

### 3. 子流程自主默认（P2，消除失败/续跑/措辞停点）

- `impl-track` mission 子 track 语境：任务/门控/DAG 失败先尝试任务边界内自动修复；不可自动修复 → 把失败类型、原因与建议写入 `analysis/findings.md`，返回结构化 BLOCKED 结果给 `MissionApplier` 由 mission 裁决，**不默认 `ask-single-question-closed`**。
- 续跑检测：`auto` / mission 调用默认"继续该 ACTIVE 任务"，不默认提问。
- delegated 措辞："完成即停" → "完成即返回产物与证据（stop 仅限子流程边界，调用方决定是否继续）"。
- `archive-track` mission 语境：未完成 track 的裁决交还 `MissionApplier`，不默认提问。

## 风险与缓解

- 风险：过度自动激活可能把用户想审阅的 track 直接激活。→ 缓解：只有 auto/连续执行模式才激活；非 auto 保持 pending/批准语义。
- 风险：失败分支全自动可能掩盖需用户取舍的问题。→ 缓解：记录 BLOCKED + 建议到 findings；mission 重规划时仍可触达用户；显式 gate 不受影响。
- 风险：措辞改动影响现有回归测试。→ 缓解：同步更新 `test/templates/mission-continuity.test.ts` 并新增 stop-points 测试。

## 验证

- 回归测试断言新增短语；`bun run check` 全绿。
- `bun run scripts/gen-template-manifest.ts` 重生成 manifest；`codument upgrade-workspace` 同步 dogfood 后 `codument/std` 与 `src/templates` 一致。
