# 变更：Track 创建时生成 analysis 规划产物

## 背景和动机 (Context And Why)
Codument 的 track 创建流程包含大量上下文理解、约束分析与方案权衡。在多轮工具调用或长对话中，这些关键发现容易在上下文窗口中丢失。
参考 planning-with-files 的理念，将关键结论写入 track 目录下的持久化文件，可以显著提升后续 plan.xml 质量与执行稳定性。

## “要做”和“不做” (Goals / Non-Goals)

**目标:**
- 在创建 track 目录后，自动生成 `analysis/` 子目录及 `task_plan.md` / `findings.md` / `progress.md`
- 提供足够可用的模板结构，便于持续记录上下文与进展
- 对所有 track 生效（feature/bug/chore/refactor，sequential/wave 都生成）

**非目标:**
- 不新增/改造 codument 的执行器或验证器来强制这些文件的内容格式
- 不改变历史 track 的结构与内容

## 变更内容（What Changes）
- 更新 `/codument:track` 提示词：在创建 `codument/tracks/<track_id>/` 后创建 `analysis/` 产物
- 更新文档/示例（如需要）：说明 track 目录新增 `analysis/` 用途

## 影响范围（Impact）
- 受影响的功能规范：track 创建流程（提示词层）
- 受影响的代码/文件：`src/prompts/track.md`（以及生成到各 CLI 工具的命令文件）
