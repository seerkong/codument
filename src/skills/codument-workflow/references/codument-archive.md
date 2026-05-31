# codument archive - 归档命令

**描述：** 归档已完成的变更追踪

---

## 1.0 系统指令

你是 Codument 规范驱动开发框架的 AI 代理助手。当前任务是归档已完成的 track。

**重要：优先调用 Codument CLI 完成归档。**
- 归档动作优先执行 `codument archive <track_id> --yes`。
- 不要手工 `mv` track 目录来代替 CLI 归档；CLI 会统一处理 archive 路径、spec registry、decisions、projectMemory 与 knowledgeSync 提示。
- 仅当 CLI 不存在或执行失败，才按下文手工归档流程作为 fallback，并在最终结果中明确说明 fallback 原因。

---

## 2.0 归档流程

### 2.1 确定 Track ID

1. **检查输入：**
   - 如果提示词包含具体 track ID，使用该值
   - 如果对话中模糊引用了 track，运行 `codument list` 显示候选项并确认（使用 **Protocol: ask-single-question-closed**）
   - 否则，询问用户要归档哪个 track（使用 **Protocol: ask-single-question-free**）

2. **验证 Track：**
   - 运行 `codument list` 验证 track ID
   - 如果 track 缺失、已归档或未准备好，停止并通知用户

### 2.2 执行归档

1. **检查 Track 状态：**
   - 读取 `codument/tracks/<track_id>/plan.xml` 的 metadata.status，确认 track 状态为 `completed`
   - 如果未完成，警告用户并询问是否仍要归档（使用 **ask-single-question-closed**）

2. **创建归档目录：**
   - 如果 `codument/archive/` 不存在，创建它
   - 归档目录必须使用 track 最后更新时间，而不是执行归档命令的日期
   - 目录格式为 `codument/archive/YYYY-MM/YYYY-MM-DD-HHmm-<track_id>/`

3. **移动 Track 文件夹：**
   - 将 `codument/tracks/<track_id>/` 移动到 `codument/archive/YYYY-MM/YYYY-MM-DD-HHmm-<track_id>/`

4. **更新规范（可选）：**
   - 优先读取 `spec_deltas/**/*.xml`，每个文件必须是 `<spec-patch>`
   - 通过 `spec://` selector 和 `op="upsert|delete|move"` 应用到 XML registry
   - 如目标 capability 不存在，创建 `codument/specs/<capability>.xml`
   - 旧 track 若只有 `spec.md`，可按兼容逻辑读取 Markdown delta；新 track 不应再生成 Markdown spec delta
   - 如果是纯工具变更（无规范增量），跳过此步骤

5. **提升长期知识（可选/按配置）：**
   - 如果 `decisions.md` 中有明确标记为 durable / 长期项目决策的内容，将其提升到 `codument/decisions/YYYY-MM/YYYY-MM-DD-HHmm-slug/decision.md`，并使用 `decision://...` 作为长期引用；普通过程决策只保留在 archive
   - 仅当 `codument/config/feature.json` 中 `projectMemory.enabled=true` 且 track 中显式存在 `memory/lessons|incidents|patterns|summaries/*.md` 时，才提升 `memory://` 内容；不要从 proposal 或普通日志自动合成 memory
   - 仅当 `knowledgeSync.enabled=true` 时，才同步 docs 或其他配置 target

6. **移除活跃目录入口：**
   - 归档通过移动 `codument/tracks/<track_id>/` 完成；不维护额外 registry 文件

7. **验证：**
   - 优先运行 `codument validate --strict` 确认归档后状态正确
   - 如果当前系统中找不到 `codument` 命令，则可跳过这个外部 CLI validate 步骤，不要因此阻塞归档流程
   - 跳过时必须在最终结果中明确说明：外部 `codument validate --strict` 未执行，原因是系统中找不到 `codument` 命令

8. **宣布完成：**
   > "Track '<track_id>' 已成功归档到 `archive/YYYY-MM/YYYY-MM-DD-HHmm-<track_id>/`。"

---

## 3.0 规范更新逻辑

### 3.1 应用 XML spec patch

1. 扫描 `spec_deltas/**/*.xml`。
2. 验证根节点为 `<spec-patch>`。
3. 对每个 mutation 读取 `op`、`selector`、可选 `to`。
4. `upsert` 新增或替换 selector 指向节点；`delete` 删除节点；`move` 移动节点。
5. selector 目标 capability 不存在时，创建 `codument/specs/<capability>.xml`。

### 3.2 旧 Markdown 兼容

旧 track 可能只有 `spec.md` 和 `## ADDED|MODIFIED|REMOVED Requirements`。可以兼容读取，但不要为新 track 创建这种格式。

---

## 4.0 参考

- 使用 `codument list` 确认 track ID
- 使用 `codument list --specs` 查看更新后的 XML registry
- 检查归档后 `codument validate --strict` 通过；如果系统找不到 `codument` 命令，则记录该外部 CLI validate 步骤已跳过
