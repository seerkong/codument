# Track：nested-mission-external-create

## 目标

落地父 Mission 在已有 WorkspaceBinding 时创建外部子 Mission、写回 ParentMission 并维持子 Mission 自治的执行边界。

## 非目标

不实现子 Mission 内部 Track 执行算法。

## 验收

定义 candidate/bound、UNBOUND、MISSING、DRIFTED、BLOCKED 和冲突不覆盖行为，并通过严格校验。
