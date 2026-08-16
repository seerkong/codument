# 设计：CLI authority 与薄 Operation

## 责任边界

CLI 拥有可重复、可验证的机械事实：资源定位、版本骨架、结构校验、生命周期 transition、revision/时间写回、DAG/frontier 计算、路径移动、registry transaction、artifact 文件树映射和冲突检测。

AI operation 继续拥有语义工作：理解目标、拆任务、编写 proposal/design/XNL 业务正文、提出选项和推荐、修改代码、运行领域验收、解释 `review-required` 并做语义等价 review。

## CLI 增量

- `codument track transition <id> <status>`：校验合法状态迁移并更新时间。
- `codument mission transition <id> <status>`：处理 pending/active 路径、状态、revision 与时间。
- `codument mission bind-track <mission-id> <task-id> <track-id>`：验证真实 Track 后原子更新 TrackLink。
- `codument mission archive <id> [--yes]`：完成 precheck、持久信息提升和目录移动。
- `codument list --json`：为 operation 提供稳定的候选集合。
- `codument decisions frontier <file|track-id> --json`：计算当前 pending ready set；问题内容与答复仍由 AI 编写。
- `codument artifact sync --source <dir> --target <dir> [--dry-run] [--force]`：分发 AI 已生成的 staging 文件树，不生成文档语义。
- `codument std lint`：检查普通 operation 的 legacy authoring token、硬编码结构禁令和不存在的 CLI 调用。

参数较多的未来扩展使用 YAML 输入；本 Track 的 transition/frontier/list 参数较少，保持普通 CLI 参数。

## Prompt 收敛

- planning 保留 scaffold、语义 authoring、validate 修复循环；结构细节引用 spec。
- decision-tree 保留何时形成真实决策、如何提问和解释结果；frontier 由 CLI 计算。
- validate 在 CLI 后只做语义 review；CLI 缺失时明确未校验。
- archive/migrate 等写事务只能走 CLI，缺失时 blocked。
- artifact-sync 由 AI 生成 staging，CLI 分发。
- impl/gap 的语义循环仍由 agent 驱动，状态写回改走 transition/bind CLI。

## 兼容策略

legacy XML/CDT 仅存在于 `migrate`、`compat` 和 migration fixtures。普通 operation、protocol 和 method 使用当前无前缀 XNL 名称。CLI validator/migrator继续识别历史格式，但提示词不再教授其写法。

## 测试策略

- CLI 命令以临时 workspace 做状态、路径、revision、frontier 和文件分发测试。
- 原有 malformed Decision/Track/Mission tests 继续作为结构护栏。
- 模板测试只检查 operation 调用 CLI 与责任边界，不锁定具体禁止语句。
- std lint 对模板源执行，并由 `bun run check` 覆盖。
