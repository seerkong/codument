## 上下文
Codument 已有三类相关机制：

1. `feature.json`：简单能力开关，适合启用或禁用大类能力。
2. `operation-hooks.xml`：稀疏 XML hook overlay，适合声明某个 operation 到达某个 point 时执行显式 hook。
3. `attractor-profiles.json`：将多个 attractor 文件组合成命名 profile。

artifact sync 需要表达“产生什么制品、使用哪些规则、写到哪里、冲突如何处理”，但不应演化成 pipeline 编排器。设计应保持 compact XML，复杂执行方法放在引用的 workflow/skill/agent/attractor 中。

## 方案概览
1. 新增配置文件 `codument/config/artifacts.xml`
  - 根节点建议为 `<artifact-config version="1">`
  - 子节点只包含 `<resources>` 和 `<artifacts>`
  - 缺失文件表示没有 artifact sync 配置，不改变默认行为

2. `resources` 只支持四类节点
  - `<workflow id="..." ref="codument/workflows/artifacts/...md" />`
  - `<skill id="..." ref="/path/to/SKILL.md" />`
  - `<attractor-profile id="..." name="docs" />`
  - `<agent id="..." executor="main-agent|subagent|fresh-subagent" />`

3. `artifacts` 定义要同步的制品
  - `<artifact>` 使用属性表达 source；目标分发写在 `<targets>`
  - 子节点仅允许 `<uses>`、`<targets>` 和 `<policy>`
  - `<uses>` 引用 resources 中的 resource id
  - `<targets>` 包含一个或多个 `<target>`，表达“同一个制品生成后同步到多个目录”
  - `target.base-dir` 是目标根目录；目录型 artifact 使用 `relative-dir`，文件型 artifact 使用 `relative-file`
  - `<policy>` 表达 dry-run、conflict、provenance 等执行策略

4. `operation-hooks.xml` 触发 artifact sync
  - hook 内使用 `<artifact-sync artifact="..." status="TODO" executor="fresh-subagent" />`
  - `artifact-sync` 只引用 artifact id，不展开 artifact 配置
  - 可继续使用 `<result-policy>` 和 nested `<confirm>` 做执行后策略

## DSL 示例
```xml
<artifact-config version="1">
  <resources>
    <workflow id="sync-target-doc" ref="codument/workflows/artifacts/sync-target-doc.md" />
    <skill id="atm-cli-sync-rule" ref="/Users/kongweixian/ai/ai-team/multica/terminal/skills/atm-cli/SKILL.md" />
    <attractor-profile id="docs-profile" name="docs" />
    <agent id="fresh-doc-agent" executor="fresh-subagent" />
  </resources>

  <artifacts>
    <artifact
      id="atm-cli-usage-doc"
      kind="target-doc"
      enabled="true"
      source-kind="archived-track"
      source-scope="current"
    >
      <uses>
        <use resource="fresh-doc-agent" />
        <use resource="sync-target-doc" />
        <use resource="atm-cli-sync-rule" />
        <use resource="docs-profile" />
      </uses>
      <targets>
        <target id="atm-cli-docs" kind="local-dir" base-dir="/Users/kongweixian/ai/ai-team/multica/terminal/docs" relative-file="atm-cli/usage.md" />
        <target id="team-docs" kind="local-dir" base-dir="/Users/kongweixian/ai/ai-team/docs" relative-file="skills/atm-cli.md" />
      </targets>
      <policy dry-run="first" conflict="diff-confirm" provenance="manifest" />
    </artifact>
  </artifacts>
</artifact-config>
```

Hook 示例：

```xml
<operation-hooks version="1">
  <operation name="archive">
    <hook id="sync-atm-cli-doc-after-archive" point="after-archive" status="TODO">
      <artifact-sync artifact="atm-cli-usage-doc" status="TODO" executor="fresh-subagent" />
    </hook>
  </operation>
</operation-hooks>
```

## Policy 语义
- `dry-run`
  - `never`：直接应用
  - `first`：首次执行先生成预览
  - `always`：每次只生成 diff/report
  - `changed`：目标有实质变更时预览
- `conflict`
  - `block`：冲突时停止
  - `diff-confirm`：输出 diff 并等待确认
  - `merge`：尝试合并后仍输出 diff
  - `overwrite`：直接覆盖
  - `append`：只追加
  - `skip`：冲突时跳过
- `provenance`
  - `none`：不记录
  - `manifest`：生成 manifest
  - `inline`：写入 artifact 内联来源信息
  - `both`：manifest 和 inline 都记录

## 影响范围与修改点（Impact）
- `codument/std/plan-xml-spec.md`：新增 artifacts.xml 和 artifact-sync 示例。
- `codument/std/protocols.md`：新增 artifact-sync 协议。
- `src/prompts/*.md`：更新 archive、artifact-sync、track、validate 等提示词。
- `src/prompts/artifact-sync.md`：替换旧 `docs-sync-track` skill prompt；docs 类同步作为 artifact-sync 的一种 artifact 处理。
- `src/cli/commands/validate.ts`：新增 artifacts.xml 结构校验与 artifact-sync 引用校验。
- `src/cli/utils/feature-config.ts`：提供 artifacts config 路径、feature target 迁移和默认 artifacts.xml 生成逻辑。
- `src/skills/codument-lifecycle.ts`：确保生成的 lifecycle skills 包含 artifact-sync guidance。

## 决策摘要
- 文件名采用 `codument/config/artifacts.xml`。
- 根配置不使用 `pipelines`。
- artifact 子节点仅允许 `uses`、`targets` 和 `policy`。
- resources 下仅允许 workflow、skill、attractor-profile、agent。
- skill 文件只作为同步规则资源，不作为 artifact。
- 一个 artifact 表示一次制品生成；多个同步目录通过同一个 artifact 下的多个 `target` 表达，避免重复生成。
- `codument-artifact-sync` 是正式同步 skill/command 名；不再生成或保留 `codument-docs-sync-track`。
- 旧 `before-knowledge-sync` hook point 删除；archive 相关同步点统一使用 `before-artifact-sync` 或显式 `<artifact-sync>`。

## 风险 / 权衡
- 风险：artifact 属性承载 source/target/output 后可能变长。
  - 缓解：source 保持属性，target/output 迁入 `<targets>`。
- 风险：没有 pipeline 顺序会限制多目标复杂编排。
  - 缓解：通过 operation-hooks 中多个 artifact-sync 节点的顺序表达简单串行；复杂编排未来另建 track。
- 风险：外部路径或绝对路径在不同机器上不可用。
  - 缓解：validate 报告缺失引用；执行时返回 BLOCKED。

## 兼容性设计
- 缺失 `codument/config/artifacts.xml` 不改变现有行为。
- 缺失 `artifact-sync` hook 不触发同步。
- `feature.json` 继续保留 `knowledgeSync.enabled` 和 `projectMemory.enabled` 作为兼容开关；新写出的 feature.json 不再包含空 `targets`。
- `knowledgeSync.targets` 迁出到 `codument/config/artifacts.xml` 的 `<targets>`；新配置不应继续把 targets 写在 feature.json，迁移后也应删除该字段而不是写成空数组。
- 当 `knowledgeSync` 或 `projectMemory` 启用且缺失 `artifacts.xml` 时，`upgrade-workspace` SHALL 生成显式 artifacts.xml；生成后删除已迁移的旧 `knowledgeSync.targets` 字段，避免隐式同步入口。
- 旧 `path`/`output-path` target 字段应迁移为 `base-dir` + `relative-dir|relative-file`；docs knowledge artifact 使用目录型 `relative-dir`，不要固定为单个 `knowledge.md` 文件。
- 当 enabled feature 生成默认 artifacts 时，若缺失 `operation-hooks.xml`，`upgrade-workspace` SHALL 同时生成 archive `after-archive` hook，通过显式 `<artifact-sync>` 触发这些默认 artifact。
- `attractor-profiles.json` 缺失时使用内置 default profile；upgrade-workspace 不应仅为了默认 project/product profile 写出该文件。若旧工作区已经存在“只有内置 default profile”的冗余文件，升级应删除它；只有需要持久化 docs/memory/custom profile 时才写或保留。
- 当 `knowledgeSync.enabled=true` 时，`upgrade-workspace` SHALL 生成项目级 docs 知识吸引子入口，包括 `codument/attractors/docs-knowledge.md`、`codument/attractors/docs-modeling-fractal/index.md` 和 `codument/attractors/docs-impl-fractal/index.md`。`codument/std/docs-*-fractal/` 是内置标准副本，`codument/attractors/docs-*-fractal/` 是 docs profile 实际引用的项目级规则。
- 已存在用户手写 `artifacts.xml` 时，升级命令不覆盖，也不删除旧 targets，避免丢失信息。
- 删除 `docs-sync-track` 旧入口与 `before-knowledge-sync` 旧 hook point 是有意 breaking change，不提供兼容 alias。

## 迁移计划
- 新工作区默认关闭 optional features，不强制创建 `artifacts.xml`。
- 启用 optional features 的旧工作区运行 `upgrade-workspace` 时生成 `artifacts.xml`、默认 `operation-hooks.xml` 和 docs fractal attractor 目录，其中 `docs-knowledge-artifact` 使用 `<attractor-profile name="docs" />`，`docs` profile 在 `codument/config/attractor-profiles.json` 中包含 `codument/attractors/docs-knowledge.md`，并把旧 `knowledgeSync.targets` 转换为多个 `<target>`。
- `attractor-profile` resource 只通过 `name` 引用 profile；不要在该 resource 上使用 direct `attractor` 或 `ref` 属性。旧 target 自身携带的 target-specific attractor hint 可迁移为 target 属性，但默认 docs/memory 指导应来自 profile 配置。
- 原 `docs-sync-track` 的 docs 内容选择、docs/modeling 与 docs/impl 路由、frontmatter 与质量规则迁入 `codument/attractors/docs-knowledge.md`；`codument-artifact-sync` 只负责选择 artifact、解析 resources/targets/policy 并执行同步。
- 旧工作区无需迁移即可继续通过 validate。

## 待解决问题
- 第一版是否只做 validate 和 prompt/skill 协议，不实现真实 artifact 写入。
- 是否需要新 CLI 命令 `codument artifact-sync <artifact-id>` 供手动执行。
