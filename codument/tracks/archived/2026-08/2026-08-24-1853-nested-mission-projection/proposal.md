# Track：nested-mission-projection

## 目标

定义父 Mission 对子 Mission selected leaf tasks 和跨层 Track 的实际状态投影，支持部分交付而不要求子 Mission completed。

## 非目标

不实现完整多仓库 Observer/Reconciler。

## 验收

明确 BOUND/UNBOUND/MISSING/DRIFTED/BLOCKED 和 selected-task completion gate。
