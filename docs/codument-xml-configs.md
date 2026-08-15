# Codument XML 配置写法

本文说明当前版本（track.xml 时代）的 XML 配置怎么组织。核心原则：**XML 只声明显式配置**，不因为文件存在就自动执行额外流程；确定性校验统一由 `codument validate` 等 CLI 命令承担。

> 旧版本文档描述的 `plan.xml`、`operation-hooks.xml`、`artifacts.xml`、`feature.json`、`<attractor-check>` 与 `TODO/IN_PROGRESS/BLOCKED` 状态均已废弃，不再作为当前格式；如需历史迁移映射见 `codument/std/spec/track-xml-spec.md §8` 与 `UPGRADE_TRACK.md`。

## 文件分工

| 文件 | 作用 | 触发方式 |
|------|------|----------|
| `tracks/{pending,active}/<id>/track.xml` | Track 的结构 / 状态 / 调度真源（`<Track>` 三轴：TaskSpace / Schedule / Hooks） | `codument-impl-track` / `codument-validate` |
| `missions/{pending,active}/<id>/mission.xml` | 长周期 Mission 控制面（`<Mission>`，与 track.xml 同构） | `codument-impl-mission` / `codument validate` |
| `codument/config/attractor-profiles.xml` | 命名 attractor 组合，被 `<cdt:AttractorCheck use="<name>"/>` 引用 | 校验到对应节点时按 profile 名解析 |
| `codument/config/action-hooks.xml` | 无独立 track.xml 的 action 生命周期 hook（与 track.xml `<Hooks>` 同语法） | 对应 action 到达 hook point 时 |
| `codument/config/modeling.xml` | modeling registry 能力开关 + lint 阈值 + 归档合并冲突策略 | modeling validate / archive 合并 |
| `codument/config/engineering.xml` | engineering registry 能力开关 + lint 阈值 + 归档合并冲突策略 | engineering validate / archive 合并 |
| `codument/config/cli-tools.json` | AI CLI 工具链配置（非 XML） | `codument init` / `upgrade-workspace` 生成入口 |

## `attractor-profiles.xml`

`<cdt:AttractorCheck use="<name>"/>` 按 profile 名解析；`use` 引用不存在的 profile 时，`codument validate` 报 `attractor-check.profile-unresolved` error 并列出可用 profile。

```xml
<AttractorProfiles version="1">
  <Profile name="coding" enabled="true">
    <Description>编码方向（DEPA 标准架构吸引子 + 项目工程约束）</Description>
    <Attractor ref="vfs://@/codument/std/attractors/depa-attractor.md"/>
    <Attractor ref="vfs://@/codument/attractors/project.md"/>
  </Profile>

  <Profile name="docs" enabled="true">
    <Description>docs 知识方向（分层晋升 + 分形规范）</Description>
    <Attractor ref="vfs://@/codument/std/attractors/knowledge-tiers.md"/>
    <Attractor ref="vfs://@/codument/std/skill/docs-modeling-fractal/index.md"/>
  </Profile>
</AttractorProfiles>
```

## `action-hooks.xml`

用于没有独立 track.xml 的 action（如 `archive-track`、`gap-loop`），与 track.xml `<Hooks>` 共用 `<Hook on>` 语法；typed check 用 `cdt:` 命名空间。

```xml
<ActionHooks version="1" xmlns:cdt="urn:codument:v1">
  <Action name="archive-track">
    <Hooks>
      <Hook on="archive-track:after"><cdt:ArtifactSync use="docs"/></Hook>
    </Hooks>
  </Action>

  <Action name="gap-loop">
    <!-- 全局默认：verify-round 控制「首轮 NO_GAP 后是否再追一轮轻量验证轮」。默认 false。 -->
    <cdt:GapLoopDefaults verify-round="false"/>
  </Action>
</ActionHooks>
```

## `modeling.xml` / `engineering.xml`

registry 能力开关与合并策略；`enabled="false"`（或文件缺失）时相关能力整体跳过。

```xml
<Modeling version="1" enabled="true">
  <Registry dir="vfs://@/codument/modeling/"/>
  <Lint maxLines="400" maxNodes="8"/>
  <MergePolicy>
    <Conflict type="same-field" resolve="human"/>
    <Conflict type="delete-modify" resolve="human"/>
    <Conflict type="add-add" resolve="human"/>
  </MergePolicy>
</Modeling>
```

`engineering.xml` 同构（根 `<Engineering>`，规范见 `std/spec/engineering-registry.md`）。

## track.xml / mission.xml

- 结构 / 状态 / 调度 / 行为三轴的完整规范：`codument/std/spec/track-xml-spec.md`、`codument/std/spec/mission-xml-spec.md`。
- 任务状态枚举：`NOT_STARTED | ACTIVE | DELEGATED | FORWARDED | DONE | REFUSED | ABANDONED`。
- Hook 点：`track:before|after`、`phase:before|after`、`task:before|after`（mission 另有 `mission:after-node`）。
- 校验：`codument validate [item]` 校验 track.xml / behavior_deltas / mission.xml，输出 rule-id + 文件位置 + 消息；`--json` 输出结构化 findings 供 AI 直接消费。

## 校验与 AI 友好输出

所有 XML 配置的确定性规则由 CLI 实现（不依赖提示词自检）：

```bash
codument validate [track-id|mission-id] [--strict] [--json]
codument decisions validate [target] [--json]
codument modeling validate [dir] [--deltas <track>] [--json]
```

每条 finding 形如：`✗ [track.xml] (rule-id) message`；`--json` 输出 `{file, line?, severity, rule?, message}` 数组。
