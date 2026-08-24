# Track Design：Nested Mission Resource Validation

为 `MissionLink`、`ParentMission`、`SelectedTasks` 和跨层 TrackLink 建立结构化解析边界。解析结果必须保留逻辑 ProjectRef、Mission/Track identity、link_ref、completion_mode 和 selected leaf target；不解析或持久化本机绝对 workspace path。旧 mission.xnl/mission.xml 继续兼容读取。
