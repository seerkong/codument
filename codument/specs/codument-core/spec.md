# Codument Core Specification

Source: track `create-codument-prompts-20260101` (archived 2026-01-11)

---

### Requirement: AI 助手核心指令
系统应当（SHALL）提供完整的 AI 助手指令文档（agents.md），包含：
- 快速检查清单
- 三阶段工作流说明
- 目录结构说明
- CLI 命令参考
- 规范文件格式说明
- 最佳实践指南
- 中断恢复协议
- 多层确认协议

#### Scenario: AI 助手阅读 agents.md
- **GIVEN** AI 助手开始处理项目
- **AND** 项目根目录存在 AGENTS.md 入口文件
- **WHEN** AI 助手阅读 codument/agents.md
- **THEN** AI 助手能理解 Codument 的工作流和约定
- **AND** AI 助手能识别当前项目状态

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

### Requirement: Track 创建时生成 analysis 产物
系统应当（SHALL）在创建新的 track 目录后，自动在该 track 目录下生成用于持久化找到的内容、关键发现与知识上下文的 analysis 产物。

#### Scenario: 创建新 track 时生成 analysis 目录与文件
- **GIVEN** `codument/` 已初始化且用户创建一个新的 track
- **WHEN** AI 助手完成 `codument/tracks/<track_id>/` 目录创建
- **THEN** 系统在 `codument/tracks/<track_id>/analysis/` 创建以下文件：
  - `findings.md`
  - `knowledge.md`
- **AND** 以上文件包含可用的模板内容，用于后续持续更新

#### Scenario: 阅读总结出的知识写入 knowledge 文件
- **GIVEN** AI 助手在分析阶段阅读了代码、文档或规范
- **WHEN** AI 助手整理分析阶段的外部记忆
- **THEN** 从阅读中总结出来的知识、术语、机制理解应写入 `codument/tracks/<track_id>/analysis/knowledge.md`
- **AND** `findings.md` 仅保留直接找到的事实、约束、问题和结论

#### Scenario: analysis 文件已存在时不覆盖用户内容
- **GIVEN** `codument/tracks/<track_id>/analysis/` 中部分或全部文件已存在
- **WHEN** AI 助手重新执行 track 创建/补齐流程
- **THEN** 系统不应覆盖已存在文件的内容
- **AND** 仅在缺失时创建对应文件

### Requirement: analysis 产物不依赖隐藏目录
系统应当（SHALL）保证 analysis 产物内容不引用以 `.` 开头的隐藏目录中的文件路径。

#### Scenario: analysis 文件内容不包含隐藏目录引用
- **GIVEN** AI 助手生成 analysis 文件
- **WHEN** 用户审查生成内容
- **THEN** analysis 文件中不应出现形如 `.xxx/yyy.md` 的引用

### Requirement: 决策记录使用独立 decisions 文件
系统应当（SHALL）在 track 存在待确认决策时，将决策问题、选项、用户答复、最终结论与理由记录在 track 根目录下的 `decisions.md`，以便独立评审。

#### Scenario: 待确认决策记录到 decisions.md
- **GIVEN** track 创建、设计或后续执行过程中出现需要用户确认的决策问题
- **WHEN** AI 助手整理待确认决策
- **THEN** 系统在 `codument/tracks/<track_id>/decisions.md` 记录这些问题
- **AND** 记录中包含问题、选项、用户答复、最终决策和决策理由

#### Scenario: 执行阶段新增决策继续追加到 decisions.md
- **GIVEN** track 已进入实现或验证阶段
- **AND** 执行过程中出现新的决策补充
- **WHEN** AI 助手整理这些新增决策
- **THEN** 系统应继续追加到现有的 `codument/tracks/<track_id>/decisions.md`
- **AND** 不应改为写入其他分散的决策文件

#### Scenario: 决策标题使用优先级标记而非字母前缀
- **GIVEN** AI 助手在 `decisions.md` 中记录待确认问题
- **WHEN** 用户审查问题标题与选项格式
- **THEN** 问题标题应使用形如 `【P0】文件内容来源` 的格式
- **AND** 字母仅用于问题选项，不用于问题标题

#### Scenario: 决策问题较少时使用一次性多问题工具
- **GIVEN** 待确认决策问题数量小于等于 5
- **AND** 当前环境支持一次性多问题 ToolCall
- **WHEN** AI 助手向用户收集决策答复
- **THEN** 系统应优先使用一次性多问题 ToolCall 发问
- **AND** 收到的答复应回写到 `codument/tracks/<track_id>/decisions.md`

#### Scenario: 决策问题较多时改为文档编辑
- **GIVEN** 待确认决策问题数量大于 5
- **WHEN** AI 助手向用户收集决策答复
- **THEN** 系统应引导用户直接在 `codument/tracks/<track_id>/decisions.md` 中编辑和回答
- **AND** 不应将这些问题拆成多轮零散提问

#### Scenario: 创建新功能 track（auto 模式）
- **GIVEN** 用户已初始化 Codument
- **AND** 用户有新功能需求
- **WHEN** 用户运行 /codument:track 并提供功能描述
- **AND** 用户选择 auto 提交模式
- **THEN** 系统生成包含 spec.md 和 plan.xml 的 track 目录
- **AND** plan.xml 中 commit_mode 设置为 auto

#### Scenario: 创建新功能 track（manual 模式）
- **GIVEN** 用户已初始化 Codument
- **AND** 用户有新功能需求
- **WHEN** 用户运行 /codument:track 并提供功能描述
- **AND** 用户选择 manual 提交模式
- **THEN** 系统生成包含 spec.md 和 plan.xml 的 track 目录
- **AND** plan.xml 中 commit_mode 设置为 manual

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

### Requirement: 实现命令
系统应当（SHALL）提供 /codument:implement 命令，支持：
- 选择要实现的 track
- 中断恢复检查
- 按 workflow.md 执行任务
- 阶段门控验证
- 更新任务状态
- 同步项目文档
- 提供归档选项

#### Scenario: 实现 track 任务
- **GIVEN** 用户已创建 track
- **AND** track 中有待完成任务
- **WHEN** 用户运行 /codument:implement
- **THEN** 系统引导用户按顺序完成 plan.xml 中的任务
- **AND** 系统在每个阶段结束时执行门控验证

#### Scenario: 从中断恢复
- **GIVEN** 用户之前的实现被中断
- **AND** 存在 IN_PROGRESS 状态的任务
- **WHEN** 用户运行 /codument:implement
- **THEN** 系统检测到中断状态
- **AND** 系统询问用户恢复选项

#### Scenario: 阶段门控验证
- **GIVEN** 用户完成某阶段所有任务
- **WHEN** 系统执行阶段门控验证
- **THEN** 系统运行自动化测试
- **AND** 系统检查覆盖率
- **AND** 系统生成验证报告
- **AND** 系统按照当前 `<confirm>` 配置执行人工确认或 gap-loop 编排

### Requirement: Gap Loop 命令
系统应当（SHALL）提供 `/codument:gap-loop` 命令，用于在 fresh agent 中完成当前 track 或 phase 的 gap 分析与修正闭环。

#### Scenario: 基于 track 运行 gap loop
- **GIVEN** 用户提供一个 `track-id`
- **WHEN** 用户运行 `/codument:gap-loop <track-id>`
- **THEN** 系统读取该 track 的 `proposal.md`、`spec.md`、`design.md`（如存在）和 `plan.xml`
- **AND** 自动读取该 track 目录下 `reports/` 中已有报告作为历史上下文
- **AND** review 当前实现与未提交代码改动
- **AND** 先生成新的 gap 报告，再决定是否修正

#### Scenario: gap loop 读取额外背景文件
- **GIVEN** 用户提供一个或多个 `--background <path>`
- **WHEN** 用户运行 `/codument:gap-loop <track-id> --background <path>`
- **THEN** 系统在读取 track 自身上下文与 `reports/` 历史报告后，继续读取这些额外背景文件

#### Scenario: gap loop 聚焦单个 phase
- **GIVEN** 用户提供 `--phase P2`
- **WHEN** 用户运行 `/codument:gap-loop <track-id> --phase P2`
- **THEN** 系统聚焦该 phase 的目标、任务、验收标准与对应实现执行 gap 分析与修正

#### Scenario: gap loop 仅返回结构化 XML
- **GIVEN** gap-loop 子代理完成本轮分析
- **WHEN** 子代理结束
- **THEN** 子代理只返回结构化 XML
- **AND** `<status>` 仅允许为 `NO_GAP`、`FIX_APPLIED` 或 `BLOCKED`

#### Scenario: 共享 gap-loop 提示词按角色分节
- **GIVEN** `codument:gap-loop` 可能由父层编排代理或 fresh 子代理读取
- **WHEN** 代理读取该提示词
- **THEN** 提示词先说明总纲、角色判定与公共规则
- **AND** 再分别给出父层编排角色与 fresh 子代理角色各自必须遵守的内容

### Requirement: 阶段完成验证协议
系统应当（SHALL）在阶段结束时支持基于 `<confirm>` 的两种协议：
- `yield-human-confirm`
- `yield-gap-loop`

#### Scenario: gap-loop 协议触发时让出控制权
- **GIVEN** 某个 phase 的最后一个任务已完成
- **AND** 该 phase 下存在 `<confirm protocol="yield-gap-loop" when="after" status="TODO" />`
- **WHEN** 当前执行 agent 到达该确认点
- **THEN** 当前执行 agent 不在原上下文内继续做 gap 校验或修正
- **AND** 当前执行 agent 将控制权交回父层编排者
- **AND** 父层编排者 fresh-spawn 新的 `/codument:gap-loop` 子代理

#### Scenario: 父层根据 gap-loop 结果复检
- **GIVEN** 父层已触发 gap-loop 子代理
- **WHEN** 子代理返回 `<status>FIX_APPLIED</status>`
- **THEN** 父层必须再次 fresh-spawn 新的 gap-loop 子代理复检
- **AND** 直到某一轮返回 `NO_GAP` 或 `BLOCKED`

#### Scenario: 首轮无历史报告的 NO_GAP 需要二次验证
- **GIVEN** 当前事项此前没有执行过 gap-loop
- **AND** 当前 scope 下没有历史 gap 报告
- **AND** 当前 round 为第 1 轮
- **WHEN** 子代理返回 `<status>NO_GAP</status>`
- **THEN** 父层不得立即将当前 `<confirm>` 标记为 `DONE`
- **AND** 父层必须再 fresh-spawn 一轮新的 gap-loop 子代理验证

#### Scenario: 手动触发 gap-loop 时补齐 plan 模式
- **GIVEN** 用户显式执行 `codument:gap-loop <track-id>`
- **AND** 当前 track 的 `plan.xml` 还不是 gap-loop 模式
- **WHEN** 父层编排者准备启动第 1 轮 fresh 子代理
- **THEN** 系统先将 `<validation_mode>` 切换为 `yield-gap-loop`
- **AND** 补齐 `<validation_granularity>` 与 `<gap_loop_round>`
- **AND** 将当前 scope 所需的 `<confirm>` 迁移或补齐为 `yield-gap-loop`

### Requirement: 验证命令
系统应当（SHALL）提供 /codument:validate 命令，支持：
- 验证 track 结构
- 验证 spec.md 格式（GIVEN/WHEN/THEN/AND）
- 验证 plan.xml 格式
- 提供详细错误信息

#### Scenario: 验证 track 格式
- **GIVEN** 用户已创建 track
- **WHEN** 用户运行 /codument:validate <track-id>
- **THEN** 系统检查 track 文件格式
- **AND** 系统报告发现的问题

#### Scenario: 严格模式验证
- **GIVEN** 用户需要全面验证
- **WHEN** 用户运行 /codument:validate --strict
- **THEN** 系统执行所有验证规则
- **AND** 系统检查场景格式是否符合 GIVEN/WHEN/THEN/AND

### Requirement: 状态命令
系统应当（SHALL）提供 /codument:status 命令，显示：
- 项目整体进度
- 当前 track 和任务
- 统计信息
- 提交模式

#### Scenario: 查看项目状态
- **GIVEN** 用户已初始化 Codument
- **AND** 存在活跃 track
- **WHEN** 用户运行 /codument:status
- **THEN** 系统显示项目进度概览
- **AND** 系统显示当前任务状态

### Requirement: 归档命令
系统应当（SHALL）提供 /codument:archive 命令，支持：
- 移动 track 到 archive/
- 更新 specs/ 中的规范
- 不读取或更新 `codument/tracks.md`
- 不要求 `metadata.json` 存在

#### Scenario: 归档已完成 track
- **GIVEN** 用户已完成某个 track
- **AND** track 的 plan.xml metadata.status 为 completed
- **WHEN** 用户运行 /codument:archive <track-id>
- **THEN** 系统将 track 移动到 archive/
- **AND** 系统更新相关规范
- **AND** 系统不读取或更新 `codument/tracks.md`

### Requirement: 升级工作区命令
系统应当（SHALL）提供 `codument upgrade-workspace` 命令，支持升级工作区内嵌标准文件与所选 AI coding 工具产物。

#### Scenario: 升级时更新 Codex skills
- **GIVEN** 用户已选择 Codex
- **WHEN** 用户运行 `codument upgrade-workspace`
- **THEN** 系统将 `~/.codex/skills/codument-*/` 更新为内置独立生命周期 skills
- **AND** 系统移除 legacy `~/.codex/skills/codument/` 与 `~/.codex/skills/codument-workflow/` 目录

#### Scenario: 升级时更新 Sparrow skills
- **GIVEN** 用户已选择 Sparrow
- **WHEN** 用户运行 `codument upgrade-workspace`
- **THEN** 系统将 `.sparrow/skills/codument-*/` 更新为内置独立生命周期 skills
- **AND** 系统移除 legacy `.sparrow/skill/codument/`、`.sparrow/skill/codument-*` 与 `.sparrow/skill/codument-workflow/` 目录

#### Scenario: 升级时更新 command 型 target 的 lifecycle skills
- **GIVEN** 用户已选择 Claude、CodeFlicker、Eidolon 或 OpenCode
- **WHEN** 用户运行 `codument upgrade-workspace`
- **THEN** 系统将对应工作区内的 `codument-*` lifecycle skill 目录更新为内置版本
- **AND** 系统继续生成对应 command wrapper
- **AND** 系统移除对应工作区内的 legacy `codument` 与 `codument-workflow` skill 目录

### Requirement: Codex 使用独立 lifecycle skill 目录分发 Codument 工作流
系统应当（SHALL）对新版 Codex 通过 `~/.codex/skills/codument-*/` 分发 Codument 生命周期技能，而不是继续生成 `~/.codex/prompts/codument-*.md` 或 `codument-workflow` 根 skill。

#### Scenario: 选择 Codex 时安装 codument-* skills
- **GIVEN** 用户运行 `codument init`
- **AND** 用户选择支持 Codex
- **WHEN** 系统生成 Codex 相关产物
- **THEN** 系统将 Codument 生命周期技能写入 `~/.codex/skills/codument-*/`
- **AND** 不再依赖 `~/.codex/prompts/codument-*.md`
- **AND** 不生成 `~/.codex/skills/codument-workflow/`

#### Scenario: 升级工作区时更新 Codex skills
- **GIVEN** 用户运行 `codument upgrade-workspace`
- **AND** `codument/state.json` 中包含 `codex`
- **WHEN** 系统升级 Codex 相关产物
- **THEN** 系统更新 `~/.codex/skills/codument-*/`
- **AND** 系统移除 legacy `~/.codex/skills/codument/` 与 `~/.codex/skills/codument-workflow/` 目录

### Requirement: Codex skill 内容与 standalone lifecycle 模型一致
系统应当（SHALL）以独立 `codument-*` skill 结构作为新版 Codex 兼容基线，确保初始化和升级产生相同目录形态。

#### Scenario: 初始化后 skill 目录结构完整
- **GIVEN** 系统为 Codex 安装 `codument-*` skills
- **WHEN** 用户检查目标目录
- **THEN** 每个 lifecycle skill 目录至少包含：
  - `SKILL.md`
  - `shared/` 下的公共说明文件

### Requirement: Sparrow 使用工作区 skills 目录分发 Codument 工作流
系统应当（SHALL）对 Sparrow 通过工作区 `.sparrow/skills/` 目录分发 Codument 生命周期技能，并通过显式 target profile 表达 Sparrow 特有的 skill 加载与 fresh-subagent 提示。

#### Scenario: 选择 Sparrow 时安装 codument-* skills
- **GIVEN** 用户运行 `codument init`
- **AND** 用户选择支持 Sparrow
- **WHEN** 系统生成 Sparrow 相关产物
- **THEN** 系统将 Codument 生命周期技能写入 `.sparrow/skills/codument-*/`
- **AND** 每个目录至少包含 `manifest.yml`、`SKILL.md` 与 `shared/`
- **AND** 不会生成 legacy `.sparrow/skill/codument/` 或 `.sparrow/skill/codument-workflow/` 目录

#### Scenario: 升级工作区时更新 Sparrow skills
- **GIVEN** 用户运行 `codument upgrade-workspace`
- **AND** `codument/state.json` 中包含 `sparrow`
- **WHEN** 系统升级 Sparrow 相关产物
- **THEN** 系统更新 `.sparrow/skills/codument-*/`
- **AND** 系统移除 legacy `.sparrow/skill/codument/`、`.sparrow/skill/codument-*` 与 `.sparrow/skill/codument-workflow/` 目录
- **AND** 会移除目标目录中不再属于模板的多余文件

### Requirement: command 型 target 使用 standalone lifecycle skills 并保留 wrapper command
系统应当（SHALL）为 Claude、CodeFlicker、Eidolon 与 OpenCode 生成工作区内的 `codument-*` lifecycle skill 目录，并继续生成对应 command wrapper，且 command wrapper 应引用对应 lifecycle skill。

#### Scenario: 选择 Claude 时生成 skill 与 command wrapper
- **GIVEN** 用户运行 `codument init`
- **AND** 用户选择支持 Claude
- **WHEN** 系统生成 Claude 相关产物
- **THEN** 系统将 Codument 生命周期技能写入 `.claude/skills/codument-*/`
- **AND** 系统继续生成 `.claude/commands/codument/`
- **AND** 不会生成 legacy `.claude/skills/codument/` 或 `.claude/skills/codument-workflow/` 目录

#### Scenario: 选择 CodeFlicker 时生成 skill 与 command wrapper
- **GIVEN** 用户运行 `codument init`
- **AND** 用户选择支持 CodeFlicker
- **WHEN** 系统生成 CodeFlicker 相关产物
- **THEN** 系统将 Codument 生命周期技能写入 `.codeflicker/skills/codument-*/`
- **AND** 系统继续生成 `.codeflicker/commands/codument/`
- **AND** 不会生成 legacy `.codeflicker/skills/codument/` 或 `.codeflicker/skills/codument-workflow/` 目录
- **AND** command 内容引用对应的 `.codeflicker/skills/codument-*/SKILL.md`

#### Scenario: 选择 Eidolon 时生成 skill 与 command wrapper
- **GIVEN** 用户运行 `codument init`
- **AND** 用户选择支持 Eidolon
- **WHEN** 系统生成 Eidolon 相关产物
- **THEN** 系统将 Codument 生命周期技能写入 `.eidolon/skills/codument-*/`
- **AND** 系统继续生成 `.eidolon/commands/codument/`
- **AND** 不会生成 legacy `.eidolon/skills/codument/` 或 `.eidolon/skills/codument-workflow/` 目录
- **AND** command 内容引用对应的 `.eidolon/skills/codument-*/SKILL.md`

#### Scenario: 选择 OpenCode 时生成 skill 与 command wrapper
- **GIVEN** 用户运行 `codument init`
- **AND** 用户选择支持 OpenCode
- **WHEN** 系统生成 OpenCode 相关产物
- **THEN** 系统将 Codument 生命周期技能写入 `.opencode/skills/codument-*/`
- **AND** 系统继续生成 `.opencode/command/`
- **AND** 不会生成 legacy `.opencode/skills/codument/` 或 `.opencode/skills/codument-workflow/` 目录
- **AND** command 内容引用对应的 `.opencode/skills/codument-*/SKILL.md`

### Requirement: Plan XML 格式
系统应当（SHALL）定义结构化的 plan.xml 格式，包含：
- metadata 元数据（含 `commit_mode`、`execution_mode`）
- 可选的 `validation_mode`
- 当 `validation_mode=yield-gap-loop` 时可选的 `validation_granularity`
- 当 `validation_mode=yield-gap-loop` 时可选的 `gap_loop_round`
- milestones 里程碑
- phases 阶段
- tasks 任务（状态在属性中）
- subtasks 子任务
- acceptance_criteria 验收标准
- gate_criteria 阶段门控标准
- validations 验证
- risks 风险
- summary 统计

#### Scenario: 解析 plan.xml
- **GIVEN** 系统需要读取任务信息
- **WHEN** 系统读取 plan.xml 文件
- **THEN** 系统能正确解析所有元素和属性
- **AND** 系统能识别 commit_mode 设置

#### Scenario: 更新任务状态
- **GIVEN** 任务已完成
- **WHEN** 系统更新 plan.xml
- **THEN** 系统更新任务的 status 属性
- **AND** 系统更新 acceptance_criteria 的 checked 属性

#### Scenario: metadata 中记录人工确认模式
- **GIVEN** 用户创建 track 并选择人工确认
- **WHEN** 系统生成 plan.xml
- **THEN** `<metadata>` 中 `validation_mode` 为 `yield-human-confirm`

#### Scenario: metadata 中记录 gap-loop 模式与粒度
- **GIVEN** 用户创建 track 并选择 gap loop
- **WHEN** 系统生成 plan.xml
- **THEN** `<metadata>` 中 `validation_mode` 为 `yield-gap-loop`
- **AND** `<metadata>` 中 `validation_granularity` 为 `final_phase` 或 `every_phase`

#### Scenario: metadata 中初始化 gap loop 轮次
- **GIVEN** 用户创建 track 并选择 gap loop
- **WHEN** 系统生成 plan.xml
- **THEN** `<metadata>` 中 `gap_loop_round` 初始值为 `0`

#### Scenario: 手动执行 gap-loop 时补齐 metadata
- **GIVEN** 用户对一个非 gap-loop track 手动执行 `codument:gap-loop`
- **WHEN** 系统补齐该 track 的 plan.xml
- **THEN** `<metadata>` 中 `validation_mode` 为 `yield-gap-loop`
- **AND** `<metadata>` 中存在 `validation_granularity`
- **AND** `<metadata>` 中 `gap_loop_round` 至少被初始化为 `0`

### Requirement: CLI 工具
系统应当（SHALL）提供 CLI 工具，支持：
- list 命令列出 tracks 和 specs
- show 命令显示详情
- validate 命令验证格式
- archive 命令归档 track
- status 命令查看状态
- 构建为单文件可执行文件

#### Scenario: 使用 CLI 列出 tracks
- **GIVEN** 用户已安装 CLI
- **AND** 存在活跃 tracks
- **WHEN** 用户运行 codument list
- **THEN** CLI 显示所有活跃 tracks
- **AND** 显示每个 track 的状态和进度

#### Scenario: 构建单文件可执行文件
- **GIVEN** 开发者需要分发 CLI
- **WHEN** 开发者运行 bun run build
- **THEN** 系统生成单文件可执行文件
- **AND** 提示词文件正确嵌入到 bunfs
