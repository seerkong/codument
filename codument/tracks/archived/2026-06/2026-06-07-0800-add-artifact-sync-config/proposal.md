# 变更：添加 Artifact Sync 配置

## 背景和动机 (Context And Why)
现有 `codument/config/feature.json` 可以表达 `knowledgeSync` 和 `projectMemory` 的简单开关，但它不适合描述更丰富的 artifact 同步需求：不同目标目录有不同写作规则，执行时可能需要引用 workflow、skill、agent、attractor profile，并且同步结果可能是本地文档、目标项目文档、发布制品或 manifest。

用户希望以 XML 配置 `codument/config/artifacts.xml` 表达这些规则，并通过 `operation-hooks.xml` 中的 `artifact-sync` 节点触发同步。

## “要做”和“不做” (Goals / Non-Goals)
**目标:**
- 引入 `codument/config/artifacts.xml` 作为 artifact sync 配置文件。
- 约束顶层只包含 `resources` 和 `artifacts`。
- 约束 `resources` 下只允许 `workflow`、`skill`、`attractor-profile`、`agent` 四类节点。
- 约束 `artifact` 子节点只允许 `uses`、`targets` 和 `policy`。
- 支持同一个 artifact 生成后同步到多个 target 目录。
- 支持 `operation-hooks.xml` 中用 `<artifact-sync artifact="..." />` 引用并执行 artifact。
- **BREAKING**：将原 `codument-docs-sync-track` skill/command 替换为 `codument-artifact-sync`，不保留旧入口兼容。
- **BREAKING**：移除旧 `before-knowledge-sync` hook point，只保留 artifact-sync 术语。
- 复用 `codument/workflows/` 存放项目特定的 artifact sync workflow 指引。
- 保持 XML 精简，把执行细节交给引用的 workflow、skill、agent 和 attractor profile。

**非目标:**
- 不引入 `<pipelines>` 节点。
- 不在 XML 中实现通用 pipeline 编排语言。
- 不把 skill 文件当成 artifact 或 target。
- 第一版不要求实现复杂外部 Web 上传适配器；可保留 DSL 和 validation 扩展点。
- 不删除现有 `feature.json` 的简单能力开关；旧 `knowledgeSync.targets` 迁移到 `artifacts.xml` 后清空。
- 不保留 `codument-docs-sync-track` 或 `before-knowledge-sync` 的兼容别名。

## 变更内容（What Changes）
- 新增 artifact sync XML DSL 文档和协议说明。
- 新增 `codument/config/artifacts.xml` 的 shape、resource、artifact、target、policy 语义。
- 扩展 `operation-hooks.xml` DSL，允许 hook 内包含 `artifact-sync`。
- 扩展 validate 检查 artifacts 配置、artifact 引用、resource 类型和 artifact 子节点限制。
- 扩展 `upgrade-workspace`，在 legacy feature 开关启用且缺失 artifacts.xml 时生成显式 artifacts.xml，并把旧 knowledge targets 移入 artifact targets。
- 更新 track/archive/artifact-sync 等 prompt，让它们知道 artifact sync 是显式 hook，不应隐式执行。
- 删除 docs-sync-track 生成 skill，新增 artifact-sync 生成 skill。

## 影响范围（Impact）
- 受影响的功能规范：`codument-core`
- 受影响的代码：validate 命令、feature/config helper、standard prompt/templates、operation hook guidance、generated lifecycle skills
