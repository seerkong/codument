# 变更：修复规范声明 / 示例 / CLI 校验器之间的格式与规则冲突

## 背景和动机 (Context And Why)

对当前项目做了一轮「提示词声明格式 (1) / 给出的示例 (2) / 校验规则 (3)」三方一致性审查，确认存在 8 处不一致（证据与行号见 `analysis/findings.md`）：

1. **冲突 1（error 级）**：`std/spec/track-xml-spec.md` §4 官方示例 4 处使用已废弃的 `status="TODO"`（P2/P3/T2.1/T3.1），而同一规范 §4 L124 声明的枚举与 `validate.ts` `NODE_STATUS`（及测试断言）都不含 TODO → 照抄示例必被 `codument validate` 判 error。
2. **冲突 2（error 级）**：同一规范 §5 Schedule 示例违反 §9.4 strict 规则——`<Dag for="P1">` 引用了未标 `cdt:child-mode="dag"` 的 P1，且引用 §4 树中不存在的 `T1.3`。
3. **冲突 3（规则缺失）**：`std/spec/mission-xml-spec.md` §6 先说「复用 track TaskSpace 状态」却列出不同的枚举（含 BLOCKED/SUPERSED，缺 DELEGATED/FORWARDED/REFUSED），且 `mission/validate.ts` 完全不校验任何状态；规范自己承认 validator 只支持 track 枚举。
4. **冲突 4（规则缺失）**：mission 专用 `<Hook on="mission:after-node"><cdt:MissionReconcile/></Hook>` 不在 track 校验器 `HOOK_POINTS` 中，mission 校验器也不查 Hook → 幽灵语法。
5. **冲突 5（三方正面冲突）**：`decision-tree.md` 协议与 `xnl-format.md` 示例都要求/演示 `status = "pending"` 作者态，而 `decisions.ts` 对任何 pending 决策报 error → 规划工作流必然被 `codument decisions validate` 判错。
6. **冲突 6（过载声明 vs 欠校验）**：`modeling-node-schema.md` §2 表格声明 port/actor/policy 等「必带」最小表征（invariants、状态枚举、pseudo、入口签名、rule 引用），而 `modeling/schema.ts` 对 port/actor/policy 明确 lenient、不查 invariants/状态枚举/pseudo；`modeling-registry.md` 的「CLI 校验」表述又与 node-schema 表矛盾。
7. **冲突 7（文档漂移）**：`README-cn.md` 与 `docs/codument-xml-configs.md` 仍以 `plan.xml`、`spec_deltas/`、`TODO/IN_PROGRESS/DONE/BLOCKED`、`feature.json` 作为当前格式与示例，与英文 README 及 CLI 现状冲突。
8. **冲突 8（严格度不一致）**：`track-xml-spec.md` §9.5 把 `on-exhausted` 合法值列为 strict 校验项，`validate.ts` 只给 warning。

### 修复原则（用户确认）

**确定性逻辑一律通过 codument CLI 实现**（校验器/命令落地，返回 AI 友好的结构化结果），不继续堆砌提示词；只有无法确定性判断的内容性/质量项才保留在规范文档并明确标注为「评审项（非 CLI 强制）」。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**
- mission 校验器补齐确定性规则：状态枚举（mission §6 词表）、Hook on 取值（含 mission:after-node）、Schedule Dag 引用、TrackLink 挂点、MissionReconcile 属性合法性。
- decisions validate 区分作者态（pending=warning）与归档 gate（durable 未决=error），消除与决策协议/示例的矛盾。
- modeling 校验器补齐确定性最小表征；内容质量项在规范标注为非 CLI 强制，统一两份 modeling 规范的措辞。
- `on-exhausted` 严格化，与 §9.5 对齐；核对 AttractorCheck profile 解析校验。
- 校验 findings 输出统一为 AI 友好格式（rule-id / 文件 / 位置 / severity / 消息 + `--json`）。
- 修正 track-xml-spec §4/§5 示例（TODO、Dag 引用），并把修正后的示例固化为 `codument validate` 防回归 fixture。
- 更新 README-cn.md 与 docs/codument-xml-configs.md 至当前格式。
- Dogfood：build + `codument upgrade-workspace` 同步模板与工作区；`bun run check` 全绿。

**非目标:**
- 不改变 XNL/XML 语法本身（不碰 xnl-core parser）。
- 不改动 track 任务状态枚举的合法值集合（track 枚举保持现状，仅修示例）。
- 不迁移历史 archive 内容。
- 不为 content 质量（如 invariants 文本、actor 偏重论述）编写无法确定性判定的启发式校验。

## 变更内容（What Changes）

- CLI（确定性校验落地）：
  - `src/cli/mission/validate.ts`：新增状态枚举 / Hook on / Schedule / TrackLink / MissionReconcile 校验。
  - `src/cli/commands/validate.ts`：mission 校验接线（或新命令）、on-exhausted 升 error、AttractorCheck profile 校验、findings 输出格式化 + `--json`。
  - `src/cli/commands/decisions.ts`：pending 降 warning；durable 未决仅在归档 gate 报 error。
  - `src/cli/modeling/schema.ts` + `validate.ts`：确定性最小表征（state-machine 状态枚举、component pseudo、port command|message、policy rule|behavior:// 引用）。
- 规范与文档：
  - `codument/std/spec/track-xml-spec.md`（+模板副本）：§4 示例 TODO→NOT_STARTED；§5 示例自洽化。
  - `codument/std/spec/modeling-node-schema.md` / `modeling-registry.md`：标注非 CLI 强制项，统一措辞。
  - `codument/std/spec/mission-xml-spec.md`：明确枚举差异与校验覆盖，消除「复用 track 枚举」的自相矛盾表述。
  - `codument/std/actions/validate.md`、`decision-tree.md`：与新的 CLI 行为对齐（如 pending 语义、mission 校验项）。
  - `README-cn.md`、`docs/codument-xml-configs.md`：更新至当前格式。
- 测试：`test/cli/mission/validate.test.ts`、`test/cli/commands/{validate,decisions}.test.ts`、`test/cli/modeling/*` 新增断言；track-xml-spec 修正示例进 fixture。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`codument-core`
- 受影响的代码/文档：
  - `src/cli/{commands,mission,modeling,decisions}/**`
  - `codument/std/spec/{track-xml,mission-xml,modeling-node-schema,modeling-registry}.md`
  - `codument/std/actions/{validate,plan-mission,gap-loop}.md`、`codument/std/protocols/decision-tree.md`
  - `src/templates/codument/std/**`（模板副本同步）
  - `test/cli/**`、`test/resources/**`
  - `README-cn.md`、`docs/codument-xml-configs.md`
- 兼容性：mission 校验收紧后，现有 `codument/missions/active/evolve-codument-action-system/mission.xml` 必须在升级后通过新校验（其当前结构已符合规范，预期无回归）；modeling 新增最小表征校验对 `test/resources/modeling-showcase` 预期无回归；第三方用户工作区若有不合规 mission/modeling 节点，会在 validate 时得到带 rule-id 的明确 error 与修复提示。
