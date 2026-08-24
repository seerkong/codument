# Track：nested-mission-link-validation

## 目标

在 Mission validator 中落地已确认的 nested Mission 结构校验：MissionLink leaf-only、selected leaf targets、ParentMission 双向约束、唯一父节点、环检测、跨层 TrackLink owner 和绝对路径持久化拒绝。

## 非目标

本 Track 不实现外部 workspace resolution、自动创建子 Mission 或完整执行 runtime。

## 验收

新增规则有稳定 rule id 和 focused tests；旧 Mission 验证保持兼容；严格校验通过。
