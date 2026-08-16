# Design: integrate-halfcode-kind-compiler

## Authority 与 projection

```text
src/templates/codument/std/kinds/**/*.xnl
  -> halfcode-compiler.xnl/resource-core validation
  -> generated Codument Kind registry (TypeScript)
  -> compiled codument binary
  -> scaffold / migration / validation
```

XNL package 是 Kind 版本与 cardinality 真源。生成的 TypeScript 是只读、可重建 projection，用于解决 Bun compiled binary 不能在运行时依赖仓库源码路径的问题。构建和测试都执行 generation check，禁止手改 projection。

## Codument Kind package

根 `ResourcePackage` 只登记 `KindDefinition` catalog。首批定义：

- `Track`：当前仍由 XML writer 生成，Kind contract 描述未来 directory/XNL authority 目标与当前 `apiVersion`。
- `Mission`：同 Track，保留长期控制面语义。
- `Decision`：`single-file` + `documentCardinality = "many"`，明确 `decisions.xnl` 是同 Kind forest；嵌套 decision 仍由节点的 `[]` 表示子决策。

KindDefinition 可以带 Codument-specific authoring 属性，但通用版本、shape、cardinality 必须由 Halfcode public contract 读取。

## CLI integration

现有 scaffold writer 继续负责 XML/Markdown 文件内容；它不再拥有版本常量。`KIND_DEFINITIONS` 从 generated projection 组装 stage、collection、entry writer 等 Codument-specific runtime 字段。migration 和 decisions validator 通过同一 accessor 获取目标版本，不再各自硬编码。

## Build lifecycle

新增 Kind registry generator 与 `--check` 模式。`build` 在 template manifest 生成后生成 Kind projection；全量检查验证：

- Halfcode 能加载 Kind package；
- checked-in projection 与 authority 一致；
- scaffold 只用 id/stage 生成匹配版本；
- Decision forest 的 `many` 契约被保留；
- compiled CLI 在临时 workspace 中仍可创建和迁移资源。

本地集成先消费 Halfcode tarball 验证 API，接口稳定后再发布对应 npm 版本并将 Codument lockfile 固定到 registry 包。
