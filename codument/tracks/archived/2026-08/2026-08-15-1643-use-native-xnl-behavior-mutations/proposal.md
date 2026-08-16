# 使用 XNL 原生 Behavior Mutation

## 背景

Behavior 与 BehaviorPatch 已使用版本化 XNL 作为 canonical 载体，但 archive apply 仍先降为 `SpecXmlNode`，再通过 `children.splice` 手工执行 Upsert/Delete/Move。这使 XNL 内置的 identity、diff、原子 dry-run 与结构校验没有成为实际执行边界。

## 目标

- 保留 `<Upsert { selector = "behavior://..." }>`、`<Delete>`、`<Move>` 业务 DSL。
- canonical Behavior XNL 使用 `diffNodes` 生成 mutation batch，并通过 `dryRunMutations` 原子执行与诊断。
- batch 被拒绝时不写 registry；成功结果与 DSL 期望 AST 做语义一致性校验。
- 跨 capability move 继续由 Codument registry staging transaction 协调源、目标两个文件。
- XML Behavior authority 仅保留迁移期兼容路径。

## 验收

- XNL registry 的 upsert/delete/move 测试证明实际调用原生 mutation 后端。
- invalid batch、identity/结构冲突不会产生部分写入。
- 原有 BehaviorPatch DSL、archive transaction 与 XML compatibility 回归通过。
