# Docs Knowledge Sync And Track Authoring Design

## Knowledge Sync

docs knowledge sync 是可选功能，默认关闭。

启用条件：

```json
{
  "knowledgeSync": {
    "enabled": true
  }
}
```

启用后，Codument 在生成计划和归档时需要考虑知识同步。

## Plan 生成规则

当 knowledge sync 启用时，生成或更新 `plan.xml` 时应加入文档同步任务。

示例：

```xml
<task id="T-sync-knowledge-docs" name="同步项目知识文档" priority="P1" status="TODO">
  <description>根据 feature.json 中配置的 knowledgeSync targets 和对应 attractor，判断并同步受影响的知识目录。</description>
  <acceptance_criteria>
    <criterion checked="false">已读取目标 knowledge attractor</criterion>
    <criterion checked="false">已判断是否需要同步 docs 或外部知识目录</criterion>
    <criterion checked="false">已记录未同步的理由或已完成同步</criterion>
  </acceptance_criteria>
</task>
```

未启用时，不应生成 docs 联动信息。

## Knowledge Hint

spec XML 中可生成 weak hint，但只在 knowledge sync 启用时。

示例：

```xml
<case id="save-new-skill">
  <given>当前 app 有效</given>
  <when>用户保存 skill tool</when>
  <then>系统写入资源与 VFS 数据</then>
  <knowledge-hint
    target="main-docs"
    href="knowledge://main-docs/resource/skill-tool/behavior"
    strength="hint" />
</case>
```

规则：

- hint 不是强外键。
- 链接失效不应默认阻断 archive。
- hint 只帮助 AI 找到候选 docs 更新位置。

## docs-knowledge.md 内容规则

默认 docs attractor 应保持中立，不能写死某个项目的分层。

必须包含：

- 如何定义 canonical knowledge。
- 如何定义 derived knowledge。
- 如何定义 implementation knowledge。
- 如何处理单文件过长后的同名目录升级。
- 如何写 index/navigation 文件。
- 如何隔离资产和正式知识正文。
- track 结束时如何判断是否同步知识。
- good/bad examples。

Good：

```text
routes.md 太长 -> routes/index.md + routes/xxx.md
index.md 只做导航
旧路径迁移写入迁移说明
```

Bad：

```text
继续无限拉长 routes.md
为每个很小条目创建一个文件
index.md 里塞大量正文
把某个项目的目录结构写成所有项目必须遵守的规则
```

## 大型 Track Proposal 规则

当需求较大、设计面较多或 proposal 超过单文件可读范围时，track 应创建：

```text
proposal/
```

`proposal.md` 作为总览，引用子文件。

Good：

```text
proposal.md
proposal/problem-statement.md
proposal/scope-and-compatibility.md
proposal/rollout.md
```

Bad：

```text
把所有背景、范围、兼容性、迁移细节都塞进 proposal.md
创建 proposal/ 但 proposal.md 不引用子文件
引用当前 track 目录外的说明文档作为理解前提
```

## 大型 Track Design 规则

当设计点较多时，track 应创建：

```text
design/
```

`design.md` 作为总览，引用子设计文件。

Good：

```text
design.md
design/spec-vfs-and-xml.md
design/attractors-and-config.md
design/archive-decisions-memory.md
design/docs-knowledge-sync-and-track-authoring.md
```

Bad：

```text
把所有详细设计塞进 design.md
创建 design/ 但 design.md 没有导航
把核心设计放到外部 docs 导致 track 不自包含
```

## Track Prompt 更新点

`codument-track` 提示词需要新增规则：

- 判断需求是否属于大型 track。
- 大型 track 应创建 `proposal/` 和/或 `design/` 子目录。
- `proposal.md`、`design.md` 保持总览和导航职责。
- 子文件必须位于当前 track 目录内。
- 子文件必须被根级 proposal/design 引用。
- 需要给出 good/bad examples。

## Manual Docs And Legacy Migration Skills

新增四个 standalone lifecycle skills，和现有 `codument-*` skill 一样由 prompt source 生成，安装后是多个独立 skill，而不是聚合 skill。

### codument-docs-bootstrap

用途：把一个现存项目按 Codument docs fractal 规范总结到 `docs/modeling` 与 `docs/impl`。

规则：

- 读取 `codument/attractors/`、`codument/config/feature.json`、README、现有 docs、specs、代码入口和测试。
- `docs/modeling` 只写领域模型、能力边界、用户/系统行为、约束与业务术语。
- `docs/impl` 只写实现结构、模块职责、数据流、运行方式、测试策略、集成点。
- 不确定信息写为待确认，不写成事实。
- 允许先做 inventory，再分批写入文档。

### codument-docs-sync-track

用途：将指定 active 或 archived track 的改动同步到 `docs/modeling` 与 `docs/impl`。

规则：

- 读取指定 track 的 proposal、design、spec delta、plan、reports、archive summary 和相关代码 diff。
- 只同步该 track 实际造成的知识变化，不重写整套 docs。
- 同步后记录更新过的文档路径、未更新原因和待确认项。

### codument-migrate-archive

用途：迁移旧 Codument archive 布局到 `codument/archive/YYYY-MM/YYYY-MM-DD-HHmm-track-id/`。

规则：

- 先 inventory 旧 archive 目录，识别旧 `YYYY-MM-DD-track-id`、缺失 `plan.xml`、旧 spec/summary 文件。
- 迁移前创建备份或迁移记录。
- 能确定时间时使用 track metadata 或文件 mtime 生成分钟级路径；不能确定时保留原文并记录原因。
- 不删除无法安全解释的旧内容。

### codument-migrate-specs

用途：迁移旧 Markdown specs 到 XML spec registry。

规则：

- 读取 `codument/specs/**/*.md`、旧 track `spec.md` 和 `codument/legacy/specs`。
- 可安全转换时生成 `codument/specs/<capability>.xml`。
- 大 spec 使用 `codument/specs/<capability>/index.xml` 与 `<include>` 拆分。
- 无法保证语义等价的原文保留到 `codument/legacy/specs` 并标记人工确认。
