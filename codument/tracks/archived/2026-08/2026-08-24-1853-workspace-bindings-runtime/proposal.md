# Track：workspace-bindings-runtime

## 目标

实现标准化 `codument/.local/workspace-bindings.xnl` 文件和 `codument project bind|bindings|unbind` 命令，让逻辑 ProjectRef 在多台电脑上解析到不同本机绝对路径。

## 非目标

不把路径写入 Mission/Track，不实现外部 Mission 生命周期。

## 验收

命令能创建、更新、读取、删除本地 binding；目录被 Git 忽略；类型检查和测试通过。
