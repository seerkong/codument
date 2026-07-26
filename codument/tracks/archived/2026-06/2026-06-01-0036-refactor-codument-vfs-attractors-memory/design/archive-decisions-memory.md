# Archive, Decisions, And Memory Design

## Archive 路径

新 archive 路径：

```text
codument/archive/YYYY-MM/YYYY-MM-DD-HHmm-track-id/
```

示例：

```text
codument/archive/2026-05/2026-05-30-1432-refactor-spec-xml-vfs/
```

时间来源不是归档命令执行时间，而是 track 最后更新时间。

优先级：

1. `plan.xml` metadata 中 `updated_at` 或未来 metadata `updatedAt`。
2. track 目录下文件最大 mtime。
3. 当前时间，仅作为 fallback。

## Track UpdatedAt

Codument 需要把 track updatedAt 作为一等字段。

当前 plan.xml metadata 已有：

```xml
<updated_at>...</updated_at>
```

规则：

- Codument 修改 track 文件时应刷新 `updated_at`。
- archive 时如果文件 mtime 晚于 `updated_at`，应优先使用最大 mtime 或提示用户。
- 后补归档时仍按实际迭代最后时间排序。

## Decisions Registry

新增：

```text
codument/decisions/
```

用于存放从 track 过程决策中筛选出来的长期项目决策。

VFS URI：

```text
decision://spec-format/use-xml-vfs-selector
```

物理布局建议：

```text
codument/decisions/2026-05/2026-05-30-1432-use-xml-vfs-selector/decision.md
```

decision 内容应包含：

- status
- source track
- related specs
- context
- decision
- consequences
- supersedes
- superseded by

track 中的 `decisions.md` 是过程决策记录；archive 时只有 durable decisions 提升到 `codument/decisions/`。

## Memory Registry

新增可选：

```text
codument/memory/
```

仅当：

```json
{
  "projectMemory": {
    "enabled": true
  }
}
```

时生成和写入。

目录：

```text
codument/memory/
  lessons/
    YYYY-MM/
      YYYY-MM-DD-HHmm-slug/
        lesson.md
  incidents/
    YYYY-MM/
      YYYY-MM-DD-HHmm-slug/
        incident.md
  patterns/
    YYYY-MM/
      YYYY-MM-DD-HHmm-slug/
        pattern.md
  summaries/
    YYYY-MM/
      YYYY-MM-DD-HHmm-slug/
        summary.md
```

不生成：

```text
codument/memory/index.md
```

原因：

- index 是高冲突文件。
- 多分支、多用户、多 agent 协作时，中心索引容易冲突。
- list/search/summarize 应由 CLI 动态扫描。

## Memory Types

### lessons

存放长期教训。

适合：

- 未来应避免的规则。
- AI 协作失败后沉淀的操作约束。
- 实现、归档、验证中反复出错的经验。

### incidents

存放一次具体事件诊断。

适合：

- 具体 bug。
- 错误归档。
- 验证误判。
- AI 自动修改导致的结构漂移。
- 有明确现象、根因、修复、证据的事件。

### patterns

存放可复用做法或结构模式。

适合：

- single-file -> same-name-folder。
- 启用 knowledge sync 时 plan 增加 docs sync task。
- spec XML 使用 suite/case 组织测试场景。

### summaries

存放对一批 memory 的时间点汇总。

summary 也是追加式文件，不维护中心 index。

## Archive Promotion Flow

归档时：

```text
track://...
  -> spec://...        更新能力契约
  -> decision://...    提升长期决策
  -> memory://...      可选提升长期记忆
  -> knowledge://...   可选同步 docs
  -> archive://...     保存完整历史证据
```

promotion 判断：

1. 是否改变能力契约？是则更新 `spec://`。
2. 是否产生未来仍要遵守的设计选择？是则提升 `decision://`。
3. 是否暴露未来容易再犯的坑、诊断规则或 AI 协作规则？且 projectMemory 开启时，提升 `memory://`。
4. 其他执行证据留在 `archive://`。

