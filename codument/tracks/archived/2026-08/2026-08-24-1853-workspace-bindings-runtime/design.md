# Track Design：Workspace Bindings Runtime

本地绑定使用 `codument/.local/workspace-bindings.xnl`。CLI 将 workspace path 规范化为绝对路径，按 project_ref 原子替换 binding；bindings 命令读取逻辑 id 和路径；unbind 删除对应项。文件缺失表示 UNBOUND。绑定文件不影响 Mission revision，不进入 Git。
