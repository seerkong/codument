# Track State Source Refactor Specification

## MODIFIED Requirements
### Requirement: 项目初始化命令
系统应当（SHALL）提供 `codument init` 命令，支持：
- 检测项目类型（Brownfield/Greenfield）
- 交互式收集项目信息
- 支持 `--agent=<tool>[,<tool>...]` 非交互指定 AI coding 工具
- 生成 `project.md`、`product.md`、`workflow.md`、`tech-stack.md`
- 创建 `codument/tracks/`、`codument/specs/`、`codument/archive/` 等工作目录
- 创建初始 track
- 支持恢复中断的初始化流程
- 根据用户选择的 AI coding 工具生成对应产物
- 不再创建或依赖 `codument/tracks.md` 作为 track 注册表

#### Scenario: 初始化新项目
- **GIVEN** 用户在空目录中
- **AND** 目录不存在 codument/ 文件夹
- **WHEN** 用户运行 `codument init`
- **THEN** 系统引导用户完成项目设置
- **AND** 系统生成初始 track
- **AND** 系统创建 `codument/tracks/` 目录用于查看当前 tracks
- **AND** 系统不创建 `codument/tracks.md`

#### Scenario: 初始化现有项目
- **GIVEN** 用户在现有代码库中
- **AND** 代码库包含源代码文件
- **WHEN** 用户运行 `codument init`
- **THEN** 系统分析项目结构
- **AND** 系统基于分析结果引导设置
- **AND** 系统不创建 `codument/tracks.md`

#### Scenario: 初始化时为 Codex 生成独立生命周期 skills 而非 prompts
- **GIVEN** 用户在初始化过程中选择 Codex
- **WHEN** 初始化完成
- **THEN** 系统输出的完成提示指向 `~/.codex/skills/codument-*/`
- **AND** 不再声明生成 `~/.codex/prompts/codument-*.md`
- **AND** 系统不生成 `~/.codex/skills/codument-workflow/`

#### Scenario: 初始化时为 Sparrow 生成工作区 skills
- **GIVEN** 用户在初始化过程中选择 Sparrow
- **WHEN** 初始化完成
- **THEN** 系统输出的完成提示指向 `.sparrow/skills/codument-*/`
- **AND** 这些 skill 目录可被 Sparrow 作为本地资源根自动加载
- **AND** 系统不生成 `.sparrow/skill/codument-workflow/`

#### Scenario: 使用 --agent 跳过交互式 agent 与项目名称输入
- **GIVEN** 用户运行 `codument init --agent=claude,codex`
- **AND** 目录不存在 `codument/` 文件夹
- **WHEN** 初始化开始
- **THEN** 系统不再提示用户选择 AI coding 工具
- **AND** 系统不再要求用户输入 project / product 名称
- **AND** 系统为 `claude` 与 `codex` 生成对应产物
- **AND** 系统不创建 `codument/tracks.md`

#### Scenario: 初始化时支持 CodeFlicker target
- **GIVEN** 用户运行 `codument init`
- **WHEN** 用户在交互式 target 列表中选择 CodeFlicker，或传入 `--agent=codeflicker`
- **THEN** 系统将 Codument 生命周期 skills 写入 `.codeflicker/skills/codument-*/`
- **AND** 系统继续生成 `.codeflicker/commands/codument/`
- **AND** command wrapper 引用对应的 `.codeflicker/skills/codument-*/SKILL.md`
- **AND** 系统不生成 `.codeflicker/skills/codument-workflow/`

### Requirement: 创建变更追踪命令
系统应当（SHALL）提供 /codument:track 命令，支持：
- 收集 track 描述
- 交互式生成 spec.md
- 交互式生成 plan.xml
- 选择提交模式（auto/manual）
- 选择校验模式（`yield-human-confirm` 或 `yield-gap-loop`）
- 当校验模式为 `yield-gap-loop` 时，进一步选择校验粒度（`final_phase` 或 `every_phase`）
- 创建 track 目录和必要文件
- 将 track 元数据写入 plan.xml 的 `<metadata>`，并以 plan.xml 作为 track 状态与元数据的唯一真相源

#### Scenario: 创建新功能 track（auto 模式）
- **GIVEN** 用户已初始化 Codument
- **AND** 用户有新功能需求
- **WHEN** 用户运行 /codument:track 并提供功能描述
- **AND** 用户选择 auto 提交模式
- **THEN** 系统生成包含 spec.md 和 plan.xml 的 track 目录
- **AND** plan.xml 中 commit_mode 设置为 auto
- **AND** plan.xml 的 metadata 包含原 metadata.json 所需的 `track_id`、`type`、`status`、`created_at`、`updated_at`、`description`
- **AND** 系统不创建或更新 metadata.json
- **AND** 系统不创建或更新 `codument/tracks.md`

#### Scenario: 创建新功能 track（manual 模式）
- **GIVEN** 用户已初始化 Codument
- **AND** 用户有新功能需求
- **WHEN** 用户运行 /codument:track 并提供功能描述
- **AND** 用户选择 manual 提交模式
- **THEN** 系统生成包含 spec.md 和 plan.xml 的 track 目录
- **AND** plan.xml 中 commit_mode 设置为 manual
- **AND** plan.xml 的 metadata 包含原 metadata.json 所需的 `track_id`、`type`、`status`、`created_at`、`updated_at`、`description`
- **AND** 系统不创建或更新 metadata.json
- **AND** 系统不创建或更新 `codument/tracks.md`

#### Scenario: 创建 track 时选择人工确认
- **GIVEN** 用户已初始化 Codument
- **WHEN** 用户创建新的 track
- **AND** 用户选择 `yield-human-confirm`
- **THEN** 系统将 `validation_mode` 写入 plan.xml 的 metadata
- **AND** 不再继续询问 `validation_granularity`
- **AND** 默认仅在最后一个 phase 下插入 `<confirm protocol="yield-human-confirm" when="after" status="TODO" />`

#### Scenario: 创建 track 时选择 gap-loop 默认粒度
- **GIVEN** 用户已初始化 Codument
- **WHEN** 用户创建新的 track
- **AND** 用户选择 `yield-gap-loop`
- **AND** 用户未额外指定粒度
- **THEN** 系统将 `validation_mode=yield-gap-loop` 写入 plan.xml 的 metadata
- **AND** 系统将 `validation_granularity=final_phase` 写入 plan.xml 的 metadata
- **AND** 系统将 `gap_loop_round=0` 写入 plan.xml 的 metadata
- **AND** 默认仅在最后一个 phase 下插入 `<confirm protocol="yield-gap-loop" when="after" status="TODO" />`

#### Scenario: 创建 track 时选择每个 phase 都做 gap-loop
- **GIVEN** 用户已初始化 Codument
- **WHEN** 用户创建新的 track
- **AND** 用户选择 `yield-gap-loop`
- **AND** 用户选择 `validation_granularity=every_phase`
- **THEN** 系统在每个 phase 下都插入 `<confirm protocol="yield-gap-loop" when="after" status="TODO" />`

### Requirement: Track 列表与状态真相源
系统应当（SHALL）仅通过 `codument/tracks/` 目录发现当前活跃 tracks，并仅通过各 track 的 `plan.xml` `<metadata>` 读取 track 状态与元数据。

#### Scenario: 列出当前 tracks
- **GIVEN** `codument/tracks/` 下存在多个 track 目录
- **AND** 每个有效 track 目录包含 `plan.xml`
- **WHEN** 用户运行 `codument list`
- **THEN** 系统扫描 `codument/tracks/` 目录
- **AND** 系统读取每个 track 的 `plan.xml` metadata
- **AND** 系统不读取 `codument/tracks.md`
- **AND** 系统不要求 `metadata.json` 存在

#### Scenario: 获取单个 track
- **GIVEN** `codument/tracks/<track_id>/plan.xml` 存在
- **WHEN** 用户运行 `codument show <track_id>` 或其他命令读取该 track
- **THEN** 系统从 plan.xml metadata 构造 track 元数据
- **AND** 系统不要求 `metadata.json` 存在

#### Scenario: 迁移兼容旧 track
- **GIVEN** 旧 track 同时包含 `metadata.json` 与 `plan.xml`
- **AND** metadata.json 包含 plan.xml metadata 中尚未存在的字段
- **WHEN** 系统读取、验证或升级该 track
- **THEN** 系统应能将 metadata.json 中额外信息合入 plan.xml metadata
- **AND** 合并后 plan.xml metadata 是唯一真相源
- **AND** track 状态以 plan.xml metadata.status 为准

#### Scenario: 归档 track
- **GIVEN** 一个 track 的 plan.xml metadata.status 为 `completed`
- **WHEN** 用户运行 `codument archive <track_id>`
- **THEN** 系统将 `codument/tracks/<track_id>/` 移动到 archive
- **AND** 系统不读取或更新 `codument/tracks.md`
- **AND** 系统不要求 `metadata.json` 存在

#### Scenario: 验证 track
- **GIVEN** `codument/tracks/<track_id>/plan.xml` 存在
- **WHEN** 用户运行 `codument validate <track_id> --strict`
- **THEN** 系统验证 plan.xml metadata 包含 `track_id`、`type`、`status`、`created_at`、`updated_at`、`description`
- **AND** 系统不要求 `metadata.json` 存在
