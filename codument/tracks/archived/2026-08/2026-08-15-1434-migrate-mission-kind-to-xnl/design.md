# Design: migrate-mission-kind-to-xnl

## Canonical DSL

Mission 根使用 `#id` 与 `apiVersion`/`version` metadata；`status`、`goal`、`description`、`question_mode`、`question_severity`、`revision`、时间和 `gap_round` 放根 `{}`。`Ports`、`ProjectRefs`、`ActorSets`、`TaskSpace` 等 singleton 子域放 `()`；其重复成员使用各自 `[]`。`TrackLink`、`MissionReconcile` 等节点在 XNL 中不使用 `cdt:` 前缀。

```xnl
<Mission #example apiVersion="codument.tech/v1alpha1" version="1" {
  status = "active"
  goal = "..."
  revision = 1
} (
  <ProjectRefs [
    <ProjectRef #host { kind = "host" }>
  ]>
  <TaskSpace #space_example { name = "example" child_mode = "dag" } (
    <SubNodes [
      <TaskGroup #G1 { name = "phase" status = "ACTIVE" order = 0 } (
        <SubNodes [
          <Task #G1-T1 { name = "action" status = "ACTIVE" order = 0 } (
            <TrackLink #child { state = "bound" project_ref = "host" }>
          )>
        ]>
      )>
    ]>
  )>
)>
```

## Runtime and migration

Mission XNL 与 legacy XML 都投影到现有 `SpecXmlNode`，复用 `validateMissionXml`。同目录双 authority 报冲突；新写入只写 `mission.xnl`。upgrade 按 backup -> transform -> parse/verify -> atomic rename -> remove XML 执行，失败返回 review-required。

## Halfcode package

workspace `manifest.xnl` 增加 pending/active Mission catalogs；Mission KindDefinition 要求 `proposal.md` 与 `design.md`。Halfcode 验证 containment、Kind、apiVersion、identity、shape 和 required files，Codument validator 负责 ActorSets、ProjectRefs、DAG、TrackLink 与 reconcile 规则。
