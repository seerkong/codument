# Track: integrate-halfcode-kind-compiler

## 背景

Codument CLI 基座目前在 TypeScript 中手写 Track/Mission Kind registry。它已能生成版本化骨架，但 Kind 版本、XNL forest 约束与迁移目标仍可能在代码、提示词和文件规范之间漂移。Halfcode 已具备 XNL ResourcePackage、KindDefinition、版本契约与 forest cardinality。

## 目标

- 正式依赖 `halfcode-compiler.xnl` 的 public subpaths。
- 用受管 XNL ResourcePackage 定义 Track、Mission、Decision 三类 Codument Kind。
- 构建时由 Halfcode 校验 XNL authority 并生成可嵌入 CLI 二进制的 TS projection。
- scaffold、resource migration 与 decision validation 统一从生成 projection 取得当前版本。
- `upgrade-workspace` 将当前 Kind package 同步到 `codument/std/kinds/`，便于 AI 与用户查阅。

## 非目标

- 本 track 不把现存 `track.xml` / `mission.xml` 改写为 XNL；该迁移由后续 track 单独处理。
- 不把 proposal/design 等自然语言 authoring 编程化。
- 不引入 YAML request manifest 或通用 apiVersion/kind command schema。
