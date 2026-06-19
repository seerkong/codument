# 变更：兼容 Codex 新版 skills 工作流

## 背景和动机 (Context And Why)
当前 Codument 对 Codex 的支持仍基于旧版 `~/.codex/prompts/codument-*.md` 命令文件生成逻辑。但用户当前使用的 Codex 新版本已经不再以 prompts 目录中的 command 作为主入口，而是通过 skills 工作流运行。

用户已经手动将原有 Codument 命令迁移为 Codex skill，落在：

`/Users/kongweixian/.codex/skills/codument-workflow/`

本次变更需要让 Codument CLI 在 `init`、`upgrade-workspace` 等流程里，能够把这套 skill 目录作为 Codex 的标准产物进行初始化、升级和备份，从而兼容新版 Codex。

## "要做"和"不做" (Goals / Non-Goals)
**目标:**
- 将 Codex 支持从旧的 `~/.codex/prompts/` 迁移为 `~/.codex/skills/codument-workflow/`
- 在 `codument init` 时，为选择 Codex 的用户安装/更新 `codument-workflow` skill 目录
- 在 `codument upgrade-workspace` 时，为选择 Codex 的用户备份并更新该 skill 目录
- 将仓库内的 Codex 生成逻辑从 prompt 文件模型改为 skill 目录模型
- 更新 README、升级说明、初始化输出文案，使其反映 Codex skill 模式
- 以用户已完成的 `~/.codex/skills/codument-workflow/` 作为迁移模板来源

**非目标:**
- 不改变 Claude / Gemini / Eidolon / OpenCode 的命令生成方式
- 不在本 track 中重新设计 `codument-workflow` skill 的内容结构
- 不在本 track 中处理 `yield-gap-loop` 协议与 `/codument:gap-loop` 命令

## 变更内容（What Changes）
- **Codex 产物模型切换**：从 `~/.codex/prompts/codument-*.md` 切换到 `~/.codex/skills/codument-workflow/`
- **初始化逻辑更新**：`codument init` 选择 Codex 时，安装 skill 目录而不是 prompts
- **升级逻辑更新**：`codument upgrade-workspace` 对 Codex 的备份、覆盖和完成提示全部切换到 skill 目录
- **生成器更新**：用新的 skill 安装/同步逻辑替代 `src/cli/generators/codex.ts` 当前 prompts 生成行为
- **文档更新**：README、README-cn、UPGRADE_WORKSPACE、init 输出文案改为 Codex skill 模式

## 影响范围（Impact）
- 受影响的代码：
  - `src/cli/commands/init.ts`
  - `src/cli/commands/upgrade-workspace.ts`
  - `src/cli/generators/codex.ts`
- 受影响的文档：
  - `README.md`
  - `README-cn.md`
  - `UPGRADE_WORKSPACE.md`
- 受影响的用户目录目标：
  - `~/.codex/skills/codument-workflow/`
