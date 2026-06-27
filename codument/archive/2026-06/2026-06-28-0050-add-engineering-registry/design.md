# Engineering Registry Design

## 背景

`docs/impl/` 当前是长期实现知识的 Markdown 分形树。它有效表达了 overview/howto/rules/examples/reference/troubleshooting 的类目，但和旧 `docs/modeling` 一样缺少机械 delta 和唯一写入者。modeling registry 的解决方案可以迁移：把长期知识迁到 codument 托管 registry，track 写 delta，archive 统一 merge。

## 命名

采用 `codument/engineering/`：

- 比 `impl` 更宽，覆盖维护、操作、排障、参考。
- 比 `design` 更清晰，不和 track `design.md`、`decisions`、`modeling` 抢语义。
- 和 `engineering://...` URI 搭配自然。

## 真源边界

| Registry | 回答的问题 |
|---|---|
| `codument/behaviors/` | 系统应有什么可测行为 |
| `codument/modeling/` | 系统结构真相是什么 |
| `codument/engineering/` | 人和 AI 应如何实现、维护、排障 |
| `codument/decisions/` | 长期承重决策是什么 |
| `codument/memory/` | 可复用经验、事故、模式、摘要 |

## 目录形态

```text
codument/engineering/
  <plane>/
    <category>/
      <topic>.xnl
      <topic>/
        index.xnl
        <leaf>.xnl
```

plane 继承 docs/impl-fractal 的语义：`global`、`backend`、`surface`、`runtime`、`storage`、`agents`、`operations` 等。

category 继承并扩展 docs/impl-fractal：

- `overview`
- `howto`
- `rules`
- `examples`
- `reference`
- `troubleshooting`
- `runbooks`
- `code-map`

## 节点 schema

节点使用 XNL，稳定 id 形如：

```text
#<plane>.<category>.<topic>.<name>
```

Canonical URI：

```text
engineering://<plane>/<category>/<topic>/<name>
```

核心 kind：

| kind | 最小表征 |
|---|---|
| `overview` | `desc` + `mental-model` |
| `howto` | `when-to-use` + `steps` + `verification` |
| `rule` | `rule` + `rationale` + `enforcement` |
| `example` | `scenario` + `walkthrough` |
| `reference` | `scope` + `source-of-truth` + `update-procedure` |
| `troubleshooting` | `symptoms` + `diagnosis` + `fix` |
| `runbook` | `preconditions` + `steps` + `verification` + `rollback` |
| `code-map` | `scope` + `paths` + `update-procedure` |

## Delta 与归档

track 写：

```text
tracks/<id>/engineering_deltas/<plane>/<category>/<topic>.xnl
```

归档：

```text
base = track 创建时的 codument/engineering 宿主 git commit
ours = 当前 codument/engineering
theirs = engineering_deltas
merge = 节点级 3-way merge
```

冲突策略与 modeling 一致：默认 human，配置可覆盖。

## CLI

新增：

```bash
codument engineering validate [dir] [--deltas <track>]
codument engineering lint [dir] [--max-lines N] [--max-nodes N]
```

默认 registry mode 受 `codument/config/engineering.xml` gate 控制；显式 dir 和 `--deltas` 绕过 gate，便于测试与手动校验。

## 测试

参考 modeling：

- `test/resources/engineering-showcase/`：覆盖所有 kind，展示 base/ours/theirs/merged。
- `test/resources/engineering-merge/`：资源驱动三方 merge case。
- `test/cli/engineering/*`：registry/schema/validate/lint/merge/showcase。

