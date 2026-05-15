# Findings

- `src/cli/utils/index.ts` 当前 `getTracks()` / `getTrack()` 仍要求 `metadata.json` 存在；若存在 plan.xml，会用 plan.xml metadata.status 覆盖 status。
- `src/cli/commands/init.ts` 当前写入 `codument/tracks.md`。
- `src/cli/commands/archive.ts` 当前归档后尝试从 `tracks.md` 删除记录。
- `src/cli/commands/validate.ts` 当前要求 `metadata.json` 存在并包含 `track_id/type/status/created_at/updated_at/description`。
- `src/cli/commands/show.ts` 当前文件列表包含 `metadata.json`。
- `src/skills/codument-workflow/references/*` 和 `src/prompts/*` 中仍有多处 `tracks.md` / `metadata.json` 指令。
- `codument/std/plan-xml-spec.md` metadata 示例已有 `updated_at`，但缺少 `type` 与 `description`。
