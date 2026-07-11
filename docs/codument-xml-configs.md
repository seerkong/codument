# Codument XML 配置写法

本文说明最近迭代中新引入或强化的 XML 配置文件怎么写。核心原则是：XML 只声明显式配置，不因为文件存在就自动执行额外流程。

## 文件分工

| 文件 | 作用 | 触发方式 |
|------|------|----------|
| `plan.xml` | Track 内部执行计划，可在 plan/phase/task 上配置 `<attractor-check>` | implement / execute-wave 执行到对应 scope |
| `codument/config/operation-hooks.xml` | Workspace 级稀疏 hook overlay，用于没有独立 plan 的 operation | 当前 operation 到达配置的 hook point |
| `codument/config/artifacts.xml` | Artifact sync registry，声明可同步 artifact 及其资源 | 只有被 `<artifact-sync>` 显式引用时执行 |

`codument/config/attractor-profiles.json` 不是 XML，但会被 `<attractor-check>` 和 artifacts 里的 `<attractor-profile>` resource 引用。

## `operation-hooks.xml`

`operation-hooks.xml` 用来说明“什么时候触发某个 hook”。它不预先展开所有 Codument 命令，只写需要显性化配置的 operation。

```xml
<operation-hooks version="1">
  <operation name="archive">
    <hook id="archive-docs-check" point="before-archive" status="TODO">
      <attractor-check profile="docs" when="before" status="TODO" executor="fresh-subagent">
        <result-policy on-gap="block" />
      </attractor-check>
    </hook>

    <hook id="sync-artifacts-after-archive" point="after-archive" status="TODO">
      <artifact-sync artifact="atm-cli-usage-doc" status="TODO" executor="fresh-subagent" />
    </hook>
  </operation>
</operation-hooks>
```

常用 operation point：

| Operation | Hook point |
|-----------|------------|
| `track` | `before-start`, `after-spec-delta`, `after-proposal`, `after-design`, `after-plan`, `before-finish` |
| `archive` | `before-start`, `before-spec-apply`, `before-artifact-sync`, `before-archive`, `after-archive` |
| `revise-track` | `before-revise`, `after-revise` |

Hook 的 `status` 使用：

```text
TODO | IN_PROGRESS | DONE | BLOCKED | CANCELLED
```

## `<attractor-check>`

`<attractor-check>` 用于在计划或 operation hook 中执行吸引子校验。

```xml
<attractor-check profile="default" when="after" status="TODO" executor="subagent">
  <result-policy on-gap="confirm-before-fix">
    <confirm protocol="yield-human-confirm" when="after" status="TODO" />
  </result-policy>
</attractor-check>
```

字段含义：

| 属性 | 取值 |
|------|------|
| `profile` | `codument/config/attractor-profiles.json` 中的 profile 名称，缺省为 `default` |
| `when` | `before`, `after`, `both` |
| `status` | `TODO`, `IN_PROGRESS`, `DONE`, `BLOCKED`, `CANCELLED` |
| `executor` | `main-agent`, `subagent`, `fresh-subagent` |

`<result-policy>` 支持：

| `on-gap` | 行为 |
|----------|------|
| `fix-immediately` | 可安全修复时立即修复并复检 |
| `confirm-before-fix` | 修复前先执行 nested `<confirm>` |
| `block` | 发现 gap 立即阻塞 |

## `artifacts.xml`

`artifacts.xml` 用来声明 artifact sync。它不是 pipeline 编排器，不包含 `pipelines` 节点。

根节点固定为：

```xml
<artifact-config version="1">
  <resources>
    ...
  </resources>
  <artifacts>
    ...
  </artifacts>
</artifact-config>
```

### Resources

`resources` 下只允许四种节点：

```xml
<workflow id="sync-target-doc" ref="codument/workflows/artifacts/sync-target-doc.md" />
<skill id="atm-cli-sync-rule" ref="/Users/kongweixian/ai/ai-team/multica/terminal/skills/atm-cli/SKILL.md" />
<attractor-profile id="docs-profile" name="docs" />
<agent id="fresh-doc-agent" executor="fresh-subagent" />
```

约束：

- `workflow` 和 `skill` 必须有 `id` 和 `ref`。
- `workflow.ref` 和 `skill.ref` 在 validate 时必须能解析到已存在文件。
- `skill` 是规则或提示词来源，不是 artifact 输出。
- `attractor-profile.name` 必须能在 `attractor-profiles.json` 中解析。
- `attractor-profile` resource 只写 `id` 和 `name`；不要在该 resource 上写 direct `attractor` 或 `ref`。具体 attractor 文件放在 `codument/config/attractor-profiles.json` 的 profile 定义里。
- `agent.executor` 只能是 `main-agent`、`subagent`、`fresh-subagent`。

### Artifacts

`artifact` 子节点只允许 `uses`、`targets` 和 `policy`。`artifact` 表示一次制品生成，`targets` 表示生成后分发到哪些目标。

```xml
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
```

`target.base-dir` 是目标根目录。目标根目录下的落点按 artifact 类型选择：

- 目录型 artifact 使用 `relative-dir`，例如 `base-dir="docs" relative-dir="."` 表示同步到 `docs/` 目录，由 attractor/workflow 决定该目录下写入哪些文件。
- 文件型 artifact 使用 `relative-file`，例如 `base-dir="/Users/me/team-docs" relative-file="skills/atm-cli.md"` 表示最终写到 `/Users/me/team-docs/skills/atm-cli.md`。

这样拆分是为了支持同一个 artifact 内容生成一次后分发到多个目标根目录，同时允许 docs 类知识体系在一个目标目录下按 `docs-knowledge.md`、`docs-modeling-fractal/`、`docs-engineering-fractal/` 的规则写入多个文件。

多个 target 的核心语义是“同一套生成结果，多目标分发”。目录型 artifact 先生成一套相对文件树，然后把同一套相对文件树写入每个 target 的 `base-dir/relative-dir`；文件型 artifact 则把同一份文件内容写入每个 target 的 `base-dir/relative-file`。不要因为有多个 target 就改变文件名、目录层级或生成不同文件集合，除非 artifact 引用的 workflow 或 skill 明确要求 target-specific 差异。

旧版单目标属性 `target-kind`、`target-path`、`path`、`output-path` 可被迁移读取，但新配置应使用 `<targets>` 下的 `base-dir` 和 `relative-dir|relative-file`。多个 `<target>` 表示同一份 artifact 内容生成一次后同步到多个目标，而不是重复生成多个 artifact。

启用 `knowledgeSync` 或 `projectMemory` 的旧工作区运行 `codument upgrade-workspace` 时，如果还没有 `codument/config/artifacts.xml`，会生成显式配置。只有在需要写入 docs 或 memory profile 时，升级才会创建或补齐 `codument/config/attractor-profiles.json`；普通工作区缺失该文件时使用内置 default profile，不会为了默认值写出配置文件。若旧工作区已经存在只有内置 default profile 的冗余 `attractor-profiles.json`，升级会删除它：

- `docs` profile 包含 `codument/attractors/docs-knowledge.md`。
- `memory` profile 包含 `codument/attractors/project-memory.md`。

生成的 artifact 通过 `<attractor-profile name="docs|memory" />` resource 使用这些 profile；`docs-knowledge.md` 和 `project-memory.md` 不应写成 `attractor-profile` resource 的 direct file 属性。

当 `knowledgeSync.enabled=true` 时，升级使用内置 docs 分形标准：

- `codument/attractors/docs-knowledge.md`
- `codument/std/skill/docs-modeling-fractal/index.md`
- `codument/std/skill/docs-engineering-fractal/index.md`

`codument/std/skill/docs-*-fractal/` 是内置标准副本；docs profile 通过 attractor 引用这些标准与项目级 docs knowledge 规则。

```xml
<artifact-config version="1">
  <resources>
    <agent id="artifact-sync-agent" executor="fresh-subagent" />
    <attractor-profile id="docs-knowledge-profile" name="docs" />
  </resources>
  <artifacts>
    <artifact id="docs-knowledge-artifact" kind="knowledge-doc" enabled="true" source-kind="archived-track" source-scope="current">
      <uses>
        <use resource="artifact-sync-agent" />
        <use resource="docs-knowledge-profile" />
      </uses>
      <targets>
        <target id="knowledge-main-docs" kind="local-dir" base-dir="../main-docs" relative-dir="." />
      </targets>
      <policy dry-run="first" conflict="diff-confirm" provenance="manifest" />
    </artifact>
  </artifacts>
</artifact-config>
```

这会把旧 `feature.json` 中的 `knowledgeSync.targets` 移到 XML 中；`feature.json` 只保留 enabled 开关，不再保留空 `targets`。若旧 target 明确带有 target-specific `attractor` hint，升级可以把它保留为 `<target attractor="...">` 兼容提示；否则默认 docs/memory 指导来自 profile 配置。

如果 enabled feature 生成了默认 artifact，且工作区还没有 `operation-hooks.xml`，升级也会生成显式 archive 后置 hook：

```xml
<operation-hooks version="1">
  <operation name="archive">
    <hook id="after-archive-artifact-sync" point="after-archive" status="TODO">
      <artifact-sync artifact="docs-knowledge-artifact" status="TODO" executor="fresh-subagent" />
      <artifact-sync artifact="project-memory-artifact" status="TODO" executor="fresh-subagent" />
    </hook>
  </operation>
</operation-hooks>
```

这表示归档后才会按 hook 执行对应 artifact。只有 `knowledgeSync.enabled=true`、`projectMemory.enabled=true` 或 `artifacts.xml` 存在，不会触发隐式同步。

### Policy

`policy` 控制执行策略。

| 属性 | 取值 | 说明 |
|------|------|------|
| `dry-run` | `never`, `first`, `always`, `changed` | 是否先生成预览而不直接写入 |
| `conflict` | `block`, `diff-confirm`, `merge`, `overwrite`, `append`, `skip` | 目标已有内容或冲突时怎么处理 |
| `provenance` | `none`, `manifest`, `inline`, `both` | 是否记录 artifact 来源与同步结果 |

推荐默认：

```xml
<policy dry-run="first" conflict="diff-confirm" provenance="manifest" />
```

## Artifact Sync 触发

`artifacts.xml` 只声明 artifact，不会自行运行。必须在 `operation-hooks.xml` 中显式触发：

```xml
<artifact-sync artifact="atm-cli-usage-doc" status="TODO" executor="fresh-subagent" />
```

如果 `artifact-sync` 引用不存在的 artifact，validate 会报错；执行时也应返回 `BLOCKED`。

## 校验

修改这些配置后运行：

```bash
codument validate --strict
```

如果使用本仓库构建产物，也可以运行：

```bash
./dist/codument validate --strict
```

校验会覆盖：

- `operation-hooks.xml` 根节点和 hook point。
- `<attractor-check>` 属性和 profile 引用。
- `<artifact-sync>` 的 artifact 引用。
- `artifacts.xml` 根节点、resource 类型、artifact 子节点、target 节点、policy 枚举。
- `workflow.ref` 与 `skill.ref` 文件是否存在。

## 常见错误

- 把 `SKILL.md` 当成 artifact 输出。它应当是 `<skill>` resource。
- 在 `artifacts.xml` 里写 `<pipelines>`。当前设计没有 pipeline。
- 在 `artifact` 下面直接写 `<target>`、`<source>`、`<output>` 子节点。目标应放在 `<targets><target ... /></targets>` 中。
- 创建了 `artifacts.xml` 后以为会自动同步。只有显式 `<artifact-sync>` hook 才会执行。
- `workflow.ref` 指向不存在的 `codument/workflows/...` 文件。
