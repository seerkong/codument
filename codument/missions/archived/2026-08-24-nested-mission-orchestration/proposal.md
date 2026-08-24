# Mission：nested-mission-orchestration

## 背景和动机

当前 Mission 能通过 `TrackLink` 拆解和编排子 Track，但所有宏观控制面通常集中在创建 Mission 的主仓库。当一个目标跨越多个代码仓库时，其他仓库中的演化历史、局部决策、失败原因和验证证据会被稀碎地留在 Track 中，主 Mission 只能看到 Track 引用，缺少每个仓库自己的长期控制面。

当 Mission 过于宏大时，还需要把它拆解为多个子 Mission，形成可审计的主子树：主仓库可以拥有根 Mission，主仓库和其他仓库各自拥有子 Mission；根 Mission 编排子 Mission 和必要的跨层 Track，但子 Mission 保留自己的目标、DAG、决策、报告和 Track 生命周期。

跨仓库工作还必须支持在电脑 A 和电脑 B 之间交替推进。同一个逻辑 `ProjectRef` 在不同机器上对应不同绝对路径，路径不能进入 Git 管理的 Mission/Track 文件，也不能阻止另一台电脑继续从已提交状态恢复执行。

## 目标

- 引入严格树状的主 Mission / 子 Mission 关系。
- 通过显式 `MissionLink` 表达父 Mission 对子 Mission 的编排承诺。
- 通过 `selected-tasks` 让父 Mission 只等待子 Mission 中明确选择的叶子 Task，而不要求子 Mission 整体完成。
- 在父子 Mission 两侧持久化互相匹配的关系信息，支持唯一父节点和环检测。
- 为 `TrackLink` 增加显式 `mission_ref`；跨层直接引用子 Mission Track 时同时表达 `track_ref`。
- 允许父 Mission 同时编排子 Mission 和子 Mission 下的具体 Track。
- 保持子 Mission 对其 Track 的生命周期拥有唯一权威，父 Mission 只消费交付投影并负责宏观编排。
- 支持父 Mission 在目标仓库已绑定时自动创建和绑定外部子 Mission。
- 引入标准化、不可提交的 `codument/.local/workspace-bindings.xnl`，把逻辑 ProjectRef 映射到当前机器绝对路径。
- 支持跨机器切换：提交逻辑 Mission/ProjectRef 状态，在另一台电脑生成或更新本地绑定后继续执行。
- 保持现有单 Mission、单仓库和 Mission -> Track 行为兼容。

## 非目标

- 第一版不支持 Mission DAG、共享子 Mission 或一个子 Mission 拥有多个父 Mission。
- 第一版不支持自然语言 milestone 或不透明 completion projection。
- 第一版不支持把子 Mission 的完整 TaskSpace 展开复制到父 Mission。
- 第一版不支持 TaskGroup 作为 `SelectedTasks` 目标；只选择叶子 Task。
- 第一版不把父 Mission 变成子 Mission Track 的第二个生命周期 owner。
- 第一版不把绝对 workspace path 写入 `mission.xnl`、`track.xnl`、proposal、design、decision、report 或其他可提交资源。
- 第一版不要求父 Mission 等待子 Mission 的 `status = completed`。

## 成功判据

- Mission 规范和 Kind 校验能表达并拒绝非法的 MissionLink、ParentMission、selected-task、mission_ref、track_ref、owner 冲突和 MissionLink 环。
- 父 Mission 能绑定当前机器上其他仓库的子 Mission，并仅对 selected leaf tasks 进行交付判定。
- 父 Mission 可以直接观察/编排子 Mission 下的具体 Track，但 Track 生命周期仍由子 Mission 管理。
- 已绑定外部仓库时，父 Mission 可以自动创建子 Mission；未绑定时只报告 `UNBOUND`，不猜测路径或写入错误状态。
- `codument/.local/workspace-bindings.xnl` 被 Git 忽略，能在不同机器保存不同绝对路径而不改变 Mission 内容 revision。
- 现有 Mission 和 TrackLink 通过严格校验与回归测试，历史资源不因新能力失效。
- 跨仓库 Mission 的局部设计、决策、reports 和 Track 历史可在各自仓库独立审计。
- 相关实现由真实 Track 承担；本 Mission 只负责控制面设计、切片、编排和验证，不直接绕过 Track 修改代码。
