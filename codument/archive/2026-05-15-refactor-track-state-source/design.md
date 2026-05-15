## 上下文

Codument 目前存在三个 track 状态/元数据来源：
1. `codument/tracks.md`：全局活跃 track 列表。
2. `codument/tracks/<id>/metadata.json`：track 类型、描述、创建/更新时间、状态。
3. `codument/tracks/<id>/plan.xml`：执行计划与 metadata.status。

目标是收敛为：active track 发现只看 `codument/tracks/` 目录，单个 track 状态与 metadata 只看 `plan.xml`。

## 方案概览

1. 扩展 plan.xml metadata
   - 在 `<metadata>` 中标准化以下字段：
     - `track_id`
     - `track_name`
     - `type`
     - `goal`
     - `description`
     - `created_at`
     - `updated_at`
     - `status`
     - `commit_mode`
     - `execution_mode`（可选，默认 sequential）
     - `validation_mode` / `validation_granularity` / `gap_loop_round`（按需）
   - `type`、`updated_at`、`description` 覆盖 metadata.json 中原本存在但 plan.xml 示例不稳定包含的信息。

2. CLI 读取路径
   - `getTracks()`：扫描 `codument/tracks/` 子目录；对每个含 `plan.xml` 的目录解析 metadata。
   - `getTrack(trackId)`：只要 `plan.xml` 存在即可返回 track。
   - 旧 `metadata.json` 仅作为迁移/兼容输入，不作为状态真相源。

3. 旧数据迁移兼容
   - 新增 helper：解析 plan.xml metadata、把旧 metadata.json 中 plan.xml 缺失的字段合入 plan.xml metadata。
   - 合并字段后写回 plan.xml，后续读取以 plan.xml 为准。
   - status 冲突时保留 plan.xml 的 status。

4. 命令更新
   - `init`：不生成 tracks.md；确保创建 `codument/tracks/`。
   - `validate`：不要求 metadata.json；校验 plan.xml metadata 必需字段。
   - `archive`：不更新 tracks.md。
   - `show`：文件列表不再把 metadata.json 作为必需文件。

5. 文档 / prompt / skill 更新
   - 移除“读取/更新 tracks.md”的工作流指令。
   - 移除“创建 metadata.json”的 track 创建指令。
   - 状态、实现、归档、验证、波次规划等 skill 改为读取 `codument/tracks/` + plan.xml。

## 影响范围与修改点（Impact）
- `src/cli/utils/index.ts`：核心解析与读取路径。
- `src/cli/commands/init.ts`：初始化产物。
- `src/cli/commands/validate.ts`：校验规则。
- `src/cli/commands/archive.ts`：归档后不维护 tracks.md。
- `src/cli/commands/show.ts`：显示文件清单。
- `src/cli/utils/index.test.ts`：覆盖无 metadata.json、旧 metadata 合并、plan.xml status 优先。
- prompt/skill/std 文档：同步新真相源约定。

## 决策
- 决策：plan.xml `<metadata>` 是唯一真相源。
- 理由：plan.xml 已承载执行计划与 task 状态；状态更新时只维护一个文件可降低不一致风险。
- 替代方案：继续维护 metadata.json 作为辅助索引。拒绝原因：仍会产生双写与冲突。

## 风险 / 权衡
- 风险：旧 track 的 plan.xml 缺少 `type`、`description`、`updated_at`。
  - 缓解：读取/验证时从旧 metadata.json 合并缺失字段并写回 plan.xml。
- 风险：prompt 中仍残留 tracks.md 指令导致 AI 助手继续写旧文件。
  - 缓解：集中搜索并更新 `tracks.md` / `metadata.json` 文档引用。
- 风险：外部用户依赖 tracks.md。
  - 缓解：作为 breaking change 记录；CLI list 已可通过目录扫描替代。

## 迁移计划
1. 修改 utils，使 plan.xml metadata 解析与旧 metadata 合并可用。
2. 修改命令层，移除 tracks.md / metadata.json 依赖。
3. 更新测试。
4. 更新 prompt / skill / std 文档。
5. 运行 targeted tests 与 typecheck。

## 待解决问题
- 是否保留 `tracksTemplate` 导出：实现阶段可删除，或保留但不被 init 使用。建议删除运行时使用，必要时后续清理模板文件。
