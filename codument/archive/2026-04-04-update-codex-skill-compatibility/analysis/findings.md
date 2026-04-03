# Findings

## 当前仓库现状

- `src/cli/generators/codex.ts` 仍然生成 `~/.codex/prompts/codument-*.md`
- `src/cli/commands/init.ts` 选择 Codex 时仍输出“创建 ~/.codex/prompts/codument-*.md”
- `src/cli/commands/upgrade-workspace.ts` 仍备份与升级 `~/.codex/prompts/`
- README、README-cn、UPGRADE_WORKSPACE 仍以 prompts 作为 Codex 主入口说明

## 用户本地现状

- 用户已将 Codument 工作流迁移到：
  - `/Users/kongweixian/.codex/skills/codument-workflow/`
- 当前结构至少包含：
  - `SKILL.md`
  - `agents/openai.yaml`
  - `references/` 下各生命周期参考文件

## 结论

- 在实现 `add-gap-loop-validation` 之前，确实需要先完成这条 Codex 兼容轨道
- 否则后续新增 `/codument:gap-loop` 等能力仍会被写到旧的 prompts 模型中
