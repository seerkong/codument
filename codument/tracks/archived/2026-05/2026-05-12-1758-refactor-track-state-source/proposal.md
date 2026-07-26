# 变更：统一 Track 状态与元数据真相源

## 背景和动机 (Context And Why)
当前 Codument track 状态与元数据分散在 `codument/tracks.md`、`codument/tracks/<id>/metadata.json` 和 `codument/tracks/<id>/plan.xml` 三处。更新列表或状态时需要同步多个文件，容易出现不一致。需要将 `metadata.json` 中比 plan.xml 更多的信息合入 plan.xml `<metadata>`，并废弃 `tracks.md` 与 `metadata.json` 作为运行时真相源。

## “要做”和“不做” (Goals / Non-Goals)
**目标:**
- 以 `plan.xml` 的 `<metadata>` 作为 track 状态与元数据唯一真相源。
- 通过扫描 `codument/tracks/` 目录查看当前 active tracks。
- 将旧 `metadata.json` 的 `type`、`updated_at`、`description` 等字段纳入 plan.xml metadata。
- CLI 的 list/show/status/archive/validate 等读取路径不再要求 `metadata.json` 或 `tracks.md`。
- 更新 prompt / skill 文档，避免 AI 助手继续维护 `tracks.md` 或 `metadata.json`。

**非目标:**
- 不改变 `spec.md`、`proposal.md`、`design.md` 的语义。
- 不引入新的数据库或全局 registry 文件。
- 不改变 task/subtask 状态枚举与执行语义。

## 变更内容（What Changes）
- **BREAKING**：新初始化项目不再创建 `codument/tracks.md`。
- **BREAKING**：新 track 不再需要 `metadata.json`；track metadata 必须存在于 `plan.xml` 的 `<metadata>` 中。
- `getTracks()` / `getTrack()` 从 `codument/tracks/<id>/plan.xml` 解析 metadata。
- validate 改为校验 plan.xml metadata 必需字段，而不是要求 metadata.json。
- archive 不再从 tracks.md 删除记录。
- prompts、skills、std 文档中关于 tracks.md / metadata.json 的说明改为 plan.xml + tracks 目录。
- 为旧 track 提供兼容/迁移：读取旧 metadata.json 时将额外字段合并进 plan.xml metadata。

## 影响范围（Impact）
- 受影响的功能规范：`codument-core`
- 受影响的代码：
  - `src/cli/utils/index.ts`
  - `src/cli/commands/init.ts`
  - `src/cli/commands/validate.ts`
  - `src/cli/commands/archive.ts`
  - `src/cli/commands/show.ts`
  - `src/cli/commands/list.ts`
  - 相关 tests
  - `src/prompts/**`
  - `src/skills/codument-workflow/**`
  - `codument/std/**`
