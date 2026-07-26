# 变更：重新设计 mission 工作流

## 背景和动机 (Context And Why)

Codument 当前的 `codument/missions/README.md` 把 mission 定义为跨 track 路线图，核心产物是 `roadmap.md`。这个形态适合人读，但不足以支撑更长时间的自动化执行：

- 缺少结构化状态真源，长期执行只能依赖 Markdown 表格和对话记忆。
- 缺少 pending / active / archived 生命周期目录，mission 的启动、执行、归档状态不清晰。
- 缺少类似 `track.xml` 的结构 / 调度 / 行为三轴模型，无法稳定表达 DAG、节点状态、门禁与候选 track。
- mission 执行不确定性高，执行期间经常需要增删改任务节点、调整依赖、人工介入和重规划，现有 roadmap 形态没有规范化协议。
- 现有 operation flow notation 仍藏在 `std/operations/_operation-spec.md`，无法被 mission / track / skill 作为统一规格复用。

参考材料：

- `/Users/kongweixian/ai/eidolon/eidolon-workbench/codument/missions`
- `/Users/kongweixian/ai/eidolon/eidolon-anchor/.theater/runtime-evolution-mission`
- `/Users/kongweixian/ai/ai-codument/depa-skills/skills/depa-cybernetic-skill-creator`
- `/Users/kongweixian/python/ks-ep/ace-runtime-2-browser-automation/workspace/business/it_asset/it_asset/skill/it-asset-inbound-automation`

这些材料共同显示：mission 应是比 track 更长周期的控制面对象。它要表达期望态 DAG，也要通过控制论反馈循环持续比较实际态和期望态，允许基于证据进行受控重规划。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**

- 将 mission 提升为一等生命周期对象，目录结构固定为 `pending/`、`active/`、`archived/`。
- 新增 `mission.xml` 规范，内部表示与 `track.xml` 同构：`Metadata`、`Ports`、`TaskSpace`、`Schedule`、`Hooks`，但 mission 默认顶层 DAG。
- 删除 `roadmap.md` 作为 mission 必备制品；原路线内容拆入 `proposal.md`、`design.md` 和 `mission.xml`。
- 新增 `codument-plan-mission`、`codument-impl-mission`、`codument-archive-mission` 三个 operation prompt 和 skill 壳。
- `codument-plan-mission` 必须生成 `mission.xml`、`proposal.md`、`design.md` 的示例和真实 mission 起草流程。
- `codument-impl-mission` 必须复用 `codument-impl-track` 的 XML 状态续跑、DAG 调度、报告落盘经验，同时增加 mission 级重规划和人工介入协议。
- `codument-archive-mission` 必须复用 `codument-archive-track` 的归档、提升 decisions / memory、校验经验；归档目录使用 `YYYY-MM-DD-<mission-id>` 前缀。
- 在 mission 提示词中显式使用控制论 + DEPA actor 概念：`MissionPlanner`、`MissionObserver`、`MissionReconciler`、`MissionApplier`。
- 将 flow notation 从 operation 私有说明提升到 `std/spec/flow-notation.md`，并让 `_operation-spec.md` 引用该规范。
- `analysis/` 与 `reports/` 作为 mission 执行期外部记忆，默认不纳入 git 管理。

**非目标:**

- 不把 mission 变成大号 track；真实代码 / 规范落地仍由 track 承担。
- 不在 `mission.xml` 中表达无限控制循环；`mission.xml` 只表达期望态图式、当前状态、调度与 hook，反馈循环属于执行协议。
- 不保留 `roadmap.md` 作为新 mission 的标准产物。
- 不要求本 track 一次性实现复杂 CLI 自动执行引擎；第一版可以先完成规范、prompt、skill、模板与结构校验。
- 不把 `analysis/` / `reports/` 当 owner 真源；稳定知识仍晋升到 docs / behaviors / decisions / memory。

## 变更内容（What Changes）

- 更新 `codument/missions/README.md`，定义：
  - `pending/<mission-id>/`
  - `active/<mission-id>/`
  - `archived/YYYY-MM-DD-<mission-id>/`
  - mission 标准文件布局。
- 新增 `codument/std/spec/mission-xml-spec.md`。
- 新增 `codument/std/spec/flow-notation.md`，内容基于 depa cybernetic skill creator 的 flow notation。
- 将 `codument/std/operations/_operation-spec.md` 改为 operation prompt 约定说明，并引用 `std/spec/flow-notation.md` 作为流程块权威规范。
- 新增 `codument/std/operations/plan-mission.md`、`impl-mission.md`、`archive-mission.md`。
- 新增 `src/templates/skills/codument-plan-mission/SKILL.md`、`codument-impl-mission/SKILL.md`、`codument-archive-mission/SKILL.md`。
- 更新 `src/templates/manifest.ts` 生成链，确保新增模板被部署。
- 更新 `codument/std/AGENTS.md`、`codument/std/operations/README.md`、`src/templates/skills/README.md` 的路由表。
- 更新 `.gitignore` 或模板初始化规则，使 `codument/missions/*/*/analysis/` 与 `codument/missions/*/*/reports/` 默认不提交。
- 为 mission example 添加测试或模板一致性校验。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`codument-core`
- 受影响的标准文件：`codument/missions/README.md`、`codument/std/spec/*`、`codument/std/operations/*`、`codument/std/AGENTS.md`
- 受影响的模板：`src/templates/codument/**`、`src/templates/skills/**`、`src/templates/manifest.ts`
- 受影响的命令 / skill 表面：新增 `codument-plan-mission`、`codument-impl-mission`、`codument-archive-mission`
