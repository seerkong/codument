# 设计：规范-示例-校验器一致性修复（CLI 优先）

## 1. 修复原则

1. **确定性逻辑 → CLI**。凡能写成确定性判定的规则（枚举成员、引用存在性、必填表征存在性、属性取值合法性），一律在 CLI 校验器中实现；AI 提示词只保留流程路由与无法自动判定的内容性指导。
2. **CLI 输出 AI 友好**。每条 finding 结构化输出：`rule-id`、文件、行/位置、`severity`、消息；支持 `--json` 稳定序列化，human 输出保留摘要与修复提示。AI 直接消费结构化输出，不再依赖提示词里的自检清单做确定性检查。
3. **示例即契约**。规范中的 canonical 示例必须能通过自身校验器；修正后的示例固化为 test fixture，防止回归。
4. **无法确定性判定的内容性项**：在规范中明确标注「评审项（非 CLI 强制）」，与 CLI 强制项区分，避免「声明必带、实际不校验」的过度承诺。
5. **不重复堆提示词**。validate.md 等提示词中的确定性校验清单逐步收缩为「调用 CLI 并消费输出」；CLI 负责规则，提示词负责路由与解释。

## 2. 各冲突的修复设计

### 2.1 冲突 1/2：track-xml-spec 示例修正（文档 + fixture）
- §4 示例：P2/P3/T2.1/T3.1 `status="TODO"` → `NOT_STARTED`（保持其余 DONE/ACTIVE 语义不变，示例表达「已开始/未开始/完成」混合进度）。
- §5 示例：把 `<Dag for="P1">` 改为引用 §4 中实际存在且标记 `cdt:child-mode="dag"` 的层。方案：给 §4 的 P1 补 `cdt:child-mode="dag"` 属性，并把 §5 Dag 的 Node id / After ref 改为 P1 的直接下层（T1.1、T1.2 及其内部 T1.2.1/T1.2.2 之外的直接下层，如新增 T1.3 任务并同步补进 §4 树，或改为引用 T1.2 组内任务——注意 After ref 必须是该层**直接下层**，组内任务 T1.2.1 不是 P1 的直接下层，不能引用）。
  - 推荐：在 §4 的 P1 中补一个真实存在的 `T1.3` 任务（如「补充导出文档与样例」），P1 标 `cdt:child-mode="dag"`，§5 的 `<Dag for="P1">` 保留 `T1.3` 引用但 After ref 指向 T1.1/T1.2 两个真实直接下层。
- 防回归：新增 `test/resources/validate/track-spec-example.xml`（§4+§5 组合示例），在 `validate.test.ts` 断言 `codument validate` 通过。

### 2.2 冲突 3/4：mission 校验器补齐（CLI 核心交付）
`src/cli/mission/validate.ts` 增加（沿用 track 校验器同款风格与 rule-id）：
- `mission.metadata.status`：`Metadata.Status ∈ pending|active|completed|cancelled|superseded|archived`，且与目录位置（pending/active/archived）一致性提示（warning 级，因 archive 后仍在 active/ 的 completed 允许存在）。
- `mission.node.status`：TaskGroup/Task `status ∈ NOT_STARTED|ACTIVE|DONE|BLOCKED|ABANDONED|SUPERSED`（mission §6 词表，独立于 track 词表；二者差异在 spec 中明示）。
- `mission.hook.on`：`track:before|after`、`phase:before|after`、`task:before|after`、`mission:after-node`。
- `mission.reconcile`：`<cdt:MissionReconcile>` 的 `max-tracks`（正整数）、`on-limit`（checkpoint|continue|block）、`on-drift`（replan-or-block|replan|block）取值合法。
- `mission.schedule`：`<Dag for>` 必须引用 `cdt:child-mode="dag"` 的节点；Node id / After ref 只能引用该层直接下层；无环。
- `mission.tracklink`：`cdt:TrackLink` 只允许挂在叶子 `Task`（TaskGroup 上出现则 error）；`project-ref` 必须在 `cdt:ProjectRefs` 中。
- 接线：`codument validate <mission-id>` 或 `codument validate --missions` 可触发；在 `codument-mission` 系列命令（plan/impl/archive）调用点同步生效。
- mission-xml-spec.md §6 措辞修正：删除「复用 track TaskSpace 状态」的误导表述，明示 mission 独立词表及与 track 词表的映射（DELEGATED/FORWARDED/REFUSED 不适用于 mission；BLOCKED/SUPERSED 为 mission 专有），并移除「后续再扩 validator」的临时性注记。

### 2.3 冲突 5：decisions pending 语义（CLI 规则调整）
- `codument decisions validate`：`status="pending"` → warning（`decision.pending-authoring`），允许规划期作者态存在；blocking decision 且 status 未决（非 accepted/resolved/deferred）维持 warning；**不阻断** validate 退出码（warning 不置非零）。
- 归档 gate（archive 流程内）与 registry promotion：`durable_candidate=true` 且状态未 resolve → error（`decision.durable-unresolved`），阻止提升。
- 同步：`decision-tree.md` L24「resolve the child rather than leaving a dead pending node」保留（鼓励收敛），但不再与校验器矛盾；`validate.md` 中关于 pending 的表述改为指向 CLI 行为。
- 测试：pending → exit 0 + warning；pending+durable_candidate 归档 → error。

### 2.4 冲突 6：modeling 确定性最小表征（CLI + 规范标注）
- CLI 强制（确定性可判定）：
  - state-machine：mermaid 表征必须包含状态定义（文本含 `state`/节点定义行或显式 `<states>` 槽位）。
  - component：必须含 `ctrl|rule|dataflow` 之一 `<pseudo>` 槽位。
  - port：必须含 `command|message` 标注（属性 `port_kind` 或文本槽位）。
  - policy：必须含 rule-pseudo 或 `behavior://` 引用（`behaviors` 属性或 `<rule>` 槽位）。
- 非 CLI 强制（内容质量，规范标注「评审项」）：entity invariants 文本质量、actor 单写边界论述/偏重/解环决策。
- `modeling-registry.md` 与 `modeling-node-schema.md` 措辞统一：表格新增「CLI 强制 / 评审项」列；registry.md 的「最小必备表征（CLI 校验）」改为引用 node-schema 的强制列。
- 兼容：`test/resources/modeling-showcase` 已满足全部强制项（module/capsule 已带 depends_on+capsule-tree；component 已带 pseudo；port 已带 port_kind；actor 保持评审项）。

### 2.5 冲突 8：on-exhausted 严格化（CLI）
- `validate.ts`：`on-exhausted` 非 `block|continue|fail` → error（`gap-loop.on-exhausted-illegal`），与 §9.5 strict 对齐。
- 核对 `<cdt:AttractorCheck use>`：`use` 无法在 `config/attractor-profiles.xml` 解析 → error（`attractor-check.profile-unresolved`），输出候选 profile 名列表帮助修复。

### 2.6 冲突 7：README-cn 与 docs 更新（文档）
- `README-cn.md`：全量对齐当前结构（track.xml / behavior_deltas / NOT_STARTED 枚举 / config XML / mission），删除 feature.json/state.json 生成描述；示例改用当前格式。
- `docs/codument-xml-configs.md`：改写为当前 XML 配置（track.xml Hooks、attractor-profiles.xml、action-hooks.xml）；无法对应到当前能力的旧项（operation-hooks 的 TODO 状态）更新为新状态枚举或标注 legacy 指向 std/spec。

### 2.7 findings 输出统一（冲突 1/3/4/5/6/8 的公共底座）
统一输出模型：`{ rule, file, line?, node?, severity: 'error'|'warning', message }`。所有校验命令（validate / decisions validate / modeling validate / mission validate）共用；`--json` 输出数组，human 输出带颜色的表格。此改动为后续所有 CLI 校验的 AI 消费打底。

## 3. 风险与兼容

| 风险 | 缓解 |
|---|---|
| mission 校验收紧使既有 workspace mission 报错 | 当前 `codument/missions/active/evolve-codument-action-system/mission.xml` 已符合规范（DONE 状态、mission:after-node、TaskSpace dag）；上线前以其为回归样例 |
| modeling 最小表征收紧影响第三方 registry | 强制项均为 showcase 已满足的确定性规则；error 消息带 rule-id 与修复提示；内容性项保持评审项 |
| decisions pending 降级引入「pending 永久残留」 | 归档 gate 对 durable 未决仍报 error；协议保留「resolve the child」指导 |
| 示例修正与既有文档引用不一致 | 所有文档修正同步到 `src/templates/codument/std/**`（gen:templates 后 upgrade-workspace dogfood 验证） |
| on-exhausted 升级 error 导致既有 track 校验失败 | 检索现有 track/示例，确认无非法取值后再提升；spec 与实现同步 |

## 4. 验证路径

1. 单元/集成测试：`bun run check`。
2. 命令实测：`codument validate`（含新 mission fixture）、`codument decisions validate`（pending warning 样例）、`codument modeling validate --deltas <track-id>`（新强制项正反样例）、`--json` 输出样例。
3. Dogfood：`bun run gen:templates && codument upgrade-workspace` 后 `git diff` 确认模板与工作区一致。
4. 收口：`codument-verify` fresh 子代理实测，出具 `reports/verify-report.md` 逐条关闭冲突 1~8。
