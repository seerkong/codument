# codument revise-track - 修订现有 Track

**描述：** 在 implement、gap-loop、archive 准备或其他非线性工作中，修订已有 track 的自包含产物。

---

## 1.0 设置检查

1. 验证 `codument/attractors/`、`codument/std/workflow.md`、`codument/workflows/workflow.md` 存在。
2. 读取 `codument/config/attractor-profiles.json`；缺失时使用默认 profile：`project.md` + `product.md`。
3. 如存在 `codument/config/operation-hooks.xml`，读取其中 `operation name="revise-track"` 的 hook 配置。

## 2.0 选择 Track

1. 如果用户提供 track id，精确匹配 `codument/tracks/<track_id>/`。
2. 如果用户提供模糊描述，列出候选并请求确认。
3. 如果无法唯一确定目标 track，停止并请求用户补充。

## 3.0 修订前 Hook

如果 `operation-hooks.xml` 中存在：

```xml
<operation name="revise-track">
  <hook point="before-revise" ...>
    ...
  </hook>
</operation>
```

则在修改任何 track 文件前执行该 hook。常见配置是：

```xml
<attractor-check profile="default" when="before" status="TODO" executor="subagent">
  <result-policy on-gap="confirm-before-fix">
    <confirm protocol="yield-human-confirm" when="after" status="TODO" />
  </result-policy>
</attractor-check>
```

如果 hook 返回 `BLOCKED`，不要修改 track 文件。

## 4.0 修订 Track

读取目标 track 的：

- `proposal.md`
- `design.md` 与 `design/`
- `spec_deltas/**/*.xml`
- `plan.xml`
- `analysis/**`
- `decisions.md` 与 `decisions/`

根据用户请求更新最小必要文件：

- 需求或行为变化：更新 `spec_deltas/`
- 方案变化：更新 `design.md` 或 `design/`
- 任务变化：更新 `plan.xml`
- 新发现或上下文：更新 `analysis/findings.md` 或 `analysis/knowledge.md`
- 待确认决策：追加到 `decisions.md`

所有必要上下文必须保留在目标 track 目录内。不要引用隐藏目录或 track 外部说明文档作为理解修订的必需来源。

## 5.0 修订后 Hook

如果 `operation-hooks.xml` 中存在 `point="after-revise"`，修订完成后执行该 hook。可用于人工确认、吸引子复检或生成下一步建议。

## 6.0 输出

报告：

- 修改过的 track 文件
- 修订原因
- 是否执行了 operation hook
- 推荐下一步：继续 implement、运行 gap-loop、再次 revise-track 或 archive
