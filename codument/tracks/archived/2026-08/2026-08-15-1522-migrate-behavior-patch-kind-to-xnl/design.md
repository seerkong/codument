# Design: migrate-behavior-patch-kind-to-xnl

## Canonical DSL

```xnl
<BehaviorPatch #track.example.behavior_patch.orders apiVersion="codument.tech/v1alpha1" version="1" {
  capability = "orders"
} (
  <Mutations [
    <Upsert { selector = "behavior://orders/requirements/place-order" } (
      <Requirement #place-order (
        <Statement ?>系统 SHALL 创建订单。</?>
      )>
    )>
    <Delete { selector = "behavior://orders/requirements/obsolete" }>
    <Move {
      selector = "behavior://orders/requirements/place-order"
      to = "behavior://checkout/requirements/place-order"
    }>
  ]>
)>
```

## 通道规则

- 根 `#id` 是资源 identity，格式为 `track.<track-id>.behavior_patch.<capability>`。
- `apiVersion`、`version` 是系统级 metadata。
- `capability`、`selector`、`to` 是普通属性，放 `{}`。
- `<Mutations []>` 是 mutation 集合；`[]` 只表达多值子节点。
- `<Upsert>` 只允许一个目标节点，因此放在 `()` singleton extend 中。
- Behavior 子树复用 Behavior Kind 的 `Requirement/Suites/Cases/Ands` codec，避免两套语义。

## CLI 与兼容

`codument behavior-patch create <track-id> <capability>` 在 pending/active 中唯一解析 track，创建 `behavior_deltas/<capability>/delta.xnl` 空骨架并拒绝覆盖。plan-track 随后用原有提示词写入 mutation 和行为正文。

读取入口按内容识别 XNL 或 XML并投影到同一 `SpecXmlNode` patch model。archive apply 与 validator 使用统一解析器；旧函数名保留兼容别名。迁移根据文件所在 track 与 capability 生成稳定 identity，写同目录 `delta.xnl`，验证成功后删除 XML authority。

## 风险与验证

- 非 XNL word 的历史 behavior id 继续降级为 `{ id = "..." }`，保证 selector 无损。
- 对所有现存 patch 执行 workspace migration，并通过 archive/validate/show 回归、Halfcode Kind 校验、全量测试及 `git diff --check`。
