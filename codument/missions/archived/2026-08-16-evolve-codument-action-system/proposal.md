# Mission：演进 Codument Action 与 Mission 控制系统

## 背景和动机

Codument 当前已经具备 track、mission、behavior、modeling、engineering、归档提升和 agent skill 分发能力，但几个关键边界尚未完全收敛：

- modeling 三方合并算法已经存在，却没有接入默认 archive CLI；启用 modeling 后，delta 会随 track 进入 archive，但不会提升进 modeling registry。
- modeling 模板默认关闭，未成为开箱即用的结构知识能力。
- mission 的四 Actor 只在 prose 中重复描述，无法表达默认 ActorSet、阶段覆盖和跨项目反馈飞轮。
- 项目方向上下文加载与 fresh-agent AttractorCheck 混为一谈，造成规划前和每个 phase 的重复审查。
- `std/operations`、SOP、spec、skill 壳之间存在重复方法论、完整示例和旧格式映射。
- track 维护被拆成 discuss-phase、revise-track、plan-track-wave 三个相邻 skill；decision-tree 也被包装成了独立 skill。
- 仓库 E2E/质量评分工具和三个历史别名 skill 被错误纳入下游初始化分发。
- `operation` 将被 `action` 全面取代，需要同时迁移目录、配置、XML、文案、测试和用户工作区。

这些变化横跨 CLI runtime、archive 原子性、mission schema、标准目录、action prompts、skill 分发、upgrade migration 和 E2E 验证，无法由单个 track 安全闭环，因此建立本 Mission 进行分阶段收敛。

## 目标

- 默认启用 modeling，但只在领域结构发生变化时生成 modeling delta。
- 将 modeling 合并接入 archive CLI，并把 behavior/modeling/engineering 统一纳入原子的 prepare → validate/conflict-detect → commit 边界。
- 为 mission 增加结构化 ActorSet：mission 默认集合、TaskGroup 局部覆盖、单项目飞轮、多项目协同飞轮。
- 使用持久 `ProjectRef` + session-local `WorkspaceBinding` 支持一个 session 内编排多个 Codument 项目，不持久化机器路径。
- 将产品表面中的 `operation` 全面替换为 `action`，旧术语只允许存在于隔离的迁移适配器、fixture 和 compat 文档。
- 将 `std` 重组为 `actions/commands/protocols/methods/spec/attractors/compat/skill`，每类信息只有一个权威 owner。
- 创建 `std/commands/`，只说明复杂 CLI 子命令的使用、副作用、失败语义和示例，不复制实现逻辑。
- 无条件创建 track/mission 的 `design.md` 与 `decisions.xnl`；`decisions/`、`memory/` 按需创建。
- 合并 track 维护能力为 `codument-maintain-track`，支持 `discuss-phase|revise|schedule` mode。
- 将 decision-tree 下沉为可复用 protocol，不再作为独立 skill。
- 精简默认 attractor 策略：简短项目约束直接读取，真正的 fresh-agent AttractorCheck 只用于已有产物的高风险终态或显式配置。
- 从下游分发中移除仓库专用 E2E/质量评分 skill，并修正测试调用方式。
- 删除历史别名 skill：`codument-track`、`codument-implement`、`codument-archive`。
- 让 `upgrade-workspace` 安全迁移旧 action/skill/config 布局，先备份、结构化转换、成功后删除旧路径。

## 非目标

- 本 Mission 本身不直接修改 CLI、模板、标准或测试；实际变更全部由绑定的 tracks 承担。
- 不在项目文件中持久化本机绝对路径或 session workspace binding。
- 不要求每条普通 track 都生成 modeling delta。
- 不把 mission reconcile 与 AttractorCheck 合并为同一种控制环。
- 不在 `std/commands/` 解释 TypeScript 内部实现和算法。
- 不手工维护当前工作区 `codument/std/**` 作为发布真源；发布修改只进入 `src/templates/**`，dogfood 投影通过 build + upgrade-workspace 产生。
- 不保留新产品表面的 `operation` 兼容别名；旧词只留在迁移边界。

## 成功判据

- fresh init 的 modeling 配置和 runtime loader 默认值均为 enabled；显式 `enabled=false` 仍被尊重。
- archive 在任一 behavior/modeling/engineering 冲突或写入失败时，不更新任何 registry，也不移动 track。
- modeling 首次 delta 能自动创建 registry，并完成真实三方合并；无 delta 时不制造空 registry。
- mission spec、plan/impl action 和验证覆盖默认 ActorSet、TaskGroup override、ProjectRef、session binding 与 UNBOUND 语义。
- 标准中包含单项目迭代飞轮和一个 session 编排多个 Codument 项目的完整例子。
- 发布模板不再包含 `std/operations`、`operation-hooks.xml`、`OperationHooks` 或正常产品路径中的 `Operation`。
- 旧 operation 字样只存在于 migration adapter、迁移 fixture、compat 文档和必要的历史 archive 中。
- `std/actions` 的 action 只拥有执行流程；commands/protocols/methods/spec/compat 各自拥有唯一职责。
- `codument-maintain-track` 覆盖三个旧 skill 的能力，upgrade-workspace 删除旧 skill 目录。
- decision-tree 由 protocol 复用，默认分发不再安装独立 skill。
- 仓库专用 E2E/评分能力仍可由测试直接运行，但不会进入 init/upgrade 的下游 skill 清单。
- 三个历史别名 skill 从模板、manifest、安装和升级后工作区彻底消失。
- `src/templates/**`、生成 manifest、CLI、tests 与 upgrade 后 dogfood 工作区一致，完整 test/typecheck/build/validate/E2E 通过。

## 为什么需要 Mission

本次工作包含五个具有独立失败模式和验收边界的变更面：archive/modeling runtime、mission ActorSet、标准 taxonomy/action 改名、action 精简与 skill 合并、分发迁移与 E2E。它们存在明确依赖，并需要用升级后的 Codument 自己验证 Codument；执行过程中可能由 dogfood 反馈触发受控重规划，符合 Mission 而非单个大 track 的适用范围。
