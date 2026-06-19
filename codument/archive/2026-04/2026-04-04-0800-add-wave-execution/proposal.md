# 变更：添加波次执行能力

## 背景和动机 (Context And Why)
当前 codument 的实现命令（/codument:implement）采用单线程顺序遍历 Phase→Task→Subtask 的执行模型。随着项目规模增长，同一 phase 内存在大量可并行的独立任务，顺序执行导致效率低下。同时，编排器将全部上下文加载到单一会话中，随着上下文窗口填充，AI 输出质量逐渐退化（"上下文腐烂"问题）。

借鉴 get-shit-done 项目的波次执行和上下文工程原理，为 codument 引入 wave DAG 调度机制，使同一 phase 内的独立任务可并行执行，同时通过轻量编排器 + 子代理模式解决上下文腐烂问题。

## "要做"和"不做" (Goals / Non-Goals)
**目标:**
- 在 plan.xml schema 中引入 wave DAG 声明（`<waves>` + task `wave` 属性）
- 支持 phase 内 task 按 wave 分组并行执行，phase 间保持严格顺序
- 支持 subtask 递归嵌套和 `<detail_ref>` 外链，应对复杂任务规划
- 引入 `<context_files>` 替代 `<references>` 作为上下文声明机制
- 移除 `<dependencies>` 标签，由 wave DAG 统一表达依赖关系
- 清理 metadata.json 与 plan.xml 之间的重复配置：`commit_mode` 仅保留在 plan.xml 中，从 metadata.json 移除
- 明确 metadata.json 的 `status` 语义为项目级状态（如 codument init 阶段），track 执行状态仅在 plan.xml 的 `<metadata><status>` 中维护
- 新增 4 个命令：discuss、plan-wave、execute-wave、verify
- 扩展 track 目录结构（phases/、waves/、context.md、state.md）
- 所有新增提示词使用中文编写
- 完全向后兼容现有 track 和归档数据

**非目标:**
- 不修改现有 `/codument:track` 和 `/codument:implement` 命令的行为
- 不改动已归档的 plan.xml 文件
- 不引入新的外部依赖
- 不实现跨 phase 的并行执行

## 变更内容（What Changes）
- **plan.xml schema 扩展**：新增 `<execution_mode>`、`<waves>`、`<wave>`、`<context_files>`、`<wave_config>`、`<detail_ref>` 节点/属性；task 新增 `wave` 属性；subtask 支持递归嵌套
- **plan.xml schema 移除**：**BREAKING** 从规范和提示词中移除 `<dependencies>` 标签（旧归档保留不动）
- **metadata.json 瘦身**：**BREAKING** 移除 `commit_mode` 字段（仅在 plan.xml 中维护）；明确 `status` 为项目级状态语义
- **提示词变更**：`plan-xml-spec.md` 更新 schema 描述；`implement.md` 移除依赖检查步骤；track.md 将提交模式选择合并到创建流程的提问中（不再单独提问）；新增 4 个命令的中文提示词
- **解析器变更**：`src/cli/utils/index.ts` 移除 dependencies 解析，新增 wave/subtask 嵌套/context_files 解析；调整 commit_mode 读取来源
- **新增命令提示词**：discuss.md、plan-wave.md、execute-wave.md、verify.md
- **track 目录结构**：新增 context.md、state.md、phases/、waves/ 目录

## 影响范围（Impact）
- 受影响的功能规范：codument-core/spec.md（Plan XML 格式需求修改）
- 受影响的提示词：src/prompts/plan-xml-spec.md、src/prompts/implement.md、codument/std/plan-xml-spec.md
- 受影响的代码：src/cli/utils/index.ts（解析器）
- 受影响的文档：codument/std/AGENTS.md、codument/std/workflow.md
