---
name: codument-discuss
description: 执行前讨论并细化某 phase 的任务拆分、调度与风险，落进 track.xml；并把讨论中澄清且稳定的领域知识当轮收敛进 owner 文档。track 已建但任务较粗、实现前对齐时使用。
---

# Codument · discuss

这是 codument **discuss** 操作的 skill 壳。**权威提示词在工作区** body——打开并**严格遵循**：

`@/codument/std/operations/discuss.md`

按其中的 Markdown 说明 + `--` 流程标记块执行；track.xml 格式见 `@/codument/std/spec/track-xml-spec.md`，知识晋升/路由见 `@/codument/std/attractors/knowledge-tiers.md` 与 `model-driven-docs.md`（均由 body 按需引用）。

- **前置**：项目已 `codument-init`，且目标 track 已创建。
- **用法**：讨论 track: `<track-id>` [phase]（缺省下一个未完成 phase）。

> 壳只做路由，不重述规则。一切以 `@/codument/std/operations/discuss.md` 为准。
