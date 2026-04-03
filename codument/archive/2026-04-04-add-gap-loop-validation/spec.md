## ADDED Requirements

### Requirement: Gap Loop 命令
系统应当（SHALL）提供 `/codument:gap-loop` 命令，用于在 fresh agent 中完成当前 track 或 phase 的 gap 分析与修正闭环。

#### Scenario: 仅基于 track 运行 gap loop
- **GIVEN** 用户提供一个 `track-id`
- **WHEN** 用户运行 `/codument:gap-loop <track-id>`
- **THEN** 系统读取该 track 的 `proposal.md`、`spec.md`、`design.md`（如存在）、`plan.xml`
- **AND** 自动读取该 track 目录下 `reports/` 中已有报告作为背景上下文
- **AND** review 当前实现与未提交代码改动
- **AND** 先生成新的 gap 报告，再决定是否修正

#### Scenario: 额外背景文件参与 gap loop
- **GIVEN** 用户提供一个或多个 `--background <path>`
- **WHEN** 用户运行 `/codument:gap-loop <track-id> --background <path>`
- **THEN** 系统在读取 track 自身与 `reports/` 背景后，继续读取这些额外背景文件
- **AND** 这些背景文件可以位于 track 目录之外

#### Scenario: 仅针对单个 phase 运行 gap loop
- **GIVEN** 用户提供 `--phase P2`
- **WHEN** 用户运行 `/codument:gap-loop <track-id> --phase P2`
- **THEN** 系统聚焦于该 phase 的目标、任务和当前实现状态执行 gap 分析与修正

### Requirement: Gap Loop 结构化返回结果
系统应当（SHALL）要求 gap-loop 子代理在结束时只返回结构化 XML 结果，供父层编排者决定继续、复检或阻塞。

#### Scenario: 没有发现 gap
- **GIVEN** gap-loop 子代理完成分析
- **AND** 未发现相对于当前目标的新增 gap
- **WHEN** 子代理结束
- **THEN** 返回的 XML 中 `<status>` 为 `NO_GAP`

#### Scenario: 已修正 gap 但需要复检
- **GIVEN** gap-loop 子代理发现 gap
- **AND** 已生成报告并完成一轮修正
- **WHEN** 子代理结束
- **THEN** 返回的 XML 中 `<status>` 为 `FIX_APPLIED`
- **AND** 返回 `report_path` 以及 `plan_updated/spec_updated/design_updated` 标记

#### Scenario: 无法继续自动修正
- **GIVEN** gap-loop 子代理发现 gap
- **AND** 修正依赖用户决策或外部条件
- **WHEN** 子代理结束
- **THEN** 返回的 XML 中 `<status>` 为 `BLOCKED`

## MODIFIED Requirements

### Requirement: 创建变更追踪命令
系统应当（SHALL）提供 `/codument:track` 命令，支持：
- 收集 track 描述
- 交互式生成 spec.md
- 交互式生成 plan.xml
- 选择提交模式（auto/manual）
- 选择校验模式（`yield-human-confirm` 或 `yield-gap-loop`）
- 当校验模式为 `yield-gap-loop` 时，进一步选择校验粒度（`final_phase` 或 `every_phase`）
- 创建 track 目录和元数据

#### Scenario: 创建 track 时选择人工确认
- **GIVEN** 用户创建新 track
- **WHEN** 用户在创建流程中选择 `yield-human-confirm`
- **THEN** 系统在生成的 `plan.xml` 中，仅按默认策略插入 `<confirm protocol="yield-human-confirm" when="after" status="TODO" />`
- **AND** 不再继续询问 `validation_granularity`

#### Scenario: 创建 track 时选择 gap loop 且使用默认粒度
- **GIVEN** 用户创建新 track
- **WHEN** 用户在创建流程中选择 `yield-gap-loop`
- **AND** 用户未特殊要求校验粒度
- **THEN** 系统继续询问 `validation_granularity`
- **AND** 默认选择 `final_phase`
- **AND** 仅在最后一个 phase 下插入 `<confirm protocol="yield-gap-loop" when="after" status="TODO" />`

#### Scenario: 创建 track 时选择 gap loop 且每个 phase 都校验
- **GIVEN** 用户创建新 track
- **WHEN** 用户在创建流程中选择 `yield-gap-loop`
- **AND** 用户选择 `validation_granularity=every_phase`
- **THEN** 系统在每个 phase 下都插入 `<confirm protocol="yield-gap-loop" when="after" status="TODO" />`

### Requirement: Plan XML 格式
系统应当（SHALL）定义结构化的 plan.xml 格式，包含：
- metadata 元数据（含 `commit_mode`、`execution_mode`）
- 可选的 `validation_mode`
- 当 `validation_mode=yield-gap-loop` 时可选的 `validation_granularity`
- phases 阶段
- tasks 任务
- acceptance_criteria 验收标准
- gate_criteria 阶段门控标准
- validations 验证
- risks 风险
- summary 统计

#### Scenario: metadata 中记录人工确认模式
- **GIVEN** 用户创建 track 并选择人工确认
- **WHEN** 系统生成 `plan.xml`
- **THEN** `<metadata>` 中 `validation_mode` 为 `yield-human-confirm`

#### Scenario: metadata 中记录 gap loop 模式与粒度
- **GIVEN** 用户创建 track 并选择 gap loop
- **WHEN** 系统生成 `plan.xml`
- **THEN** `<metadata>` 中 `validation_mode` 为 `yield-gap-loop`
- **AND** `<metadata>` 中 `validation_granularity` 为 `final_phase` 或 `every_phase`

### Requirement: 阶段完成验证协议
系统应当（SHALL）在阶段结束时支持基于 `<confirm>` 的两种协议：
- `yield-human-confirm`
- `yield-gap-loop`

#### Scenario: gap loop 协议触发时让出控制权
- **GIVEN** 某个 phase 的最后一个任务已完成
- **AND** 该 phase 下存在 `<confirm protocol="yield-gap-loop" when="after" status="TODO" />`
- **WHEN** 当前执行 agent 到达该确认点
- **THEN** 当前 agent 不在原上下文内继续做 gap 校验
- **AND** 当前 agent 将控制权交回父层编排者
- **AND** 由父层编排者 fresh-spawn 新的 gap-loop 子代理

#### Scenario: 父层根据 gap loop 返回结果复检
- **GIVEN** 父层触发了 gap-loop 子代理
- **WHEN** 子代理返回 `<status>FIX_APPLIED</status>`
- **THEN** 父层必须再次 fresh-spawn 新的 gap-loop 子代理复检
- **AND** 直到某一轮返回 `NO_GAP` 或 `BLOCKED`

## REMOVED Requirements

### Requirement: AI 评审确认协议
**原因**：`yield-ai-confirm` 未形成稳定实际工作流，且无法表达“当前执行 agent 结束后由父层 fresh-spawn 新 agent 进行 gap 分析与修正”的闭环语义。
**迁移**：从 `plan-xml-spec.md`、`protocols.md`、`track.md`、`implement.md`、`execute-wave.md`、`workflow.md`、`AGENTS.md` 与命令生成器中移除 `yield-ai-confirm` 及其相关引用；统一改为保留 `yield-human-confirm` 并新增 `yield-gap-loop`。
