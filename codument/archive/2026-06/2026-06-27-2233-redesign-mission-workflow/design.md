# Mission Workflow Redesign Design

## 上下文

Codument 的 track 已经完成三轴化：`track.xml` 作为状态真源，`TaskSpace` 表达结构，`Schedule` 表达 DAG，`Hooks` 表达校验 / 纠偏 / 确认。mission 当前仍是 Markdown roadmap 层，无法支撑长周期自动化。

参考任务中观察到两类成功经验：

1. runtime-evolution mission 经验：
   - 先做 Plan-A 证据盘点。
   - 再做 Plan-B 设计收敛。
   - 再做 Plan-C track 切片确认。
   - 最后逐批落地 tracks。
   - 过程中会不断发现新证据、修正候选 track、合并或废弃任务。
2. 控制论 skill 经验：
   - 长流程任务要把 AI 看成控制器。
   - 需要明确 desired state、actual state、actuation、feedback / drift。
   - actor 边界要清楚，避免规划、观测、判断、写入混在同一个隐式上下文里。

因此新 mission 应设计为：**DAG-shaped desired state + cybernetic actor loop execution**。

## 方案概览

### 1. mission 目录结构

```text
codument/missions/
  README.md

  pending/
    <mission-id>/
      mission.xml
      proposal.md
      design.md
      decisions.md
      decisions/
      memory/
      analysis/
      reports/

  active/
    <mission-id>/
      mission.xml
      proposal.md
      design.md
      decisions.md
      decisions/
      memory/
      analysis/
      reports/

  archived/
    YYYY-MM-DD-<mission-id>/
      mission.xml
      proposal.md
      design.md
      decisions.md
      decisions/
      memory/
      analysis/
      reports/
```

语义：

- `pending/`：已经规划但尚未批准 / 启动。
- `active/`：正在执行，允许受控重规划。
- `archived/`：完成、取消、废弃或被替代后的 mission。

`analysis/` 与 `reports/` 默认不提交 git。它们是执行期外部记忆，不是 owner 真源。

### 2. mission 标准文件

- `mission.xml`：唯一结构 / 状态 / 调度真源。
- `proposal.md`：背景、目标、非目标、成功判据、为什么需要 mission 而不是 track。
- `design.md`：控制论 actor 模型、DEPA 边界、重规划协议、人工介入协议、风险与迁移。
- `decisions.md`：过程决策主入口。
- `decisions/`：durable decisions，归档时可提升。
- `memory/`：长期记忆候选。
- 无 `roadmap.md`。

原 roadmap 内容拆分：

| 原 roadmap 内容 | 新落点 |
|---|---|
| mission 目标、Non-Goals、成功判据 | `proposal.md` |
| 阶段路线、节点依赖、状态、track candidates | `mission.xml` |
| plan vs track 区分规则 | `design.md` |
| 当前判断、阻塞、风险 | `design.md` + `mission.xml` 状态 |
| 证据链接、执行报告链接 | `mission.xml` 节点扩展 + `reports/` |
| 移交项 | `design.md` 或后续生成 track 的 proposal |

### 3. mission.xml

`mission.xml` 与 `track.xml` 同构，但根为 `<Mission>`，顶层默认 DAG。

示例：

```xml
<Mission id="runtime-evolution" version="1" xmlns:cdt="urn:codument:v1">
  <Metadata>
    <Status>pending</Status>
    <Goal>重构 runtime 长周期架构</Goal>
    <Description>先证据盘点，再设计收敛，再切片为 tracks 落地。</Description>
    <Revision>1</Revision>
    <CreatedAt>2026-06-27T13:56:11Z</CreatedAt>
    <UpdatedAt>2026-06-27T13:56:11Z</UpdatedAt>
  </Metadata>

  <Ports scope="mission">
    <MaterialBundle role="state" name="analysis" domain="mission" path="vfs://./analysis/"/>
    <MaterialBundle role="state" name="reports" domain="mission" path="vfs://./reports/"/>
    <MaterialBundle role="output" name="tracks" domain="codument" path="vfs://@/codument/tracks/"/>
  </Ports>

  <TaskSpace id="space_runtime-evolution" name="runtime-evolution" version="1" cdt:child-mode="dag">
    <Description>Runtime evolution mission.</Description>
    <SubNodes>
      <TaskGroup id="PLAN-A" name="证据盘点" status="NOT_STARTED" order="0">
        <Description>盘点事实源、读写路径和包边界。</Description>
      </TaskGroup>
      <TaskGroup id="PLAN-B" name="设计收敛" status="NOT_STARTED" order="1">
        <Description>形成架构归属和候选 track 边界。</Description>
      </TaskGroup>
      <TaskGroup id="PLAN-C" name="track 切片确认" status="NOT_STARTED" order="2">
        <Description>确认第一批可落地 tracks。</Description>
      </TaskGroup>
      <TaskGroup id="TRACK-1" name="首批 track 落地" status="NOT_STARTED" order="3">
        <Description>创建并执行首批 track。</Description>
        <cdt:TrackCandidate id="add-runtime-data-subgraph-contracts"/>
      </TaskGroup>
    </SubNodes>
  </TaskSpace>

  <Schedule>
    <Dag for="space_runtime-evolution">
      <Node id="PLAN-B"><After ref="PLAN-A"/></Node>
      <Node id="PLAN-C"><After ref="PLAN-B"/></Node>
      <Node id="TRACK-1"><After ref="PLAN-C"/></Node>
    </Dag>
  </Schedule>

  <Hooks>
    <Hook on="mission:after-node">
      <cdt:MissionReconcile max-rounds="3" on-drift="replan-or-block"/>
    </Hook>
  </Hooks>
</Mission>
```

状态建议：

- mission status：`pending | active | completed | cancelled | superseded | archived`
- node status：复用 track TaskSpace 状态：`NOT_STARTED | ACTIVE | DONE | BLOCKED | ABANDONED | SUPERSEDED`
- `Metadata.Revision`：每次受控重规划递增。

### 4. Cybernetic + DEPA Mission Actors

mission 的 4 个角色必须作为提示词中的 actor 概念出现。actor 是广义 DEPA actor：有边界、收消息、回消息、负责明确事实或副作用。

| Actor | 控制论角色 | DEPA 归属 | 持有 / 不持有 |
|---|---|---|---|
| `MissionPlanner` | 期望态产出者 | Processor + Actor | 产出 desired mission graph；不执行 track，不写实际文件 |
| `MissionObserver` | 传感器 | Data + Actor | 读取 actual state projection；不修正状态 |
| `MissionReconciler` | 控制器 | Processor + Actor | 比较 desired vs actual，判定 drift / ready / blocked / done；不直接写文件 |
| `MissionApplier` | 执行器 | Effect + Actor | 唯一执行收敛动作：移动 mission、创建/续跑/归档 track、修订 mission.xml、写 reports |

执行循环：

```text
MissionObserver 观测实际态
-> MissionReconciler 比较 mission.xml 期望态 vs 实际态
-> MissionPlanner 在必要时提出重规划
-> MissionApplier 执行一个 bounded action
-> 写 report / 更新 mission.xml
-> 下一轮
```

关键纪律：

- level-triggered：每轮看当前实际态，不依赖“上一轮以为做过什么”。
- evidence-based：重规划必须有 evidence 或 human decision。
- idempotent：同样 desired + actual，不重复创建 track 或重复归档。
- bounded action：每轮只做一个有限动作，避免长周期自动化漂移。
- chat history is not state：恢复点只来自 `mission.xml`、`analysis/`、`reports/` 和实际 track 状态。

### 5. 受控重规划

active mission 允许受控重规划：

- 新增节点：发现需要先补证据、先建底座 track、先跑验证。
- 删除节点：证伪、过时、被合并。
- 修改节点：目标、验收、依赖、状态变化。
- 修改 DAG：依赖顺序变化、并行转串行、拆分 wave。
- 人工介入：用户暂停、改目标、批准 / 拒绝某个 convergence action。

每次重规划必须：

1. 写 `reports/replan-XXX.md` 或 `reports/human-intervention-XXX.md`。
2. 说明 trigger、actual state、desired state、diff、decision、applied change。
3. 更新 `mission.xml` 的 `Metadata.Revision` 和 `UpdatedAt`。
4. 若决策有长期约束，追加到 `decisions.md`，必要时写 `decisions/<slug>.md`。

### 6. operations

#### codument-plan-mission

参考 `codument-plan-track`：

- 检查 codument 初始化。
- 生成 mission id，查重 `pending/`、`active/`、`archived/`。
- 创建 `codument/missions/pending/<mission-id>/`。
- 写 `proposal.md`、`design.md`、`mission.xml`。
- 建 `analysis/`、`reports/`、`decisions/`、`memory/`。
- 内置 example，展示 `mission.xml`、`proposal.md`、`design.md` 三件套。
- best-effort validate。

#### codument-impl-mission

参考 `codument-impl-track`：

- 从 `active/<mission-id>/mission.xml` 续跑。
- 若 mission 仍在 pending，先要求用户确认启动，或提供启动动作把它移到 active。
- 按 DAG 找 ready nodes。
- 对 plan 节点执行分析 / 设计 / 切片。
- 对 track 节点创建或续跑 track。
- 每轮通过四 actor 做 observe / reconcile / plan / apply。
- 遇到 drift 时允许重规划，不强行沿旧 DAG。
- 写 `reports/mission-run-XXX.md`、`reports/drift-report-XXX.md`。

#### codument-archive-mission

参考 `codument-archive-track`：

- 只归档 `active/<mission-id>/`，或用户明确要求归档 pending/cancelled mission。
- 校验 mission 状态为 completed / cancelled / superseded，未完成则要求确认。
- 提升 durable decisions / memory。
- 将目录移到 `archived/YYYY-MM-DD-<mission-id>/`。
- 不提升 behavior delta，除非 mission 自身 track 另有 behavior 变更；mission 只是跨 track 编排层。
- best-effort validate / status。

### 7. flow notation

新增 `std/spec/flow-notation.md`，以 depa cybernetic skill creator 的 `fa/flow-notation.md` 为基础，至少包含：

```text
@delimiter: --
@node: #
@marker: ?
```

并定义：

- `#switch` / `#case` / `#default`
- `#sequence`
- `#step`
- `#if` / `#else-if` / `#else`
- `#loop`
- `#return`
- `#exit`
- `#goto`
- `#fail` / `#on-fail`
- `#spawn`
- `#call`

`std/operations/_operation-spec.md` 改成 operation prompt 约定，不再重复完整 flow notation，只引用 `std/spec/flow-notation.md`。

## 影响范围与修改点（Impact）

- `src/templates/codument/missions/README.md`
- `src/templates/codument/std/spec/mission-xml-spec.md`
- `src/templates/codument/std/spec/flow-notation.md`
- `src/templates/codument/std/operations/_operation-spec.md`
- `src/templates/codument/std/operations/plan-mission.md`
- `src/templates/codument/std/operations/impl-mission.md`
- `src/templates/codument/std/operations/archive-mission.md`
- `src/templates/codument/std/operations/README.md`
- `src/templates/codument/std/AGENTS.md`
- `src/templates/skills/codument-plan-mission/SKILL.md`
- `src/templates/skills/codument-impl-mission/SKILL.md`
- `src/templates/skills/codument-archive-mission/SKILL.md`
- `src/templates/skills/README.md`
- `.gitignore`
- `src/templates/manifest.ts`
- `codument/` dogfood copy after build + `codument upgrade-workspace`

## 决策摘要

- mission 目录采用 `pending/active/archived` 三段生命周期。
- archived mission 使用 `YYYY-MM-DD-<mission-id>` 前缀。
- 新 mission 不使用 `roadmap.md`。
- `mission.xml` 与 `track.xml` 同构，默认顶层 DAG。
- mission 执行 actor 使用 `MissionPlanner`、`MissionObserver`、`MissionReconciler`、`MissionApplier`。
- active mission 允许受控重规划，必须记录 evidence / report / decision。
- flow notation 提升为 `std/spec/flow-notation.md`。
- mission operation 命名为 `codument-plan-mission`、`codument-impl-mission`、`codument-archive-mission`。

详见 `decisions.md`。

## 风险 / 权衡

- 风险：mission 变成“万能大任务”，吞掉 track。
  - 缓解：规范明确 mission 不改代码，真实落地仍创建 track。
- 风险：允许重规划导致状态不可审计。
  - 缓解：每次重规划递增 `Revision`，并写 `reports/replan-XXX.md` 或 `human-intervention-XXX.md`。
- 风险：四 actor 过于仪式化。
  - 缓解：actor 是提示词执行边界，不要求第一版实现独立运行时 actor；但 prompt 必须以 actor 概念组织职责。
- 风险：`analysis/` / `reports/` git ignored 后重要信息丢失。
  - 缓解：它们只存执行期证据和报告；稳定知识需要晋升到 docs / decisions / memory。

## 兼容性设计

- 旧 `codument/missions/README.md` 描述的 `missions/<id>/roadmap.md` 是旧形态；新规范不要求自动迁移旧 mission。
- 可在 README 中说明旧 mission 可以手动迁移到 `archived/YYYY-MM-DD-<mission-id>/` 或转换为新 `pending/active` 结构。
- 新 skill 名不需要旧 alias，因为 mission operation 当前不是高频既有入口。
- `codument archive <track-id>` CLI 不受影响；`archive-mission` 是 prompt/skill 层能力，后续可再补 CLI。

## 迁移计划

1. 先新增 spec / operations / skills / README / template manifest。
2. 增加模板一致性测试或更新现有 manifest test 覆盖。
3. build 后运行 `codument upgrade-workspace --agent=claude,codex` 刷新 dogfood `codument/` 与 skill 壳。
4. 用 `codument-plan-mission` 示例手工或测试生成一个临时 mission，验证三件套可读。
5. 后续 track 再实现 CLI 级 `codument mission ...` 命令（如需要）。

## 待解决问题

- 第一版是否实现 CLI 命令，还是只实现 operation prompt + skill 壳。
- 是否需要 `codument-status` 汇总 active missions。
- 是否需要 `codument-validate` 扩展到 `mission.xml`。
