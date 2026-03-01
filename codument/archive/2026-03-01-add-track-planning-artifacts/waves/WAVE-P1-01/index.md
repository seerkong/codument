# WAVE-P1-01 完成报告

## 完成的任务
- T1.1: 更新 track 提示词 — 在创建 track 后生成 `analysis/` 产物，并明确“仅缺失时创建，不覆盖已有内容”

## 关键变更
- 更新 `src/prompts/track.md`：新增 `analysis/` 目录与 `task_plan.md` / `findings.md` / `progress.md` 模板，并强调不覆盖规则
- 更新 `codument/tracks/add-track-planning-artifacts/plan.xml`：将 T1.1 标记为 DONE，验收标准置为 checked

## 后续波次需要知道的
- 文档示例（std_agents/AGENTS）尚未补齐对 `analysis/` 的说明（见 WAVE-P1-02 的任务）
- 后续需要重新生成 OpenCode 命令文件，确保 `codument-track` prompt 反映最新内容（见 WAVE-P2-01）
