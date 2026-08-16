# Track: modernize-real-agent-e2e

## Goal

恢复真实 coding-agent E2E：在临时目录初始化当前 Codument，以 Codex 或 Claude CLI 规划和实现需求，并用当前 XNL Track、delta 与 CLI 完成验证和评分。

## Scope

- 更新 modeling + engineering E2E harness 的 CLI、Track 生命周期和 current XNL fixture。
- 更新代码质量评分器，使其识别 pending/active 的 track.xnl 并支持编译后二进制。
- 增加实际执行临时工作区 smoke harness 的回归测试和便捷命令。

## Non-goals

- 单元测试默认不调用付费或长时间运行的真实 agent。
- 不改变 Codument 的 Track、Modeling 或 Engineering Kind。
