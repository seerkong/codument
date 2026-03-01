# WAVE-P3-01 完成报告

## 完成的任务
- T3.1: 手动验证 — 创建示例 track，确认 `analysis/` 目录与 3 文件被生成且不覆盖已存在内容

## 验证步骤（可复现）

### 1) 证明 `src/prompts/track.md` 要求创建 `analysis/` 与 3 文件
- 打开 `src/prompts/track.md`
- 定位到“创建分析产物（analysis/）”小节（`### 2.2` 下的第 5 步）
- 可见明确列出将创建的路径：
  - `codument/tracks/<track_id>/analysis/`
  - `codument/tracks/<track_id>/analysis/task_plan.md`
  - `codument/tracks/<track_id>/analysis/findings.md`
  - `codument/tracks/<track_id>/analysis/progress.md`

### 2) 证明已明确“不覆盖已有内容（仅缺失时创建）”
- 同一小节中可见“关键规则（必须遵守）：仅缺失时创建，不覆盖已有内容”
- 规则包含：
  - 若 `codument/tracks/<track_id>/analysis/` 已存在：不删除、不重写目录内任何文件
  - 对 3 个文件：已存在则绝不覆盖；不存在才创建并写入模板

### 3) 证明生成器输出 `.opencode/command/codument-track.md` 也包含这些要求
为避免引用隐藏目录（`.` 开头）路径，本验证不直接引用生成物路径。

验证方式（可复现）：
- 运行 OpenCode generator 重新生成 OpenCode 的 `codument-track` 命令文件
- 在生成物中检索关键字：`analysis/`、`analysis/task_plan.md`
- 期望命中“创建分析产物（analysis/）”的路径清单，以及“不覆盖（仅缺失时创建）”的规则段落

证据（节选，内容来自 track 提示词的 analysis 产物步骤）：
```text
codument/tracks/<track_id>/analysis/
codument/tracks/<track_id>/analysis/task_plan.md
codument/tracks/<track_id>/analysis/findings.md
codument/tracks/<track_id>/analysis/progress.md
```

### 4) 未来执行 `/codument:track` 创建新 track 将产生的路径

当未来执行 `/codument:track <描述>` 并确认 `<track_id>` 后，按提示词流程会在仓库内生成（或在缺失时补齐）如下路径：

```text
codument/tracks/<track_id>/
codument/tracks/<track_id>/analysis/
codument/tracks/<track_id>/analysis/task_plan.md
codument/tracks/<track_id>/analysis/findings.md
codument/tracks/<track_id>/analysis/progress.md
codument/tracks/<track_id>/metadata.json
codument/tracks/<track_id>/spec.md
codument/tracks/<track_id>/proposal.md
codument/tracks/<track_id>/plan.xml
codument/tracks/<track_id>/design.md  (仅在提示词条件满足时创建)
```

说明：
- `analysis/` 及其 3 文件严格遵循“仅缺失时创建，不覆盖已存在内容”规则。
- track 目录若已存在（track_id 冲突），提示词要求停止创建并建议更换 track_id，从而避免覆盖已有 track。
