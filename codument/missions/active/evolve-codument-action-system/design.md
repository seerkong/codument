# Mission Design

## 控制目标

本 Mission 的期望态是：Codument 以 action 为统一产品表面，具备默认启用且可原子归档的 modeling registry、结构化 Mission ActorSet、清晰且单一 owner 的标准文档分类、精简的 action/skill 分发，以及可安全迁移旧工作区的 upgrade 流程。

实际态由以下证据共同构成：

- 发布真源：`src/templates/codument/**`、`src/templates/skills/**`。
- CLI runtime：`src/cli/**`。
- 生成投影：`src/templates/manifest.ts`。
- 行为真源：`codument/behaviors/codument-core.xml` 与各 track behavior delta。
- 测试证据：`test/**`、E2E scripts、typecheck、build、validate。
- dogfood 投影：build 后通过 `upgrade-workspace` 生成的当前工作区 `codument/std/**` 与 agent skills。

## Mission Actors（当前 Mission 的具体工作方式）

| Actor | 当前 Mission 中的具体职责 |
|---|---|
| MissionPlanner | 按 mission DAG 选择下一条候选 track；根据已完成 track、dogfood 反馈和未满足成功判据修订后续切片。 |
| MissionObserver | 读取发布模板、CLI、tests、behavior、active/archive tracks，以及 build + upgrade-workspace 后的 dogfood 投影；不把投影视为发布真源。 |
| MissionReconciler | 对比期望态与实际态，区分模板源错误、CLI/runtime 错误、迁移错误、文档 owner 重复、分发泄漏和 dogfood 漂移；判断 ready、drift、blocked、done。 |
| MissionApplier | 每轮只执行一个有界动作：创建/绑定/执行/验证/归档一条真实 track，或基于 evidence 受控修订 mission；不绕过 track 直接做大范围实现。 |

目标版本将把这类 Actor 绑定结构化进 `mission.xml` 的 ActorSet，并支持默认 ActorSet + TaskGroup 局部覆盖。本 Mission 创建时仍遵循当前 mission schema，因此本节是当前执行器的控制说明，不提前写入尚未实现的新 XML 节点。

## 事实源与写入边界

- `src/templates/**` 是发布标准 owner；当前 `codument/std/**` 是 upgrade 生成的 dogfood projection。
- behavior、modeling、engineering registry 各自是长期 owner；delta、base snapshot 和 merge result 都不是第二真源。
- archive merge 的纯节点合并函数属于 Processor；git/base 物化、文件 staging、replace/rollback 和 track move 属于 Effect。
- `ProjectRef` 是 mission 持久 Data，只表达逻辑项目身份。
- `WorkspaceBinding` 是 `impl-mission` session runtime 的临时输入和单一 owner，不写入 mission、track、report、decision 或项目配置。
- 外部项目的 `track.xml` 是该 track actual state 真源；控制 mission 中的 TrackLink 只是观察投影。

## Registry 原子归档模型

目标 archive 流程：

```text
读取 track 与配置
  -> prepare behavior mutations
  -> prepare modeling 3-way merge
  -> prepare engineering 3-way merge
  -> 完成全部 schema/引用/冲突检测
  -> staging 所有目标文件
  -> 原子 replace；失败时 rollback
  -> 成功后移动 track
  -> 条件提升 decisions/memory/artifacts
```

任一 prepare、validate、conflict detect 或 commit 失败时，不写任何 registry、不移动 track。实现须覆盖多 registry 同时更新和中途写入失败测试。

## Action 与标准分层

目标目录：

```text
codument/std/
├── actions/       AI 动作执行流程
├── commands/      复杂 CLI 子命令使用说明
├── protocols/     questioning、validation、decision-tree
├── methods/       TDD、DAG execution、workflow
├── spec/          XML/XNL/schema/目录格式
├── attractors/    方向性约束与知识分层
├── compat/        旧路径、旧名称、旧格式迁移映射
└── skill/         modeling/engineering 分形写作参考
```

唯一 owner 纪律：

- action 只完整定义 action-specific 执行流程。
- command 只定义复杂 CLI 的调用方法、副作用、退出和安全说明。
- protocol 只定义跨 action 的交互/验证契约。
- method 只定义共享方法论。
- spec 只定义结构格式。
- compat 只定义旧表面识别与迁移。
- 通用枚举、算法和完整示例只在一个 owner 文档完整出现；其他文件只链接并说明使用点。

## Modeling 默认语义

- fresh init 模板默认 `enabled=true`。
- loader 在配置缺失时的产品默认值同步为 true。
- 显式 `enabled=false` 始终优先，upgrade 不覆盖已有显式配置。
- 空 modeling registry 合法；validate 返回 warning，不报缺 domain 的 error。
- 仅领域对象、状态机、policy、事实源、模块边界、组件 IO 等结构变化生成 delta。
- 第一次有 delta 的成功 archive 创建 registry；无 delta 时不创建空目录或空节点。

## Attractor 策略

- 简短项目约束作为普通 context 直接读取，不执行 fresh AttractorCheck。
- 默认 action-hooks 不在 discuss、impl-quick、plan-track、plan-mission、maintain-track 前执行仪式性检查。
- 普通 track 默认不挂每 phase AttractorCheck。
- 架构、安全、事实源、数据一致性、跨项目契约等高风险工作可仅在最终 scope 执行一次 coding check。
- modeling/engineering/docs 变化只检查相关 scope。
- 用户显式 hook 保留。
- MissionReconcile 与 AttractorCheck 是不同控制环，不互相冒充。

## 受控重规划

允许基于以下 evidence 调整 DAG 或 track 切片：

- archive 原子写入需要独立基础设施 track。
- ActorSet schema 与跨项目 binding runtime 无法在一条 track 中安全闭环。
- operation → action 迁移暴露未识别的用户自定义配置形态。
- E2E 发现某个仓库专用 skill 仍被下游 prompt 间接依赖。
- dogfood upgrade 证明标准分层或 action 精简造成能力丢失。

每次重规划必须写 report，递增 Revision，并说明 trigger、actual、desired、diff、decision 和 applied change。

## 风险与缓解

- **跨 registry 半写入**：先全量 prepare，再 staging + atomic replace/rollback；失败不移动 track。
- **默认 modeling 增加作者负担**：按结构变化触发，不强制空 delta。
- **全面 action 改名破坏自定义 hook**：backup 后结构化迁移，转换成功才删除旧文件。
- **旧词清理误伤历史证据**：旧 `operation` 只限制在新产品表面；archive、fixture、compat 和迁移适配器允许保留。
- **标准拆分造成引用爆炸**：保留 std/AGENTS 路由，action 只引用实际需要的 protocol/method/spec。
- **多项目路径污染仓库**：持久化 ProjectRef，WorkspaceBinding 只在 session runtime 中存在。
- **测试工具移出 skill 后 E2E 失效**：测试直接调用 scripts/CLI/fixture，而非依赖 init 分发的 agent skill。
