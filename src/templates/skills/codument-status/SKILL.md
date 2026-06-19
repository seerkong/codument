---
name: codument-status
description: 从 track.xml 派生项目/track 状态总览——活跃 track、任务进度、可续跑点、现在能做什么、下一步建议。想了解当前进展或恢复中断工作时使用。
---

# Codument · status

这是 codument **status** 操作的 skill 壳。**权威提示词在工作区** body——打开并**严格遵循**：

`@/codument/std/operations/status.md`

按其中的 Markdown 说明执行（扫描 `codument/tracks/` 的 `track.xml`，按 TaskSpace 状态派生进度与续跑点；不读 `state.json` 作为恢复点，执行状态真源即 XML）。

- **前置**：项目已 `codument-init`。
- **用法**：`codument-status`（可选 `[track-id]` 聚焦单个）。

> 壳只做路由，不重述规则。一切以 `@/codument/std/operations/status.md` 为准。
