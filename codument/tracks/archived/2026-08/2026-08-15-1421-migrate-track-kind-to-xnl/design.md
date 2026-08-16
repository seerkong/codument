# Design: migrate-track-kind-to-xnl

## Canonical Track DSL

```xnl
<Track #example apiVersion="codument.tech/v1alpha1" version="1" {
  status = "in_progress"
  goal = "..."
  description = "..."
  question_mode = "decision-tree"
  question_severity = "auto"
  commit_mode = "manual"
  created_at = "..."
  updated_at = "..."
} (
  <Ports { scope = "track" } [
    <MaterialBundle #input { role = "input" domain = "code" path = "vfs://@/src/" }>
  ]>
  <TaskSpace #space_example { name = "example" version = "1" child_mode = "dag" } (
    <SubNodes [
      <TaskGroup #P1 { name = "phase" status = "ACTIVE" order = 0 } (
        <SubNodes [
          <Task #P1-T1 { name = "task" status = "ACTIVE" order = 0 }>
        ]>
      )>
    ]>
  )>
  <Schedule [
    <Dag { for = "space_example" } [
      <Node #P2 [<After { ref = "P1" }>]>
    ]>
  ]>
  <Hooks [
    <Hook { on = "track:after" } (...)>
  ]>
)>
```

- `apiVersion`/`version` 与 `#id` 使用 XNL metadata/identity channel。
- Track 普通状态与 authoring 属性进入根 `{}`，不再创建 `Metadata` 包装节点。
- `Ports`、`SubNodes`、`Schedule`、`Hooks` 是有领域语义的 collection subdomain，其重复成员进入 `[]`。
- TaskSpace 等唯一子域进入 `()`；TaskGroup/Task 的普通字段进入 `{}`。
- `[]` 不承载 singleton 配置；Hook action、Acceptance、Gate、Description 等唯一概念进入 `()`。

## Runtime adapter

新增 Track resource codec，把 canonical XNL 投影为 CLI 已使用的 normalized tree；validator/status/archive 不直接依赖 xnl-core AST。legacy XML reader投影到同一 normalized tree，因此迁移期只有一个业务读取模型。

文件解析顺序固定为 `track.xnl` 优先、`track.xml` fallback；同目录两者并存视为 authority conflict。所有写操作只写 `track.xnl`。

## Halfcode workspace package

`src/templates/codument/manifest.xnl` 定义 workspace ResourcePackage，catalog 指向：

- `tracks/pending/`，Kind=`Track`，shape=`directory`，entry=`track.xnl`；
- `tracks/active/`，同上；
- `std/kinds/KindDefinitions/`，KindDefinition catalog。

Track KindDefinition 的 DescriptorContract 要求 `proposal.md` 与 `design.md`。Halfcode 负责 package containment、Kind、apiVersion、source shape、identity 与 required material；Codument validator继续负责 TaskSpace、Schedule、Hooks 等领域规则。

## Migration

converter 用结构化 XML parser 读取 legacy Track，按上述领域映射生成 XNL，不做正则拼装。apply 流程为 inspect -> backup -> write temporary -> parse/validate target -> atomic rename -> remove XML。无法唯一投影或 target validation 失败时返回 review-required 并保留原文件。

`upgrade-workspace` 先备份整个 codument tree，再安装受管 manifest/KindDefinition，最后迁移 pending、active 与 archived Track。成功迁移后 AI 仍通过 `codument validate` review 语义。

## Compatibility window

旧 `track.xml` 继续可读、可 validate、可 archive，确保尚未运行 upgrade 的 workspace 不被新 CLI 阻断；新 scaffold 和受管文档只介绍 `track.xnl`。兼容 reader 在后续稳定版本另行移除。
