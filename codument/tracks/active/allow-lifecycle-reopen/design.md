# Design: allow-lifecycle-reopen

## 生命周期语义

根状态允许以下恢复边：

- Track：`completed|cancelled -> in_progress`
- Mission：`completed|cancelled|superseded|archived -> active`

原有正向边与幂等同状态转换保持不变。进入 `completed` 仍必须通过 Task/Acceptance completion gate；离开 completed 不重置节点状态。

## Authority 定位与移动

普通 lifecycle mutation 仍只操作 pending/active authority。只有根 `transition` 在目标为 Track `in_progress` 或 Mission `active` 时，才额外递归搜索 archived authority。

归档候选必须同时满足：

- 文件名是对应的 `track.xnl` / `mission.xnl`；
- 归档目录名可对应请求 id；
- XNL 根 `#id` 与请求 id 一致。

找不到时报现有 not-found；找到多个时拒绝并列出候选。恢复目标固定为 `tracks/active/<id>` 或 `missions/active/<id>`；目标已存在时拒绝覆盖。目录移动与根写入沿用现有 rollback 路径。

## 归档副作用

恢复只恢复工作项 authority，不反向修改归档时提升的长期 registry。durable artifacts 是已经成立的项目事实；恢复后的新增任务应描述新的增量。再次归档继续使用现有 registry transaction 和冲突检测。

## 兼容性

- 命令语法不变。
- Transition receipt 保持现有字段。
- XNL 状态词汇不变；只扩展合法边。
- task transition 仍不能直接修改 archived authority。
