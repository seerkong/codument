# codument artifact-sync - Artifact 同步命令

**描述：** 根据 `codument/config/artifacts.xml` 中的 artifact 定义，执行显式 artifact 同步。

---

## 1.0 目标

你是 Codument artifact 同步代理。当前任务是只同步用户指定或 hook 引用的 artifact。

不要把 artifact-sync 退化为旧 docs-sync。docs 类同步只是 artifact 的一种，内容选择和写作规则由 `codument/attractors/docs-knowledge.md` 以及 artifact 使用的 attractor profile 提供。

本 skill 是普通同步流程，不需要 gap-loop 式 fresh child orchestration；只有用户显式要求独立复检时才考虑委派子代理。

---

## 2.0 Artifact 选择

1. 读取 `codument/config/artifacts.xml`。
2. 如果用户提供 artifact id，必须精确匹配 `<artifact id="...">`。
3. 如果当前来自 `operation-hooks.xml` 的 `<artifact-sync artifact="..." />`，只执行该 hook 引用的 artifact。
4. 如果无法唯一确定 artifact，停止并请求用户补充 artifact id。
5. 不要因为 `artifacts.xml` 存在就同步全部 artifact。

---

## 3.0 必读输入

必须读取：

- `codument/config/artifacts.xml`
- `codument/config/attractor-profiles.json`
- `codument/std/protocols.md`
- artifact 的 `<uses>`、`<targets>` 和 `<policy>`
- artifact 引用的 workflow、skill、attractor-profile、agent resource

如果 artifact 的 source 指向 track，还应读取该 track 中存在的：

- `proposal.md` 与 `proposal/`
- `design.md` 与 `design/`
- `spec_deltas/**/*.xml`；旧 track 兼容 `spec.md`
- `plan.xml`
- `decisions.md` 与 `decisions/*.md`
- `reports/*.md`
- archive 中的 `summary.md`

docs 类 artifact 还必须读取：

- `codument/attractors/docs-knowledge.md`
- `codument/attractors/docs-modeling-fractal/index.md`
- `codument/attractors/docs-impl-fractal/index.md`
- 现有 `docs/modeling` 与 `docs/impl`（如果目标是本项目 docs）

---

## 4.0 Artifact Sync 规则

- `resources` 只允许 `workflow`、`skill`、`attractor-profile`、`agent`。
- `skill` resource 是规则或提示词来源，不是要写出的 artifact。
- `attractor-profile` resource 只引用 profile 名称；不要把直接 attractor 文件写在 resource 属性上。
- `artifact` 子节点只允许 `uses`、`targets`、`policy`。
- 多个 `<target>` 表示同一 artifact 内容生成一次后分发到多个目标，不表示多个独立 artifact。
- 每个 target 必须有 `id`、`kind`、`base-dir`，并且在 `relative-dir` 和 `relative-file` 中二选一。
- 目录型 artifact 使用 `relative-dir`，表示同步到目标根目录下的一个目录；文件型 artifact 使用 `relative-file`，表示同步到目标根目录下的单个文件。
- 多 target 分发必须保持相同的相对路径结构：如果 artifact 生成多个有层级关系的文件，先得到一套相对文件树，再把同一套相对文件树写入每个 target 的 `base-dir/relative-dir` 下。
- 不要因为存在多个 target 就为不同 target 生成不同文件集合、不同文件名或不同层级；除非 artifact 的 workflow 或 skill resource 明确要求 target-specific 差异。
- 文件型 artifact 的多个 target 也必须使用相同生成内容，只是写到各自 `base-dir/relative-file`。
- 按 `<policy>` 处理 dry-run、conflict 和 provenance。

---

## 5.0 执行流程

1. Scope：确认 artifact id、触发来源和目标范围。
2. Resolve：解析 resources、profile、targets 和 policy。
3. Source：读取 artifact source 和相关上下文。
4. Generate：按 workflow、skill 和 attractor profile 生成 artifact 内容。
5. Preview：按 policy 决定是否先输出 diff/report。
6. Apply：把生成结果按同一相对路径结构分发到每个 target。
7. Provenance：按 policy 生成 manifest 或 inline 来源信息。
8. Report：列出 artifact id、target 输出、变更文件、跳过原因和待确认项。

如果项目尚无 `docs/modeling` 或 `docs/impl`，docs 类 artifact 只能创建与当前 artifact source 直接相关的小文档；不要退化为全量 docs bootstrap。

---

## 6.0 约束

- 不要执行未被指定或未被 hook 引用的 artifact。
- 不要因为 `knowledgeSync.enabled=true`、`projectMemory.enabled=true` 或 `artifacts.xml` 存在而隐式同步。
- 不要把普通实现细节写入 docs modeling。
- 如果同步存在争议，优先输出待确认事项而不是断言。
- `codument validate ...` 可能会格式化或补写 track metadata；运行验证后必须检查 `git diff`，并在报告中区分验证副作用和本次 artifact sync 修改。
