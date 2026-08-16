# 方案设计：XNL authoring 误用清理

## 上下文

XNL 有四个容易混淆的承载位：

- `metadata`：标签头部 `key=value`，仅保留给系统级/控制面字段。
- `attributes`：`{ key = value }`，普通节点属性的 canonical 承载位。
- `extend`：`()`，唯一子节点语义，适合单例槽位。
- `body`：`[]`，数组/列表语义，适合集合。

本 track 统一修正历史误用，并给未来生成器/作者一组可测试的规则。

## 方案概览

1. 建立规则：
   - 普通属性：`{}`。
   - 系统控制字段：metadata。
   - 单例语义槽位：`()`。
   - 下级节点集合：`[]`。
2. 清理库存：
   - `codument/std` 与 `src/templates/codument/std` 中的旧示例。
   - modeling/engineering showcase 和 validate fixtures。
   - merge tests 中用 `a/b` 普通字段验证 metadata diff 的旧假设。
3. 保留兼容：
   - schema/validate 继续兼容 legacy metadata。
   - 明确标注 legacy fixture，不让它伪装成 canonical 示例。
4. 防回归：
   - 增加 focused rg/parser-based tests。
   - 可选新增 `codument xnl lint` 或在现有 tests 中做静态扫描。

## 排查初稿

### metadata/attribute 误用候选

- `codument/std/spec/modeling-node-schema.md` 当前 workspace std 仍有 `<object ... kind="entity" ...>` 等旧示例。
- `codument/std/spec/engineering-node-schema.md` 当前 workspace std 仍有 `<rule ... kind="rule" applies_to=...>` 旧示例。
- `test/resources/modeling-showcase/**`、`test/resources/modeling-validate/**`、`test/resources/modeling-merge/**`。
- `test/resources/engineering-showcase/**`、`test/resources/engineering-validate/**`、`test/resources/engineering-merge/**`。
- `test/cli/modeling/merge.test.ts`、`test/cli/*/merge-resources.test.ts` 中对 `node.metadata.a/b` 的断言。

### extend/array 误用候选

- `codument/tracks/update-decisions-xnl` 已修正为 `()` 单例槽位 + `[]` 子决策集合。
- 后续需排查所有新增/计划中的 `decisions.xnl`、`decision-tree.xnl` 示例和模板。
- modeling/engineering registry 的 `[]` 通常表示多表征集合，不应机械迁移；只修正有明确单例槽位语义的 DSL。

## 影响范围与修改点（Impact）

- 文档和模板：同步 `src/templates` 与当前 `codument/std`。
- 测试资源：区分 canonical fixture 与 legacy fixture。
- CLI/validator：保持 attributes 优先、metadata fallback；如添加 lint，legacy 文件需可豁免。
- manifest/build：模板变更后必须刷新 `src/templates/manifest.ts`。

## 决策摘要

- 详见 `decisions.xnl`。
- 已接受：创建独立 track；同时覆盖 metadata/attribute 误用与 extend/array 误用。

## 风险 / 权衡

- 风险：一次性迁移大量 fixture 造成 merge/diff 测试语义变化。
  - 缓解：先迁移 canonical fixtures，保留少量 legacy fixtures 覆盖兼容。
- 风险：把所有 `[]` 都视为错误会误伤 modeling/engineering 多表征节点。
  - 缓解：只针对 DSL 单例槽位做规则，避免泛化过度。
- 风险：`codument/std` 与模板漂移。
  - 缓解：实现阶段 build + `codument upgrade-workspace` 吃自己狗粮。

## 待解决问题

- 防回归应放在通用 `xnl lint`，还是先放在模板/fixture focused tests。
