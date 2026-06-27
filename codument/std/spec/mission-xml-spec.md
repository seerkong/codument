# Mission XML 规范

`codument/missions/{pending,active,archived}/.../mission.xml` 是 codument mission 的**结构 / 状态 / 调度真源**。mission 是比 track 更长周期的控制面对象，用于编排多个 plan 节点和落地 track，并允许在执行中根据 evidence 或 human decision 受控重规划。

mission 不替代 track。真实代码、规范、测试和迁移仍由 `codument/tracks/<id>/track.xml` 管理。

## 1. 目录位置

```text
codument/missions/
  pending/<mission-id>/mission.xml
  active/<mission-id>/mission.xml
  archived/YYYY-MM-DD-<mission-id>/mission.xml
```

- `pending`：已规划但未启动。
- `active`：正在执行；允许受控重规划。
- `archived`：完成、取消、废弃或被替代。

## 2. 与 track.xml 的关系

`mission.xml` 与 `track.xml` 同构，复用三轴模型：

- `TaskSpace`：结构轴，表达 mission plan 节点、track candidate、状态。
- `Schedule`：调度轴，表达 DAG 依赖。
- `Hooks`：行为轴，表达 mission reconcile、人工确认、方向审查等生命周期行为。

区别：

- 根节点是 `<Mission>`。
- 顶层 `TaskSpace` 默认 `cdt:child-mode="dag"`。
- active mission 允许受控重规划，须递增 `Metadata.Revision` 并写 report。
- mission 节点可以是纯 plan 节点，也可以是 track creation / track execution 节点。

## 3. 最小示例

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

## 4. Metadata

```xml
<Metadata>
  <Status>active</Status>
  <Goal>...</Goal>
  <Description>...</Description>
  <Revision>7</Revision>
  <CreatedAt>...</CreatedAt>
  <UpdatedAt>...</UpdatedAt>
</Metadata>
```

mission status:

- `pending`
- `active`
- `completed`
- `cancelled`
- `superseded`
- `archived`

`Revision` 从 `1` 起。每次受控重规划必须递增。

## 5. TaskSpace

mission 顶层节点建议使用语义化 id：

- `PLAN-A` / `PLAN-B` / `PLAN-C`：纯计划节点。
- `TRACK-1` / `TRACK-2`：落地 track 节点。
- `VERIFY` / `CLOSE`：验证和收口节点。

节点状态复用 track TaskSpace 状态：

- `NOT_STARTED`
- `ACTIVE`
- `DONE`
- `BLOCKED`
- `ABANDONED`
- `SUPERSEDED`

如果现有 validator 只支持 track 状态枚举，第一版实现可以在 mission spec 中定义语义，后续再扩 validator。

## 6. Schedule

mission 顶层默认 DAG：

```xml
<TaskSpace id="space_x" cdt:child-mode="dag">
```

`Schedule` 规则与 track 一致：

- `<Dag for="...">` 只描述该父节点的直接下层依赖。
- `<Node id="..."><After ref="..."/></Node>` 表示前驱。
- 不跨层、不跨父。

## 7. Cybernetic DEPA Actors

mission execution is a cybernetic actor loop over a DAG-shaped desired state.

| Actor | 控制论角色 | DEPA 归属 | 职责 |
|---|---|---|---|
| `MissionPlanner` | 期望态产出者 | Processor + Actor | 产出或修订 desired mission graph |
| `MissionObserver` | 传感器 | Data + Actor | 读取 actual state projection |
| `MissionReconciler` | 控制器 | Processor + Actor | 比较 desired vs actual，判定 drift / ready / blocked / done |
| `MissionApplier` | 执行器 | Effect + Actor | 执行一个 bounded convergence action |

执行协议：

```text
MissionObserver 观测实际态
-> MissionReconciler 比较 mission.xml 期望态 vs 实际态
-> MissionPlanner 在必要时提出重规划
-> MissionApplier 执行一个 bounded action
-> 写 report / 更新 mission.xml
-> 下一轮
```

## 8. 受控重规划

active mission 允许修改 `mission.xml`，但必须满足：

- 有 evidence 或 human decision。
- 写入 `reports/replan-XXX.md` 或 `reports/human-intervention-XXX.md`。
- 更新 `Metadata.Revision` 和 `UpdatedAt`。
- 说明 trigger、actual state、desired state、diff、decision、applied change。

允许的重规划：

- 新增节点。
- 删除 / supersede 节点。
- 修改节点目标、验收、状态。
- 修改 DAG 依赖。
- 暂停等待人工介入。

## 9. 标准文件拆分

新 mission 不使用 `roadmap.md`。内容拆分：

- `proposal.md`：目标、非目标、成功判据、背景。
- `design.md`：actor 模型、重规划协议、风险、plan vs track 区分。
- `mission.xml`：节点、依赖、状态、候选 track。
- `analysis/`：执行期 evidence / findings，默认不进 git。
- `reports/`：mission run / drift / replan / verify reports，默认不进 git。
