# 设计：自主工作区迁移

## 用户入口

- `$codument-migrate`：workspace 模式。
- `$codument-migrate <resource-path>`：resource 模式。

用户不需要描述迁移步骤。Skill 从参数是否存在推导范围，并始终读取工作区中的 `codument/std/operations/migrate.md`。

## Authority 边界

CLI 保持确定性：发现资源、备份、转换、验证并返回 JSON receipt。Coding Agent 通过 Skill 承担语义 review、按 diagnostics 修正和循环收敛。CLI 不调用外部 Agent，`--agent` 只用于显式选择 skill 安装位置。

## Workspace 控制循环

1. 运行 `codument upgrade-workspace --json`。
2. 重新打开升级后的 migrate operation，确保后续遵循当前版本协议。
3. 检查 `reviewRequired` 和 `semanticReviewRecommended`。
4. 对每个 review 资源运行 `codument upgrade-resource <path> --json`。
5. `review-required` 时由当前 Agent 读取原 authority、backup、Kind/spec 和相关 registry，做最小语义修正后重跑同一命令。
6. 运行全局、Decision、Modeling、Engineering 和格式验证。
7. 再运行一次 workspace 升级/扫描；没有遗留 review 或旧 authority 才完成。

## JSON Receipt

回执使用普通 JSON，不引入 XNL envelope。字段覆盖：backup 路径、模板和 skills 写入统计、legacy cleanup/lifecycle 迁移统计、资源迁移计数、`reviewRequired`、`semanticReviewRecommended`、冲突和退出状态。人类输出保持原样。

## 兼容性

- 不带 `--json` 的 `upgrade-workspace` 输出与退出码保持兼容。
- 现有 `upgrade-resource` 和底层 `migrate inspect|plan|apply|verify` 不变。
- 已配置的 agent/skills 目标继续按当前配置刷新；迁移 Skill 不主动覆盖为 Codex。

## 测试

- CLI：JSON 可解析、包含 review paths、help 覆盖 `--json`、human output 不回归。
- 模板：无参数 workspace 路由、路径 resource 路由、当前 Agent review、重新读取 operation、完成条件、不使用 `--agent codex`。
- 全量 `check`、build、dogfood、`git diff --check`。
