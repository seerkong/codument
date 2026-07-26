# Decisions

## Usage

- 用于记录 redesign-mission-workflow 中已经确认或后续需要确认的设计决策。
- 问题标题不用字母前缀；字母只用于选项。
- 后续执行过程中出现的新决策，也继续追加到本文件。

### 1. 【P0】mission 目录生命周期结构

- 背景：mission 是比 track 更长周期的任务对象，需要清晰区分未启动、执行中和已归档状态。
- 需要决定：`codument/missions/` 下 mission 的目录结构。
- 选项：
  - A) `codument/missions/<mission-id>/`
  - B) `codument/missions/{pending,active,archived}/<mission-id>/`
  - C) 继续使用单层 `roadmap.md` 列表。
- 当前建议：B。
- 用户答复：采用 `pending/active/archived` 三个子文件夹，里面才是 mission。
- 最终决策：B。
- 决策理由：生命周期目录让 mission 的启动、执行、归档状态成为文件路径的一部分，适合长周期自动化恢复和扫描。
- 状态：accepted

### 2. 【P0】mission 归档目录命名

- 背景：mission 归档需要稳定可排序，也要保留原 mission id。
- 需要决定：`codument-archive-mission` 后 archived 目录命名。
- 选项：
  - A) `archived/<mission-id>/`
  - B) `archived/YYYY-MM-DD-<mission-id>/`
  - C) `archived/YYYY-MM/YYYY-MM-DD-HHmm-<mission-id>/`
- 当前建议：B。
- 用户答复：在 `archived` 下使用年月日作为 mission 前缀。
- 最终决策：B。
- 决策理由：mission 周期比 track 长，日期粒度足够；用日期前缀利于排序并避免同名历史冲突。
- 状态：accepted

### 3. 【P0】roadmap.md 是否保留

- 背景：旧 mission 以 `roadmap.md` 为中心，但新 mission 已有结构化 `mission.xml` 与 proposal/design。
- 需要决定：新 mission 是否保留 `roadmap.md`。
- 选项：
  - A) 保留 `roadmap.md` 为必备文件。
  - B) 删除 `roadmap.md`，原内容拆入 `proposal.md`、`design.md`、`mission.xml`。
  - C) `roadmap.md` 作为可选派生投影。
- 当前建议：B。
- 用户答复：去掉 `roadmap.md`，其内容放到 `proposal.md`、`design.md`、`mission.xml` 中。
- 最终决策：B。
- 决策理由：减少真源数量，避免路线表和结构化状态漂移；人读背景进 proposal/design，结构与状态进 mission.xml。
- 状态：accepted

### 4. 【P0】mission.xml 与 track.xml 的关系

- 背景：mission 需要像 track 一样有结构化状态真源，但 mission 的周期和不确定性更大。
- 需要决定：`mission.xml` 的表达规范。
- 选项：
  - A) 完全独立的 XML 格式。
  - B) 与 `track.xml` 同构，根为 `<Mission>`，默认顶层 DAG。
  - C) 复用 `<Track>` 根，通过 type 区分。
- 当前建议：B。
- 用户答复：mission 文件夹内部有 `mission.xml`，其表示规范与当前 `track.xml` 一致；区别只是默认 DAG 执行方式。
- 最终决策：B。
- 决策理由：复用 Track 的三轴模型和已有实现经验，同时用根节点与默认调度区分 mission 语义。
- 状态：accepted

### 5. 【P0】mission actor 模型

- 背景：mission 比 track 更长、更容易偏差，需要控制论反馈循环，并以 DEPA actor 边界表达角色。
- 需要决定：mission prompt 中如何命名和组织执行角色。
- 选项：
  - A) 用普通步骤描述，不引入 actor。
  - B) 引入四个控制论 actor：Planner / Observer / Reconciler / Applier。
  - C) 每个 phase 一个 actor。
- 当前建议：B。
- 用户答复：mission 中的 4 个角色也要使用控制论思想 + DEPA 思想，提示词中使用 actor 概念。
- 最终决策：B，命名为 `MissionPlanner`、`MissionObserver`、`MissionReconciler`、`MissionApplier`。
- 决策理由：四 actor 分别对应期望态产出、实际态观测、偏差判定、收敛动作，边界清晰，避免长周期执行把规划、观察、判断、写入混成一团。
- 状态：accepted

### 6. 【P0】mission 执行期重规划

- 背景：mission 不确定性大，执行中会发现新证据、错误依赖、任务拆分遗漏或用户目标变化。
- 需要决定：active mission 是否允许修改 `mission.xml`。
- 选项：
  - A) 启动后冻结，只允许新增后续 mission。
  - B) 允许受控重规划：增删改节点、修改 DAG、人工介入，但必须有证据或用户决策，并写 reports。
  - C) 允许任意修改，不要求记录原因。
- 当前建议：B。
- 用户答复：所有 mission 的规划必然有时会增删改任务节点和执行规划，执行过程中也可能人工介入、重新调整。
- 最终决策：B。
- 决策理由：mission 的价值就在于长周期控制；冻结计划会迫使现实偏差藏进对话或报告，任意修改则丢失可审计性。
- 状态：accepted

### 7. 【P1】flow notation 规范位置

- 背景：当前流程块规范在 `std/operations/_operation-spec.md`，mission / skill / actor drive 都需要复用。
- 需要决定：flow notation 放在哪里。
- 选项：
  - A) 继续留在 `_operation-spec.md`。
  - B) 提升为 `std/spec/flow-notation.md`，`_operation-spec.md` 引用它。
  - C) 放到 `std/sop/flow-notation.md`。
- 当前建议：B。
- 用户答复：将 flow notation 换成引用后续迭代的更完善版本，并将 `flow-notation.md` 放到 `src/templates/codument/std/spec` 中。
- 最终决策：B。
- 决策理由：flow notation 是格式规范，不只是某个 operation 的 SOP；放在 `std/spec` 可被 mission / track / skill 统一引用。
- 状态：accepted

### 8. 【P1】mission operation 命名

- 背景：track 已经有 `codument-plan-track`、`codument-impl-track`、`codument-archive-track`。
- 需要决定：mission 三个生命周期 operation 名称。
- 选项：
  - A) `codument-plan-mission` / `codument-impl-mission` / `codument-archive-mission`
  - B) `codument-mission-plan` / `codument-mission-impl` / `codument-mission-archive`
  - C) 复用 track operation，通过参数区分。
- 当前建议：A。
- 用户答复：明确使用 `codument-plan-mission`、`codument-impl-mission`、`codument-archive-mission`。
- 最终决策：A。
- 决策理由：与 track 命名族一致，便于 skill routing；未来可以继续扩展 mission 专用 operation。
- 状态：accepted
