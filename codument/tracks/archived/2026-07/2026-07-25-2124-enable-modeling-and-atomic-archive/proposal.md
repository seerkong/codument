# 变更：默认启用 Modeling 并建立原子 Registry 归档

## 背景和动机 (Context And Why)

Codument 已有 modeling 的节点级三方合并 Processor，但 archive CLI 只真实接入 engineering merge。与此同时，modeling loader 与 fresh-init 模板仍默认关闭。当前 archive 对 behavior 和 engineering 分步写 live registry，没有跨 registry 的统一 rollback 边界；后续 modeling 接入若沿用这一结构，会扩大半归档风险。

## “要做”和“不做” (Goals / Non-Goals)

**目标:**

- 将缺省 loader 和 fresh-init modeling 模板改为默认 enabled。
- 保留已有 workspace 的显式 `enabled=false`。
- 只在结构知识变化时要求 modeling delta；无 delta 不创建空 registry。
- 把现有 modeling 三方合并接入 archive CLI，并支持首次 delta 创建 registry。
- 让 behavior、modeling、engineering 在共同的 prepare、校验/冲突检测、stage、commit/rollback 边界内更新。
- 任一失败时保持 registry 与 track 位置不变。

**非目标:**

- 不改变 modeling/engineering 节点级冲突算法本身。
- 不强制所有普通 track 生成 modeling delta。
- 不覆盖用户已有的显式 modeling 配置。
- 不在本 track 重组 action taxonomy、Mission ActorSet 或 skill 分发。
- 不手工把 `codument/std/**` 当作发布真源编辑。

## 变更内容（What Changes）

- **BREAKING DEFAULT**：缺失 modeling 配置时从 disabled 改为 enabled；fresh init 模板同步为 enabled。
- 新增 archive registry transaction，将 behavior patch、modeling merge、engineering merge 的 live 写入延后到全部 prepare 成功之后。
- 新增 modeling archive prepare adapter，复用现有 `mergeModeling` 与 modeling registry adapter。
- commit 中途失败时恢复已替换目标，且不移动 track。
- 将空 modeling registry 的 validate 结果从 error 调整为 warning；非空 registry 仍要求 domain plane。
- 增加 CLI archive、首次 registry、无 delta、冲突和故障注入测试。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`codument-core/modeling-config`、`modeling-delta-merge`、`modeling-validate`、新增 `atomic-registry-archive`。
- 受影响的代码：`src/cli/commands/archive.ts`、modeling/engineering registry adapters、可能新增 archive transaction 模块。
- 受影响的发布模板：`src/templates/codument/config/modeling.xml`、相关 modeling/archive 标准说明、生成 manifest。
- 受影响的测试：modeling config/validate、archive CLI、init/upgrade compatibility。
