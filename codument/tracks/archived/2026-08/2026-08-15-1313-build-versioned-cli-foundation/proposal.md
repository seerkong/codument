# 变更：build-versioned-cli-foundation

## 背景和动机

当前 CLI 的命令列表、帮助文本和 switch dispatcher 分散在 `src/cli/index.ts`，子命令由各模块继续手写 switch；help 覆盖测试甚至通过正则读取源代码。与此同时，Track/Mission 仍由提示词手工创建，无法保证新骨架与 CLI 支持的 Kind schema 版本一致。

## 目标

- 建立单一 CommandDefinition 注册表，统一顶层和子命令的 dispatch、help 与测试枚举。
- 保持所有 `-h/--help` 在任何 handler 和副作用前短路。
- 建立内部 Kind registry，声明 `Track`、`Mission` 当前版本 `codument.tech/v1alpha1`。
- 新增 `codument track create <id> --stage pending|active` 与 `codument mission create <id> --stage pending|active`。
- scaffold 只接收 ID 和 stage，自动生成版本匹配的 XML 与基础 Markdown，不创建空 `decisions.xnl`。
- 更新 plan-track/plan-mission 提示词，使其先调用 CLI 建骨架，再由 AI 填写语义内容。

## 非目标

- 不把任务 DAG、proposal、design 或 decision 作为 scaffold 参数。
- 不在本 track 实现历史文件迁移或 Halfcode 接入。
- 不改变现有业务命令的用户可见行为。

## 成功判据

- help 测试从命令注册表自动枚举所有命令路径，不再正则扫描 switch。
- 新命令只接受合法 kebab ID 和 `pending|active` stage，拒绝覆盖与路径逃逸。
- Track/Mission 新骨架包含 `codument.tech/v1alpha1`、当前命名空间、默认 metadata 和必需结构容器。
- `decisions.xnl` 仅在存在真实 decision 时创建。
- source 与 dogfood 模板一致，`bun run check` 通过。
