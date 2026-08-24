# Track Design：Workspace Binding Contract

- `mission.xnl` 只保存 ProjectRef 逻辑 id 和 kind。
- `codument/.local/workspace-bindings.xnl` 保存 project_ref 到本机绝对 workspace_path 的映射。
- `.local` 必须被 Git ignore；电脑 A/B 可以为同一逻辑 ProjectRef 保存不同路径。
- binding 缺失投影为 `UNBOUND`；workspace 或目标资源不存在投影为 `MISSING`。
- binding 更新不修改 Mission/Track authority、content revision 或提交内容。
