# Track: migrate-track-kind-to-xnl

## 背景

Codument 已由 Halfcode XNL KindDefinition 管理 Track 的版本契约，但实际 authority 仍是 `track.xml`，scaffold、validator、status、archive 和提示词都依赖 XML。只保留 XNL schema 而继续生成 XML 会形成长期双制式。

## 目标

- 定义符合 XNL `metadata / attributes / extend / body` 语义的 canonical Track DSL。
- 新 scaffold 改为生成 `track.xnl`，参数仍只有 id 与 stage。
- 新增 Codument workspace `ResourcePackage`，让 Halfcode 发现 pending/active Track directory resources。
- CLI 的发现、读取、validate、status、archive 优先使用 `track.xnl`，并在过渡期读取 legacy `track.xml`。
- 提供确定性 `track.xml -> track.xnl` converter，由 `upgrade-workspace` 备份后迁移历史 Track。
- 更新受管规范与 action/skill 提示词到 `track.xnl`，并在当前项目 dogfood。

## 非目标

- 本 track 不迁移 `mission.xml`、behavior/config XML 或归档目录的 Halfcode recursive catalog。
- 不把 proposal、design、task description 等自然语言内容移入程序化 schema。
- 不保留 XML 与 XNL 两份可写 authority；迁移成功后删除同目录 legacy `track.xml`。
