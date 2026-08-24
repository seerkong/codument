# Track：nested-mission-resource-validation

## 背景

Nested Mission 需要在 Mission 资源层表达 MissionLink、ParentMission、SelectedTasks 和跨层 TrackLink 上下文，并为严格树状关系提供可确定解析入口。

## 目标

- 扩展 Mission resource parser 识别新结构。
- 为 validator 和 lifecycle implementation 提供结构化中间表示。
- 保持旧 Mission XNL/XML 兼容读取。

## 非目标

- 本 Track 不完成所有 lifecycle/runtime 行为。

## 成功判据

- 新结构解析规则写入工程行为契约并通过严格校验。
