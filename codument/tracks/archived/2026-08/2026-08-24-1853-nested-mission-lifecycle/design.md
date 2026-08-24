# Track Design：Nested Mission Lifecycle

父 Applier 解析 ProjectRef binding 后，可在外部仓库创建 pending 子 Mission，写入 ParentMission 并严格验证双向关系，然后原子将父 MissionLink 绑定。子 Mission 自己负责内部 Track 状态。父 Task 只根据 selected leaf targets 或跨层 Track 投影完成；子 Mission 仍可 active。UNBOUND/MISSING/DRIFTED/ BLOCKED 必须 fail closed，冲突不覆盖。
