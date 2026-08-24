# Track：tracklink-mission-context

## 背景

Nested Mission 需要让 TrackLink 显式表达 Track 所属的 Mission 上下文，并支持父 Mission 直接观察子 Mission 下的具体 Track。当前 TrackLink 没有 `mission_ref`，跨层引用无法验证归属和唯一 owner。

## 目标

- 固化 TrackLink 的 `mission_ref` 和跨层 `track_ref` 行为。
- 明确子 Mission 为 Track 生命周期 owner，父 Mission 只能消费交付投影。
- 明确旧 TrackLink 的兼容策略和新增校验边界。

## 非目标

- 不实现 MissionLink 或 WorkspaceBinding。
- 不实现完整跨仓库 runtime。

## 成功判据

- 行为 delta 覆盖显式 mission_ref、track_ref 和 owner 规则。
- Track 严格校验通过。
