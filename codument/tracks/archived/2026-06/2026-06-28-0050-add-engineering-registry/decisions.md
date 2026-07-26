# Decisions

## 1. registry 命名

- 选择：`codument/engineering/`
- 不选择：`codument/design/`、`codument/impl/`、`codument/knowledge/`
- 理由：engineering 覆盖实现、维护、操作、排障、参考，语义比 impl 宽；不抢 modeling/decisions/track design 的边界。

## 2. registry 职责边界

- `engineering` 管“如何实现/维护/排障”。
- `modeling` 管“结构真相”。
- `behaviors` 管“可测行为契约”。
- `decisions` 管“长期承重决策”。
- `memory` 管“可复用经验/事故/模式/摘要”。

## 3. delta 形态

- 复用 modeling 的方式：track 写 `engineering_deltas/` 目标态节点。
- archive 用 base/ours/theirs 三方节点级合并。
- 不自建 XML patch op。

## 4. 节点类别

- 初始 kind：`overview`、`howto`、`rule`、`example`、`reference`、`troubleshooting`、`runbook`、`code-map`。
- 这些 kind 来源于现有 `docs-impl-fractal` 默认类目，并补 `runbook`、`code-map` 表达运维与代码映射。

## 5. 默认开关

- `codument/config/engineering.xml` 默认关闭。
- 显式路径或 `--deltas` 的 validate 可绕过开关，便于测试/手动验证。

