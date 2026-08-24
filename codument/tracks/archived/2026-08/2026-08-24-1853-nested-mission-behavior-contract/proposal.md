# Track：nested-mission-behavior-contract

## 背景

Codument 当前只有 Mission -> TrackLink -> Track 的单层编排模型。已规划的 `nested-mission-orchestration` Mission 需要增加严格树状主子 Mission、显式 MissionLink、selected-tasks 交付投影、双向 ParentMission、TrackLink mission_ref/track_ref，以及不可提交的本地 workspace binding。

## 目标

- 把主子 Mission、MissionLink、ParentMission、selected-tasks、跨层 TrackLink 和 WorkspaceBinding 的行为契约固化为可执行规范。
- 明确单一 Track owner、严格树状约束、UNBOUND/MISSING/DRIFTED/BLOCKED 投影和跨机器恢复边界。
- 为后续 CLI、解析器、校验器和 runtime 实现提供稳定 acceptance criteria。

## 非目标

- 本 Track 不实现全部 Mission runtime、跨仓库创建流程或 CLI。
- 本 Track 不直接实现业务代码；后续 implementation tracks 根据本 Track 的行为契约落地。

## 成功判据

- 行为契约文档覆盖本 Mission design 和 decisions 中的所有已确认取舍。
- 规范、验证规则、兼容策略和迁移边界明确且无相互矛盾。
- Track 通过严格校验并可作为后续实现 Track 的输入。
