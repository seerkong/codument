## ADDED Requirements

### Requirement: Gap Loop 轮次元数据
系统应当（SHALL）在 `validation_mode=yield-gap-loop` 的 `plan.xml` metadata 中记录当前 gap-loop 轮次。

#### Scenario: 创建 track 时初始化 gap loop 轮次
- **GIVEN** 用户创建新 track
- **AND** 用户选择 `validation_mode=yield-gap-loop`
- **WHEN** 系统生成 `plan.xml`
- **THEN** `<metadata>` 中包含 `<gap_loop_round>0</gap_loop_round>`

#### Scenario: 父层在每次启动 fresh round 前更新轮次
- **GIVEN** 某个事项正在执行 `yield-gap-loop`
- **WHEN** 父层编排者准备 fresh-spawn 新的 gap-loop 子代理
- **THEN** 系统先将 `gap_loop_round` 更新为本轮序号
- **AND** 再启动该 round 的 fresh 子代理

### Requirement: Gap Loop 首轮无历史报告时的二次验证
系统应当（SHALL）在当前事项从未执行过 gap-loop 且 `reports/` 为空时，对首轮 `NO_GAP` 结果保持怀疑，并强制再执行一轮 fresh 验证。

#### Scenario: 首轮无历史报告且返回 NO_GAP
- **GIVEN** 当前事项此前没有执行过 gap-loop
- **AND** `reports/` 目录为空或不存在
- **AND** 当前 `gap_loop_round=1`
- **WHEN** fresh 子代理返回 `<status>NO_GAP</status>`
- **THEN** 父层编排者不得直接将 `<confirm>` 标记为 `DONE`
- **AND** 父层编排者必须再 fresh-spawn 一轮新的 gap-loop 子代理验证

## MODIFIED Requirements

### Requirement: Gap Loop 命令
系统应当（SHALL）提供 `/codument:gap-loop` 命令，用于在 fresh agent 中完成当前 track 或 phase 的 gap 分析与修正闭环。

#### Scenario: 共享提示词按角色分节
- **GIVEN** `codument:gap-loop` 由父层编排代理或 fresh 子代理阅读
- **WHEN** 代理读取该提示词
- **THEN** 提示词先说明总纲、角色判定与公共规则
- **AND** 再分别给出父层编排角色与 fresh 子代理角色各自必须遵守的要求

#### Scenario: 父层收到 FIX_APPLIED 必须继续循环
- **GIVEN** 父层已触发某一轮 gap-loop 子代理
- **WHEN** 子代理返回 `<status>FIX_APPLIED</status>`
- **THEN** 父层编排者必须继续 fresh-spawn 新的 gap-loop 子代理复检
- **AND** 不得把 `FIX_APPLIED` 视为可直接收口的终态

### Requirement: 阶段完成验证协议
系统应当（SHALL）在阶段结束时支持基于 `<confirm>` 的两种协议：
- `yield-human-confirm`
- `yield-gap-loop`

#### Scenario: gap-loop 父层按轮次与历史状态决定是否收口
- **GIVEN** 某个 phase 的 `<confirm>` 使用 `yield-gap-loop`
- **WHEN** 父层编排者收到某一轮 gap-loop 结果
- **THEN** 若状态为 `FIX_APPLIED`，必须继续下一轮 fresh 验证
- **AND** 若状态为首轮无历史报告条件下的 `NO_GAP`，仍必须执行一次额外 fresh 验证
- **AND** 只有在满足收口条件时，父层才可将 `<confirm>` 标记为 `DONE`

### Requirement: Plan XML 格式
系统应当（SHALL）定义结构化的 plan.xml 格式，包含：
- metadata 元数据（含 `commit_mode`、`execution_mode`）
- 可选的 `validation_mode`
- 当 `validation_mode=yield-gap-loop` 时可选的 `validation_granularity`
- 当 `validation_mode=yield-gap-loop` 时可选的 `gap_loop_round`
- phases 阶段
- tasks 任务
- acceptance_criteria 验收标准
- gate_criteria 阶段门控标准
- validations 验证
- risks 风险
- summary 统计

#### Scenario: metadata 中记录 gap loop 轮次
- **GIVEN** 用户创建 track 并选择 gap loop
- **WHEN** 系统生成 `plan.xml`
- **THEN** `<metadata>` 中包含 `<gap_loop_round>`
- **AND** 其初始值为 `0`
