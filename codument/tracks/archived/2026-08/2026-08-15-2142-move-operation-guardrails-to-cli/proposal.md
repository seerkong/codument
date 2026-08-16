# 将 Operation 机械护栏迁入 CLI

## 背景和动机

Codument 已经具备版本化 scaffold、结构校验、资源迁移和 Track 归档 CLI，但 `std/operations` 仍重复描述大量结构禁令、旧 XML/CDT 兼容形态和手工事务步骤。真实 E2E 已证明这种双重 authority 会诱导 agent 生成旧结构；生命周期状态、Mission 归档、Decision frontier 和 artifact 分发等确定性步骤也仍由提示词直接修改文件。

## 目标

- 普通 operation 只保留语义规划、实现、提问、证据判断和 CLI 编排，不再重复结构 validator 或 legacy authoring 禁令。
- 清理当前提示词中的旧 XML/CDT、`ADDED/MODIFIED/RENAMED` 与过期 skill 路由。
- 由 CLI 原子处理 Track/Mission 生命周期状态、Mission TrackLink 绑定与 Mission 归档。
- 由 CLI 提供 Decision frontier、结构化资源列表和 artifact 文件树分发等确定性能力。
- 增加 std lint 和行为测试，把错误挡在 CLI/build，而不是依靠提示词记忆。
- 缩短 validate/archive/migrate/artifact-sync operation，CLI 不可用时对写事务 fail closed。

## 非目标

- 不把 proposal、design、任务描述、决策理由或业务 XNL 正文改成程序生成。
- 不把 Mission 的语义 observe/reconcile、Track 的代码实现或验收判断改写为 CLI runner。
- 不恢复已经废弃的 artifacts.xml、XML Track/Mission 或 `cdt:` authoring 口径。

## 影响范围

- `src/cli` 命令注册、资源 transition、Decision 与 artifact helpers
- `src/templates/codument/std/{operations,protocols,methods}` 及当前工作区 dogfood 副本
- skill shells、模板 manifest、CLI 与模板测试
- 当前 mission 的 G3 计划和绑定报告

## 验收

- 当前 operation 不再携带会诱导新文件使用 XML/CDT 的冲突规则。
- 结构错误由 CLI 测试证明会被拒绝，模板测试不再断言具体“禁止”措辞。
- Track/Mission 状态和 TrackLink 变更通过 CLI 命令完成并保持时间/revision/路径一致。
- Decision frontier、`list --json`、artifact staging 分发有 CLI 测试。
- `bun run check`、`bun run build`、`git diff --check` 通过。
