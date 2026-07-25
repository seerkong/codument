# 变更：为 Mission 增加结构化 ActorSet 与 session-local 多项目绑定

## 背景和动机 (Context And Why)

当前 Mission 只在 prose 中描述 MissionPlanner、MissionObserver、MissionReconciler、MissionApplier，无法让某个阶段绑定自己的具体控制工作方式。TrackLink 也只能从当前 workspace 解析，因而不能安全表达底层库与上层应用之间的反馈飞轮。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**

- 在 mission.xml 中持久化默认完整 ActorSet，并允许 TaskGroup 整组覆盖。
- 用无路径 ProjectRef 表达 host 与外部项目身份。
- 让 impl-mission 在 session runtime 中接受 WorkspaceBinding，明确 UNBOUND、MISSING 和外部 TrackLink actual state。
- 在唯一 spec owner 中提供单项目与底层库/上层应用双向反馈示例。
- 新增独立 mission validator 与测试，保持 Track validator 的既有边界。

**非目标:**

- 不持久化本机路径、不创建 workspaces.xml、不把 WorkspaceBinding 写进 reports。
- 不实现跨进程 daemon、项目发现或隐式路径猜测。
- 不在本 track 执行 operation -> action 全面改名或默认 Attractor 策略收敛。

## 变更内容（What Changes）

- 新增 mission ActorSets、ProjectRefs、TaskGroup `actor-set` 覆盖和外部 TrackLink `project-ref` 规范。
- 新增 session-local WorkspaceBinding 和 UNBOUND/MISSING 观察语义。
- 更新 plan-mission / impl-mission release prompts，使其创建和恢复这些结构。
- 更新 Mission behavior cases、release docs、template tests 和独立 mission validator 测试。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`codument-core/mission-standard-artifacts`、`mission-xml-spec`、`mission-cybernetic-actors`、`mission-operations`。
- 受影响的代码：mission XML validator、模板 manifest、template tests。
- 受影响的发布模板：mission spec、plan/impl mission operation prompts。
