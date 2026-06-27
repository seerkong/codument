# 变更：新增 engineering registry

## 背景和动机 (Context And Why)

`docs/impl/` 当前保存实现、维护、操作、参考、排障等长期知识，但它和旧 `docs/modeling` 一样是 free-form Markdown，缺少统一写入者、可定位 delta、机械校验和归档合并协议。`codument/modeling/` 已经证明了更稳的模式：用 XNL registry + track delta + archive 3-way merge 管理长期结构知识。

本变更把 `docs/impl-fractal` 表达的长期工程知识升级为 `codument/engineering/` registry。`engineering` 不叫 `design`，避免和 modeling、decisions、track `design.md` 混淆；它表达“如何实现、维护、排障”的工程知识真源。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**

- 新增 `codument/engineering/` registry 规范，承载非 modeling 的长期工程知识。
- 新增 `engineering_deltas/` 规范，track 通过目标态节点表达工程知识变更。
- 新增 engineering CLI 支持：`codument engineering validate`、`codument engineering lint`。
- 新增 XNL registry/merge/schema/validate/lint 实现和测试资源，参考 modeling showcase。
- 更新 track/impl/archive/docs 相关提示词，让 engineering 与 modeling 并行接入。

**非目标:**

- 不把 `modeling`、`behaviors`、`decisions`、`memory` 合并进 engineering。
- 不在本 track 中强制迁移用户已有 `docs/impl/`。
- 不把工程知识回写做成隐式 docs sync；仍通过 delta 和归档管理。

## 变更内容

- 新增 `std/spec/engineering-registry.md`、`engineering-delta.md`、`engineering-node-schema.md`。
- 新增 `codument/config/engineering.xml`，默认关闭。
- 新增 `src/cli/engineering/*` 与 `src/cli/commands/engineering.ts`。
- 新增 `test/resources/engineering-showcase` 与 `test/resources/engineering-merge`。
- 更新模板 manifest、AGENTS/operations 路由、docs-impl-fractal 指向 engineering registry。

## 影响

- 存量项目默认无感，因为 `engineering.xml` 默认 `enabled="false"`。
- 启用后，长期工程知识从 `docs/impl/` 的 free-form Markdown，逐步迁移到 `codument/engineering/` 的 XNL registry。
- archive 标准流程增加条件性 engineering 3-way merge。

