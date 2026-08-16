# Track: reuse-verification-receipts-and-portable-python

## Why

真实 coding-agent E2E 已证明原子 `track task complete` 能阻止失败验证写入 DONE，但同一验证命令仍会在 task、phase gate 和 executor 最终验证之间重复执行。另一方面，E2E runner 只按版本号选择 Python，可能选中能启动却无法创建可运行 venv 的损坏解释器。

## Goals

- 让 Track CLI 保存成功验证的紧凑回执，并在工作区内容未变化时跨 task/phase/final gate 自动复用相同命令。
- 让回执在实现输入变化后自动失效，并提供显式 fresh 执行入口。
- 保持独立 `codument-verify` 的 fresh 语义，不用实现阶段回执代替独立验收。
- 让开发 E2E 动态选择能创建并运行隔离环境、且能安装生成项目的 Python。
- 给 Agent 的 Python 提示保持短小、工具无关、无固定版本。

## Non-Goals

- 不把验证输出或完整日志写进 Track XNL。
- 不引入远程签名、跨机器缓存或通用 CI 缓存系统。
- 不改变原始 E2E 需求自身声明的 Python 兼容范围。

## Impact

- `codument track verify` 与 `codument track task complete` CLI。
- Track executor / independent verify 的标准提示词及模板。
- `e2e/project-implementation` runner、case verifier 与脚本回归测试。
