# 设计

## 术语边界

`operation` 表示 Codument 的用户可调用工作流单元，例如 plan-track、impl-track、archive-track。对应目录为 `std/operations/`，全局 hook 配置为 `operation-hooks.xnl`，资源 Kind 为 `OperationHooks`，成员节点为 `Operation`。

`action` 仅保留在兼容读取、迁移 fingerprint、历史事实以及非 Codument 控制面语义中。当前模板和公开文档不得继续暴露 ActionHooks、action-hooks 或 std/actions。

## CLI-first 分流

- validate：CLI 负责可确定的语法、Kind、结构和引用检查；AI 只补语义质量 review。CLI 不可用时才执行本地降级清单。
- archive-track：先无 `--yes` 调用 CLI。成功后不重复 registry transaction；未完成错误需要用户确认时才带 `--yes` 重试。CLI 尚未承接的显式 operation hook 由调用方在命令前后执行。
- migrate：每个可识别资源先走 `upgrade-resource`。`upgraded|noop` 后只做 AI semantic review；`review-required` 才进入定向修正；只有 CLI 不支持的 Markdown behavior/archive recovery 才进入人工流程。

## 兼容与升级

workspace upgrade 在刷新模板前备份并迁移：

- `config/action-hooks.xnl|xml` -> `config/operation-hooks.xnl`
- `ActionHooks/Action` -> `OperationHooks/Operation`
- `std/actions/` 作为 legacy managed path 删除，由新 `std/operations/` 模板替代

单资源 migration 同时识别 legacy ActionHooks XML/XNL，并输出当前 OperationHooks XNL。

## 验证

- 模板中无当前 `std/actions`、`action-hooks`、`ActionHooks/Action` 口径。
- skill shell 全部路由到 `std/operations`。
- `upgrade-workspace` 能从 legacy action 配置和目录升级。
- 每个已有 CLI 的 operation 具备 CLI-first、成功短路和明确 fallback gate 测试。
- 全量测试、构建与 `git diff --check` 通过。
