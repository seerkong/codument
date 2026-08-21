# 变更：允许重新打开已完成或已归档的 Track / Mission

## 背景和动机

当前 lifecycle CLI 把 `completed`、`cancelled`、`superseded` 和归档目录当作不可逆终态。实际迭代中，工作项完成后可能补充任务；归档后也可能因新证据恢复执行。用户只能手工移动目录和改 XNL，绕过 CLI 的原子写入与校验。

## 目标

- `completed` Track 可以通过 lifecycle CLI 恢复为 `in_progress`。
- `completed` Mission 可以恢复为 `active`。
- cancelled/superseded 或 archived authority 也可显式恢复到对应 active 状态。
- 归档恢复自动移动 authority，更新根状态、时间和 Mission revision。
- 多个同 ID 归档、active 目标冲突等歧义继续 fail closed。
- 保持进入 `completed` 时的 completion gate，不放宽任务完成要求。

## 非目标

- 不自动撤销归档时已提升的 behavior、modeling、engineering、decision 或 memory。
- 不自动重置历史 DONE task；新增任务由作者显式加入并保持可追踪。
- 不改变 XNL Kind、apiVersion 或目录格式。

## 变更内容

- 扩展 Track / Mission 根状态转换图。
- 让 transition 定位唯一 archived authority，并在恢复时原子移回 active 目录。
- 同步生命周期规范和 operation 指令，说明恢复不会回滚 durable artifacts。
- 添加完成后恢复、归档后恢复、冲突与歧义回归测试。
