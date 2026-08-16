# 设计：BehaviorPatch 到 XNL Mutation

## 分层

1. **BehaviorPatch DSL**：`Upsert/Delete/Move` 与 `behavior://` selector 保持用户接口稳定。
2. **语义投影**：复用现有 selector 规则，在隔离 clone 上得到期望 Behavior AST；这一层定义业务操作语义，不直接提交文件。
3. **原生编译**：将当前 Behavior XNL AST 与期望 AST 交给 `diffNodes`，得到 `XnlMutation[]`。
4. **原子预演**：`dryRunMutations(base, batch, { verifyValueBefore: true })`；rejected diagnostics 转成 Codument error。
5. **一致性门禁**：预演结果与期望 AST 的 `diffNodes` 必须为空，之后才序列化写入 staging registry。

## 事务边界

单 capability 的 mutation batch 由 xnl-core 保证隔离与全有或全无。跨 capability move 编译为源 registry 的 delete batch 与目标 registry 的 upsert batch；两个结果只写 archive staging，仍由既有 `RegistryStagingTransaction` 一次 commit 或 rollback。

## 兼容性

- `.xnl` Behavior authority：必须走原生 mutation pipeline。
- legacy `.xml` 或 include-based XML authority：暂走现有兼容执行器，后续由 `upgrade-resource` 迁到 XNL。
- DSL 与 selector 不新增 schema，也不暴露 xnl-core path 给作者。

## 验证

- upsert 新增与替换；delete；同 capability move；跨 capability move。
- dry-run rejection 不写文件。
- native result 与期望 AST 零 diff。
- archive 原子事务与 XML compatibility 回归。
