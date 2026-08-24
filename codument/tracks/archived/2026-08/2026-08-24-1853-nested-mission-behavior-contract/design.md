# Track Design：Nested Mission Behavior Contract

## 行为契约

1. MissionLink 只能挂在父 Mission 的叶子 Task 上。
2. 一个子 Mission 只能有一个 ParentMission；父 Mission 可拥有多个子 Mission；关系必须是树，禁止环和共享子 Mission。
3. 父 Mission 的 MissionLink 具有 `state = candidate|bound`、`project_ref`、`mission_ref`、`completion_mode = selected-tasks`，并通过 SelectedTasks 显式选择子 Mission 的叶子 Task。
4. 父 Mission 不等待子 Mission 整体 completed；SelectedTasks 全部达到允许终态且证据可解析时，父 Task 才能完成。默认允许 `DONE`；`SUPERSEDED` 只有在重规划/人工证据明确允许时才算交付。
5. 子 Mission 持久化 ParentMission，父侧 MissionLink 与子侧 ParentMission 的 project_ref、mission_ref、link_ref 必须匹配。
6. TrackLink 显式包含 `mission_ref`；父 Mission 跨层直接引用子 Track 时必须同时包含 `track_ref`。
7. 子 Mission 是 Track 生命周期唯一 owner；父 Mission 的跨层 TrackLink 仅是观察和交付投影。
8. 父 Mission 可同时有 MissionLink 和跨层 TrackLink，前者表达多个选定目标，后者表达单条具体 Track。
9. ProjectRef 的逻辑 id 可提交；本机绝对路径只写入 `codument/.local/workspace-bindings.xnl`，该目录必须被 Git ignore，路径绑定不参与 Mission revision。
10. 缺少本地 binding 返回 UNBOUND；binding 存在但 workspace 或目标资源不存在返回 MISSING；父子关系不一致返回 DRIFTED；直接依赖无法自动修复时返回 BLOCKED。
11. 已绑定外部仓库时，父 Mission 可自动创建子 Mission；冲突的 ParentMission 不覆盖。
12. 子 Mission 自治地修改自己的 Mission、Track、reports 和 decisions；父 Mission 只编排并消费投影。

## 兼容

没有新链接字段的旧 Mission 继续按单层 Mission/Track 模型解析。新建和写回继续使用 mission.xnl；legacy mission.xml 只保持兼容读取和迁移。

## 验收

- MissionLink leaf-only、selected target leaf-only、parent reciprocity、single parent、cycle、owner、path persistence 规则都有明确验证入口。
- 规范示例覆盖根仓库、外部仓库、子 Mission、跨层 TrackLink 和电脑切换。
- 后续实现不得以自然语言 milestone 替代 selected-tasks。
