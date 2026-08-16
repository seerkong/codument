# Track: add-stream-pipeline-agent-e2e

## Goal

新增一个真实 coding-agent E2E：在全新工作区初始化当前 Codument，将 `stream-pipeline-ai-agent.md` 的原始需求作为业务输入，要求 Agent 使用 Codument 完成规划、实现和验证。

## Scope

- 以独立叶子目录保存原始需求文件，不把任务正文写进 runner。
- 提供可选择 Codex/Claude 的单次真实 Agent runner，并保留临时工作区和完整日志。
- 独立验证 Codument Track、Python 项目结构、OpenAI/RxPY 依赖、关键数据流实现和 pytest。
- 提供不调用真实 Agent 的初始化 smoke，以及对应自动化测试和 npm script。

## Non-goals

- 不在 Codument 仓库内实现 stream pipeline 项目本身。
- 不把真实 Agent 长时间执行加入默认单元测试。
- 不复用面向 TypeScript 应用的 modeling-engineering 质量分数作为 Python 项目的通过条件。
