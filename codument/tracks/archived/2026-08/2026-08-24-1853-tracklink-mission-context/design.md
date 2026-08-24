# Track Design：TrackLink Mission Context

- 子 Mission 内 TrackLink 显式保存 `mission_ref`，表达 Track 归属。
- 父 Mission 直接引用子 Track 时必须保存 `project_ref`、`mission_ref` 和 `track_ref`。
- 父侧 Link id 是编排 identity，`track_ref` 是真实 Track identity。
- 子 Mission 是 Track 唯一生命周期 owner；父 Mission 只能观察和消费交付投影。
- MissionLink 与跨层 TrackLink 可以并存，但不能产生重复 owner。
- 没有新增字段的旧 TrackLink 保持兼容读取；迁移时根据真实 owner 显式 materialize mission_ref。
