# Track：nested-mission-lifecycle

## 目标

定义并实现 MissionLink candidate/bound 生命周期、外部仓库子 Mission 创建与双向 ParentMission 写回、selected-tasks 交付投影和跨层 TrackLink 绑定边界。

## 非目标

不实现本地 workspace binding 文件解析和完整子 Mission runtime observer。

## 验收

生命周期行为有可执行契约、原子状态写回边界清晰，并通过严格校验。
