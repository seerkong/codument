# Track：workspace-binding-contract

## 背景

跨仓库 Mission 需要在电脑 A/B 之间使用不同绝对路径继续同一份逻辑 Mission。ProjectRef、MissionLink 和 TrackLink 必须保持可提交的逻辑关系，而本机路径必须独立保存并被 Git 忽略。

## 目标

- 固化 `codument/.local/workspace-bindings.xnl` 的本机运行时职责。
- 固化 ProjectRef 逻辑 id 与绝对路径的边界。
- 定义 UNBOUND/MISSING 以及绑定更新不改变 Mission revision 的行为。

## 非目标

- 本 Track 不实现 bind CLI 或跨仓库 runtime。

## 成功判据

- 行为 delta 覆盖电脑切换、忽略边界和可恢复性。
- Track 严格校验通过。
