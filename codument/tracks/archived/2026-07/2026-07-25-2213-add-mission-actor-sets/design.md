# Design：Mission ActorSet 与多项目 session runtime

## 上下文

Mission 的四 Actor 是固定控制角色，但每个 Mission 和 TaskGroup 需要绑定不同的具体工作方式。底层库与上层应用的协同迭代还需要跨项目观察 TrackLink，同时不能把开发者机器路径提交到项目。

## 方案概览

1. Mission 根定义 `<cdt:ProjectRefs>` 与 `<cdt:ActorSets default="...">`。
   - 每个 ActorSet 完整包含 Planner、Observer、Reconciler、Applier 各一次。
   - Actor 包含结构化 ProjectRef 引用和本 Actor 在该 Mission 的工作描述。
2. TaskGroup 用 `cdt:actor-set="..."` 整组覆盖；未写时继承 Mission default，嵌套时最近祖先优先。
3. 外部 TrackLink 使用 `project-ref` 指向逻辑项目；host ProjectRef 显式存在，不依赖当前目录猜测。
4. impl-mission 把 `WorkspaceBinding` 作为 session runtime Data：`ProjectRef -> workspace path`。它不能落入任何持久产物。
5. Observer 对外部 ProjectRef 无 binding 时投影 `UNBOUND`；binding 存在而找不到真实 track 时投影 `MISSING`。Reconciler 仅阻断依赖该引用的 ready action；其余 DAG 分支继续。
6. 新增独立 mission validator，校验 ActorSet 完整性、ProjectRef/override/TrackLink 引用、路径字段禁令和 Mission XML 状态，保持 Track validator 不变。

## Actor 工作方式

- Planner：基于绑定项目的证据产出或修订期望 DAG，不执行 Track 实现。
- Observer：只读各 ProjectRef 的 mission/track/archive 实际态，返回 UNBOUND/MISSING/可解析投影。
- Reconciler：比较 desired 与 actual，选择一个准备就绪的有界动作；不写文件，不让无关 UNBOUND 阻断其他分支。
- Applier：只执行获批的一步动作；workspace 写入、Track 调用和外部 Effect 均经 session runtime binding。

## 影响范围与修改点（Impact）

- `src/templates/codument/std/spec/mission-xml-spec.md`
- `src/templates/codument/std/operations/{plan-mission,impl-mission}.md`
- `src/cli/mission/validate.ts` 与对应测试
- `test/templates/**` 与 `src/templates/manifest.ts`

## 兼容性设计

- 旧 mission 缺少 ActorSets 时，首次 plan/revise 受控写入时 materialize 一个完整默认 ActorSet；旧 Mission 在未修改时仍按现有 prose loop 可读。
- 外部 ProjectRef 未绑定不是持久状态或 drift；下一 session 重新提供 binding 后重试 observe。
- 已绑定却找不到 TrackLink 目标才报告 MISSING/drift。

## 风险 / 权衡

- ActorSet 过度抽象会重复执行器实现：因此只表达四角色的具体绑定和工作方式，不引入新的 actor runtime。
- 全量路径保存会泄露机器拓扑：因此 ProjectRef 仅为逻辑身份，WorkspaceBinding 仅为 session 数据。
- 跨项目失败可能影响整体推进：Reconciler 只阻断直接依赖该引用的 action。

## 迁移计划

1. 先为 schema/validator 和 session protocol 写失败测试。
2. 实现 validator 与 canonical template documentation。
3. 更新 plan/impl prompts 和单/多项目 examples。
4. 刷新 manifest、验证 templates 与严格 Mission fixtures。

## 待解决问题

- 无。用户选择已记录于 `decisions.xnl`。
