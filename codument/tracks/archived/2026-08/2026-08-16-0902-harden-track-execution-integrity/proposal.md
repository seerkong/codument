# Track: harden-track-execution-integrity

## 背景和动机

真实 coding-agent E2E 已能完成复杂项目，但日志暴露出 Track 状态与验证事实可能脱钩：Shell 前序验证失败后，后续 lifecycle 命令仍能把任务写成 DONE；已发布 CLI 没有同步 Acceptance/Gate；Track 还能在 criterion 未勾选时进入 completed。当前状态查询、逐级推进和 fresh verify 也会产生不必要的上下文与重复执行。

## 目标

- 为 Track task 提供“运行验证并原子完成”的 CLI 命令，验证失败时不写状态。
- 修复 XNL TextElement Criterion 遍历，确保 Acceptance/Gate 与任务状态一致。
- 让 Track completed gate 和 strict validation 拒绝未完成验收事实。
- 提供紧凑的 Track JSON 查询和 ready-task 查询，并减少可自动推导的 TaskGroup 状态操作。
- 让 verify 先规划唯一证据命令，再把结果复用于多个 Acceptance/Gate/Behavior Case。
- 让真实 Agent E2E 默认构建当前 workspace CLI，并记录二进制来源与校验信息。

## 非目标

- 不处理外部 PostToolUse/diff recorder 导致的日志膨胀。
- 不引入 XNL 或 YAML 格式的复杂执行回执。
- 不把语义验收本身改写成通用程序，也不取消 fresh 独立验证。
- 不自动把 Track 根状态改为 completed；最终收口仍由 executor 显式决定。

## 影响范围

- Codument lifecycle CLI、Track validator、show/ready 查询。
- impl-track、verify 及相关标准提示词和模板回归测试。
- `e2e/project-implementation` 的被测 CLI 构建与 provenance 输出。
- `codument-core` 行为增量。
