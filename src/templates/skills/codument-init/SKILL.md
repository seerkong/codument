---
name: codument-init
description: 初始化 codument 工作区——在项目落地自包含的 codument/（std 标准、config、attractors）并写项目根 AGENTS.md 受管块。首次接入 codument、或运行 init/setup 时使用。
---

# Codument · init

这是 codument **init** 操作的 skill 壳。**权威提示词在工作区** body——打开并**严格遵循**：

`@/codument/std/operations/init.md`

按其中的 Markdown 说明 + `--` 流程标记块执行（落盘 `std/`、`config/`、`attractors/`，建空目录骨架，写根 AGENTS 受管块）。

- **前置**：无（init 自身负责落盘 `codument/std/operations/` 等）；已存在 `codument/` 则转 upgrade 语义、不覆盖用户内容。
- **用法**：`codument-init [path]`（缺省当前目录；默认非交互）。

> 壳只做路由，不重述规则。一切以 `@/codument/std/operations/init.md` 为准。
