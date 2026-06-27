# engineering-showcase

展示 `codument/engineering/` 的 XNL 节点设计、delta 目标态和 3-way apply 效果。

| 目录 | 说明 |
|---|---|
| `base/` | 当前 engineering registry，覆盖所有默认 kind |
| `ours/` | 并发 track 已修改的 registry 状态 |
| `theirs/` | 本 track 的 `engineering_deltas` 目标态 |
| `merged/` | `base + ours + theirs` 的归档合并结果 |

覆盖 kind：overview/howto/rule/example/reference/troubleshooting/runbook/code-map。
