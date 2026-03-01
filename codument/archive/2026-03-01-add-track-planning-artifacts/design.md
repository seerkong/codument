## 上下文
该变更属于“提示词驱动”的流程增强：Codument 的 track 创建并非由 codument CLI 直接生成所有 track 文件，而是通过 `/codument:track` 提示词指导 AI 助手创建目录与文件。
因此实现重点是：更新 track 提示词，确保在合适的时机创建 analysis 产物，并避免覆盖用户已有内容。

## 方案概览
1. 更新 track 提示词（`src/prompts/track.md`）
  - 在创建 `codument/tracks/<track_id>/` 后，新增一个步骤创建 `analysis/` 目录与 3 个文件
  - 提供模板内容（task_plan/findings/progress）
  - 行为约束：已存在文件不覆盖，仅缺失时创建
2. 更新生成器输出（各 AI CLI 工具的命令文件）
  - 重新生成 `codument-track` 对应的命令文件

## 影响范围与修改点（Impact）
- `src/prompts/track.md`：新增 analysis 产物步骤与模板
- `src/cli/generators/*`：无需逻辑变更，仅需重新生成输出（若仓库提交生成物）

## 决策
- 决策：analysis 目录对所有 track 生效
- 理由：上下文记录对 bug/refactor 同样有价值；不需要引入模式判断

## 风险 / 权衡
- 风险：模板太长导致提示词膨胀
  - 缓解：模板可裁剪；重点保留结构与关键段落
- 风险：覆盖用户已有内容
  - 缓解：明确“仅缺失时创建，不覆盖”

## 兼容性设计
- 不修改历史 track
- 不强制 validate 检查 analysis 文件

## 待解决问题
- 是否需要在文档中显式展示 `analysis/` 目录结构与用途
