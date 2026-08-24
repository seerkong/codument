# Track Design：Nested Mission Link Validation

扩展 `src/cli/mission/validate.ts`：解析 Task 下 MissionLink/TrackLink 子节点，拒绝 TaskGroup 直接挂链接；验证 MissionLink 的 project_ref、mission_ref、completion_mode、SelectedTasks；SelectedTasks 只允许 leaf TaskRef；ParentMission 只能出现一次；跨层 TrackLink 要求 mission_ref/track_ref；workspace_path 和 WorkspaceBinding 不得进入 Mission authority。跨文件树环和父子关系解析留给后续 runtime track。
