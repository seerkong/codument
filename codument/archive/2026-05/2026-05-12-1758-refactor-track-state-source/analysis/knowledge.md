# Knowledge

- Active track 发现应通过 `codument/tracks/` 目录完成。
- Track 状态枚举：`new` / `in_progress` / `completed` / `cancelled`。
- Task/subtask 状态枚举：`TODO` / `IN_PROGRESS` / `DONE` / `BLOCKED` / `CANCELLED`。
- `plan.xml` metadata 中已有常用字段：`track_id`、`track_name`、`goal`、`created_at`、`updated_at`、`status`、`commit_mode`、`execution_mode`、validation/gap-loop 字段。
- 旧 `metadata.json` 相比常见 plan metadata 多出的关键字段是 `type` 与 `description`，同时 `updated_at` 在旧 metadata 中是必需字段。
