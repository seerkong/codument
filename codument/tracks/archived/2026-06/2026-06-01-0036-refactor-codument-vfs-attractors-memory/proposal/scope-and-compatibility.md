# Scope And Compatibility

## 兼容原则

本 track 涉及 Codument 核心结构，必须优先兼容老项目。

原则：

- 老项目没有 `codument/config/feature.json` 时，所有新增可选能力等价于关闭。
- 老项目已有 `codument/config/feature.json` 时，`upgrade-workspace` 不覆盖已有配置项。
- 老项目已有 `codument/project.md`、`codument/product.md`、`codument/tech-stack.md` 时，不应在 upgrade 中强制删除。
- `codument upgrade-workspace` 必须能把旧项目补齐到新格式，包括 `codument/attractors/`、`codument/config/feature.json`、必要的新标准文件和新目录约定。
- 对无法安全自动转换的旧内容，upgrade 必须保守处理：除写入临时备份外，还要在 `codument/legacy/` 下保留一份可读副本。
- 新项目不再生成 `tech-stack.md`。
- 新项目生成 `codument/attractors/product.md` 和 `codument/attractors/project.md`。
- `std/AGENTS.md` 应优先读取 `codument/attractors/`，但可说明旧项目可能仍存在旧入口。
- `spec.md` 应在迁移期继续可读；XML spec registry 可以渐进引入。

## Upgrade Workspace Compatibility

`codument upgrade-workspace` 是旧项目进入新格式的入口，不应只升级内置标准文件。

升级应执行：

- 创建缺失的 `codument/attractors/`。
- 在缺失时从旧 `codument/product.md`、`codument/project.md` 生成对应 attractor，已存在 attractor 时不覆盖。
- 创建缺失的 `codument/config/feature.json`，默认关闭 `knowledgeSync` 和 `projectMemory`。
- 创建或保留 `codument/legacy/`，用于保存不能安全迁移但仍需要长期可见的旧格式内容。
- 对旧 Markdown specs、旧项目上下文文件、旧标准文件等不便自动转换的内容，保留原位置兼容读取，同时复制到 `codument/legacy/<category>/...`。
- 如果实现已有临时备份目录，仍可继续写入临时备份；但临时备份不能替代 `codument/legacy/`，因为 legacy 是 workspace 内长期可见的迁移证据。

升级不得执行：

- 不得删除旧 `codument/project.md`、`codument/product.md`、`codument/tech-stack.md`。
- 不得把旧 Markdown spec 强制改写成 XML，除非转换器能保证语义等价并保留原文。
- 不得覆盖用户已经编辑过的 attractor、feature config 或 legacy 文件。

旧 spec 迁移策略：

- `codument/specs/**/spec.md` 继续可读。
- XML registry 可以为新 capability 或安全转换后的 capability 启用。
- 对无法安全转换的 Markdown spec，复制到 `codument/legacy/specs/...`，并保留原 `codument/specs/...` 供兼容命令读取。
- validate/list/show 必须能识别迁移期的 Markdown spec、XML spec 和 legacy-preserved spec。

## Feature Gates

新增配置文件：

```text
codument/config/feature.json
```

默认语义：

```json
{
  "knowledgeSync": {
    "enabled": false,
    "targets": []
  },
  "projectMemory": {
    "enabled": false
  }
}
```

如果文件缺失，行为等同于上述默认值。

`knowledgeSync.targets[]` 支持：

```json
{
  "name": "main-docs",
  "root": "docs",
  "attractor": "codument/attractors/docs-knowledge.md"
}
```

`root` 可以是 workspace 相对路径，也可以是绝对路径。绝对路径用于同步 workspace 外知识库时必须由配置显式声明。

## Archive Compatibility

新的 archive 路径：

```text
codument/archive/YYYY-MM/YYYY-MM-DD-HHmm-track-id/
```

旧路径：

```text
codument/archive/YYYY-MM-DD-track-id/
```

读取 archive 时必须同时支持新旧格式。写入新 archive 时只使用新格式。

archive 时间来源：

1. `plan.xml` metadata 中的 `updated_at` 或未来 track metadata 的 `updatedAt`
2. track 目录下文件最大 mtime
3. 当前时间，仅作为 fallback

## Memory Compatibility

`codument/memory/` 只有在 `projectMemory.enabled=true` 时才生成。

目录结构：

```text
codument/memory/
  lessons/YYYY-MM/YYYY-MM-DD-HHmm-slug/lesson.md
  incidents/YYYY-MM/YYYY-MM-DD-HHmm-slug/incident.md
  patterns/YYYY-MM/YYYY-MM-DD-HHmm-slug/pattern.md
  summaries/YYYY-MM/YYYY-MM-DD-HHmm-slug/summary.md
```

不生成中心 `index.md`。

## Docs Knowledge Sync Compatibility

启用 `knowledgeSync` 后：

- 计划生成应添加知识同步任务。
- 执行知识同步任务时必须读取配置 target 的 attractor。
- 如果 target root 不存在，应报告并要求用户确认，不应静默创建 workspace 外目录。
- spec XML 中的 docs link 只作为 weak hint，不作为强外键。

未启用时：

- 不生成 `knowledge://` hint。
- 不要求更新 docs。
- 不创建 docs attractor。
