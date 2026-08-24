# Mission Design：Nested Mission Orchestration

## 1. 控制目标

本 Mission 要把 Codument 的现有控制模型从：

```text
Mission -> Task -> TrackLink -> Track
```

扩展为：

```text
Root Mission
  -> Task -> MissionLink -> Child Mission
                              -> Task -> TrackLink -> Track
  -> Task -> TrackLink -> Root-owned Track
  -> Task -> TrackLink(mission_ref, track_ref) -> Child Mission-owned Track
```

根 Mission 负责跨仓库和跨 Mission 的 desired state、依赖、交付契约、观察和重规划。子 Mission 负责本地仓库或局部领域的 desired state、局部 DAG、Track 创建/执行/验证/归档、决策和证据。两者通过结构化投影连接，不复制内部任务树。

Mission 是长期控制面，不是大号 Track；代码、规范、测试和实际实现始终由真实 Track 承担。若某个任务不需要真实 Track，必须显式记录为直接 Mission 例外并说明理由，不得把 TrackLink 当作标签后绕过 Track。

## 2. Desired state 与 actual state

### 2.1 Desired state

父 Mission 的 desired state 包括：

- 自己的 TaskGroup/Task DAG 和状态；
- `MissionLink`：子 Mission 的逻辑 id、ProjectRef、绑定状态和交付契约；
- `SelectedTasks`：父 Mission 明确等待的子 Mission 叶子 Task id；
- 直接 TrackLink，以及跨层 TrackLink 的 `project_ref`、`mission_ref`、`track_ref`；
- 父子关系的 `link_ref`；
- ActorSets、ProjectRefs、Hooks 和重规划政策。

子 Mission 的 desired state 包括：

- 自己完整的 TaskSpace、Schedule 和 Hooks；
- 自己的 TrackLink 和 Track 生命周期；
- 必须与父侧闭合的 `ParentMission`；
- 自己的 ProjectRefs、ActorSets、决策和局部交付证据。

### 2.2 Actual state

Observer 读取：

- 当前 Mission authority、根状态、revision 和 Task 状态；
- 当前机器的 `codument/.local/workspace-bindings.xnl`；
- ProjectRef 对应 workspace 中的 pending/active/archived Mission 和 Track authority；
- 子 Mission 的 ParentMission、selected target 当前状态、reports、decisions 和验证结果；
- 子 Mission 直接拥有的 Track、跨层 TrackLink 指向的 `mission_ref + track_ref`；
- Git 提交后的跨电脑恢复状态、用户新约束和失败证据。

Observer 只能把 workspace path 当作本地运行时输入，不能把它写回任何 Mission/Track 事实源。

## 3. MissionLink

`MissionLink` 是父 Mission 对真实子 Mission 的编排承诺，只能挂在叶子 Task 上：

```xnl
<MissionLink #repo-a-evolution {
  state = "candidate"
  project_ref = "repo-a"
  mission_ref = "repo-a-evolution"
  completion_mode = "selected-tasks"
} (
  <SelectedTasks [
    <TaskRef { ref = "A-G1-T1" }>
    <TaskRef { ref = "A-G2-T1" }>
  ]>
)>
```

字段：

- `state`：`candidate | bound`；candidate 可以指向尚不存在的计划子 Mission，bound 表示当前 session 能解析真实 authority。
- `project_ref`：逻辑 ProjectRef id，不是路径。
- `mission_ref`：子 Mission 的逻辑 identity。
- `completion_mode`：第一版固定为 `selected-tasks`，预留未来 milestone，但不实现自然语言 milestone。
- `SelectedTasks`：显式列出父 Mission 的交付要求；第一版只接受子 Mission 的叶子 Task。
- `link_ref`：关系 identity 由 MissionLink 的 id 表示，子侧 ParentMission 必须回指它。

绑定状态不等于交付完成。父 Task 只有在 MissionLink 已解析、SelectedTasks 全部满足交付终态并且证据可读取时才可 `DONE`。

## 4. ParentMission 与严格树

子 Mission 必须持久化父关系：

```xnl
<ParentMission {
  project_ref = "main-repo"
  mission_ref = "root-evolution"
  link_ref = "repo-a-evolution"
}>
```

第一版规则：

- 一个子 Mission 最多一个 `ParentMission`；
- 一个父 Mission 可以有多个 MissionLink；
- 根 Mission 没有 ParentMission；
- 父侧 MissionLink 与子侧 ParentMission 必须双向匹配：父 ProjectRef/mission_ref、子 ProjectRef/mission_ref、link_ref 不能冲突；
- 同一个子 Mission 被两个父 Mission 绑定必须报错；
- MissionLink 关系图必须无环；
- 不允许共享子 Mission；将来共享关系应引入只读 reference，而不是复用 MissionLink；
- 历史 DONE 节点不因重规划重写；取消的关系用 SUPERSEDED 并写 report。

校验不仅验证当前文件内部，还需要在可用 WorkspaceBinding 下跨仓库解析关系。缺少绑定时报告 `UNBOUND`，绑定存在但资源不存在时报告 `MISSING`，父子字段不一致时报告 `DRIFTED`，直接依赖该资源且无法自动修复时报告 `BLOCKED`。

## 5. SelectedTasks 交付投影

父 Mission 不等待 `child.status = completed`。它等待 MissionLink 中 SelectedTasks 的每个叶子 Task 达到交付契约：

```text
selected target status = DONE
```

或在受控重规划/人工介入报告明确允许时：

```text
selected target status = SUPERSEDED
```

父 Task 的完成 gate：

```text
MissionLink.state == bound
AND SelectedTasks 全部为允许交付终态
AND 每个 target 在子 Mission 中真实存在且是叶子 Task
AND 目标的测试、Track 状态或报告证据可解析
AND 父子 link identity 与 ProjectRef 关系闭合
```

子 Mission 可以仍然 `active`，并继续推进未选中的 Task。父 Mission 只消费选定交付投影，不改变子 Mission 的内部状态。子 Mission 的 selected target 被阻塞、缺失或发生 drift 时，父 Mission 只阻断依赖它的分支，其他 ready DAG branch 仍可运行。

## 6. TrackLink 与所有权

现有 TrackLink 增加显式归属/上下文字段：

```xnl
<TrackLink #repo-a-api {
  state = "bound"
  project_ref = "repo-a"
  mission_ref = "repo-a-evolution"
  track_ref = "repo-a-api"
}>
```

语义：

- 子 Mission 内部的 TrackLink 也显式写 `mission_ref`，表达 Track 所属 Mission；
- 父 Mission 允许直接挂跨层 TrackLink；
- 跨层 TrackLink 必须有 `project_ref + mission_ref + track_ref`，并能解析到子 Mission 内真实 Track；
- TrackLink 自身 id 是当前 Mission 的编排 identity，`track_ref` 是真实 Track identity；
- 子 Mission 是 Track 的唯一生命周期 owner；
- 父 Mission 是交付 consumer 和 orchestration observer，不得直接修改子 Mission Track 状态而绕过子 Mission；
- 一个 Track 只能有一个编排 owner；其他 Mission 只能观察或通过明确交付投影引用；
- MissionLink 和直接跨层 TrackLink 可以同时存在，但它们的粒度不同：前者等待多个 selected leaf tasks，后者等待一条具体 Track；二者不得产生重复 owner。

## 7. ProjectRef 与本机 WorkspaceBinding

### 7.1 可提交的逻辑关系

`mission.xnl` 只保存逻辑 ProjectRef：

```xnl
<ProjectRefs [
  <ProjectRef #main-repo { kind = "host" }>
  <ProjectRef #repo-a { kind = "external" }>
]>
```

这些逻辑 id 必须提交，因为 MissionLink、TrackLink、Actor 都需要通过它们闭合引用。

### 7.2 不可提交的机器路径

新增标准本地文件：

```text
codument/.local/workspace-bindings.xnl
```

示意：

```xnl
<WorkspaceBindings [
  <Binding #main-repo { project_ref = "main-repo" workspace_path = "/Users/alice/work/main" }>
  <Binding #repo-a { project_ref = "repo-a" workspace_path = "/Users/alice/work/repo-a" }>
]>
```

要求：

- `codument/.local/` 加入 Git ignore；
- 文件包含当前机器绝对路径，只存在于本机；
- 电脑 A 和电脑 B 可为同一 ProjectRef 保存不同绝对路径；
- 文件不是 Mission desired state，不参与 Mission content revision，不写入 reports/decisions；
- 缺少文件或 binding 时返回 `UNBOUND`；
- path 存在但找不到有效 Codument workspace 或目标资源时返回 `MISSING`；
- binding 更新不修改 Mission/Track authority；
- 通过 CLI 或等价确定性入口生成/更新，不手工把路径写入可提交资源。

建议提供独立于具体 Mission 的本地操作：

```bash
codument project bind <project-ref> <workspace-path>
codument project bindings
codument project unbind <project-ref>
```

同一台电脑上的多个 Mission 可以共享这组本地绑定。当前 session 仍可把本地 binding 加载成运行时 WorkspaceBinding；绑定文件是该运行时的标准持久化来源，但不是 Git 事实源。

## 8. 跨仓库执行流程

父 Mission Applier 处理 candidate MissionLink：

1. 读取 `project_ref`、`mission_ref` 和 link_ref。
2. 从 `codument/.local/workspace-bindings.xnl` 解析目标 workspace。
3. 若无绑定，返回 `UNBOUND`，不猜测路径、不创建目录、不把状态标为 bound。
4. 若绑定有效，在目标仓库查找子 Mission。
5. 不存在时，调用目标仓库的 `codument mission create <mission-ref> --stage pending`，并按父 Mission 设计在子 Mission 中写入 ParentMission。
6. 若已存在，验证其 ParentMission 是否空或与当前父关系完全匹配；冲突不覆盖，进入 drift/blocked。
7. 运行严格校验，父子 link_ref、project_ref、mission_ref 闭合后写父侧 `MissionLink = bound`。
8. 需要推进时请求/启动子 Mission；子 Mission 自己修改本仓库 Mission、Track、reports 和 decisions。
9. 父 Mission Observer 重新读取子 Mission，评估 selected tasks 或跨层 Track projection。
10. 交付满足后才完成父 Task；子 Mission 可继续 active。

父 Mission 可以自动创建外部子 Mission，但不可在没有本地绑定时自动猜测目标仓库。外部仓库不可用时，仅阻断直接依赖该仓库的 operation，其他 ready 分支继续。

## 9. 控制循环与重规划

标准四角色协议由 Mission XNL spec 定义；本 Mission 的具体职责已 materialize 在 ActorSet Description 中。执行仍是持续 level-triggered loop：

```text
load -> observe -> reconcile -> apply ready -> verify -> continue
```

子流程返回不等于父 Mission invocation 返回。只有显式确认、真实 BLOCKED、Mission terminal，或连续完成十个 linked Track checkpoint 才返回。

涉及跨仓库关系、selected targets、Track owner 或 WorkspaceBinding 的变化必须：

- 有 evidence 或 human decision；
- 写 `reports/replan-XXX.md` 或 `reports/human-intervention-XXX.md`；
- 通过 lifecycle CLI 写根状态和 Task 状态；
- 运行 `codument validate <mission-id> --strict`；
- 不重写历史 DONE 节点；失效节点使用 `SUPERSEDED` 并保留原因。

## 10. 兼容与迁移

- 旧 Mission 没有 MissionLink、ParentMission、mission_ref、track_ref 时仍按现有单 Mission/Track 模型读取和校验。
- 旧 TrackLink 不应被强制伪造归属；迁移或修订时由 CLI/AI 根据真实 owner materialize `mission_ref`。
- 旧 Mission 的 ProjectRefs 继续只表达逻辑 id；新跨仓库 Mission 使用本地 `.local/workspace-bindings.xnl`。
- `mission.xml` 兼容读取/迁移规则保持不变；新建与写回继续只使用 `mission.xnl`。
- 新能力的创建、绑定、状态写回和归档必须保持原子性，并使用当前 Kind/version authority。

## 11. 风险与控制

- **路径泄漏**：validator 拒绝 Mission/Track/报告等持久化资源中的 `workspace_path`/绝对路径；只允许 `.local` 本地绑定文件。
- **父子环**：跨仓库解析时做全链路 cycle detection。
- **双重 owner**：验证 Track 的 mission_ref/track_ref 与子 Mission真实 TrackLink，父侧只读投影。
- **子 Mission 漂移**：父侧记录 observed revision/target evidence，关系或目标变化进入 drift/replan。
- **部分交付误判**：SelectedTasks 只允许叶子 Task，且每项需要可解析状态和证据。
- **外部仓库不可用**：UNBOUND/MISSING 只影响直接依赖分支，不阻断无关 DAG 分支。
- **跨机器恢复**：逻辑 id 和 Mission 状态提交；每台机器单独 bind 本地路径，绑定变化不改变业务 revision。
- **版本兼容**：保留旧 Mission 投影，新增字段和校验采用明确 apiVersion/Kind 演化。

## 12. 实施切片

1. 先固化 behavior、Kind/schema 和 XNL 结构。
2. 增加 MissionLink、ParentMission、SelectedTasks 解析与严格验证。
3. 增加 TrackLink `mission_ref`/`track_ref` 和 owner/cross-layer 验证。
4. 增加 `.local/workspace-bindings.xnl` 的 schema、ignore、读取和 bind CLI。
5. 增加外部 Mission create/bind、父子双向写回和原子生命周期操作。
6. 扩展 Observer/Reconciler/Applier 的子 Mission状态投影和 selected-task completion gate。
7. 增加现有资源兼容测试、跨仓库 fixture、跨机器 binding 测试、环/冲突/UNBOUND/MISSING/DRIFTED 测试。
8. 更新规范、命令文档、示例和迁移说明。

每个实现切片都通过对应真实 Track 完成；本 Mission 的 TaskGroup 只表达控制面交付顺序。
