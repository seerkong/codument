## ADDED Requirements

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
系统应当（SHALL）提供 /codument:init 命令，支持：
- 检测项目类型（Brownfield/Greenfield）
- 交互式收集项目信息
- 生成 project.md、product.md、workflow.md、tech-stack.md
- 创建初始 track
- 支持恢复中断的初始化流程

#### Scenario: 初始化新项目
- **GIVEN** 用户在空目录中
- **AND** 目录不存在 codument/ 文件夹
- **WHEN** 用户运行 /codument:init
- **THEN** 系统引导用户完成项目设置
- **AND** 系统生成初始 track

#### Scenario: 初始化现有项目
- **GIVEN** 用户在现有代码库中
- **AND** 代码库包含源代码文件
- **WHEN** 用户运行 /codument:init
- **THEN** 系统分析项目结构
- **AND** 系统基于分析结果引导设置

### Requirement: 创建变更追踪命令
系统应当（SHALL）提供 /codument:track 命令，支持：
- 收集 track 描述
- 交互式生成 spec.md
- 交互式生成 tasks.xml
- 选择提交模式（auto/manual）
- 创建 track 目录和元数据

#### Scenario: 创建新功能 track（auto 模式）
- **GIVEN** 用户已初始化 Codument
- **AND** 用户有新功能需求
- **WHEN** 用户运行 /codument:track 并提供功能描述
- **AND** 用户选择 auto 提交模式
- **THEN** 系统生成包含 spec.md 和 tasks.xml 的 track 目录
- **AND** tasks.xml 中 commit_mode 设置为 auto

#### Scenario: 创建新功能 track（manual 模式）
- **GIVEN** 用户已初始化 Codument
- **AND** 用户有新功能需求
- **WHEN** 用户运行 /codument:track 并提供功能描述
- **AND** 用户选择 manual 提交模式
- **THEN** 系统生成包含 spec.md 和 tasks.xml 的 track 目录
- **AND** tasks.xml 中 commit_mode 设置为 manual

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
- **THEN** 系统引导用户按顺序完成 tasks.xml 中的任务
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
- **AND** 系统等待用户确认

### Requirement: 验证命令
系统应当（SHALL）提供 /codument:validate 命令，支持：
- 验证 track 结构
- 验证 spec.md 格式（GIVEN/WHEN/THEN/AND）
- 验证 tasks.xml 格式
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
- 清理 tracks.md

#### Scenario: 归档已完成 track
- **GIVEN** 用户已完成某个 track
- **AND** track 状态为 completed
- **WHEN** 用户运行 /codument:archive <track-id>
- **THEN** 系统将 track 移动到 archive/
- **AND** 系统更新相关规范

### Requirement: Tasks XML 格式
系统应当（SHALL）定义结构化的 tasks.xml 格式，包含：
- metadata 元数据（含 commit_mode）
- milestones 里程碑
- phases 阶段
- tasks 任务（状态在属性中）
- subtasks 子任务
- acceptance_criteria 验收标准
- gate_criteria 阶段门控标准
- validations 验证
- risks 风险
- summary 统计

#### Scenario: 解析 tasks.xml
- **GIVEN** 系统需要读取任务信息
- **WHEN** 系统读取 tasks.xml 文件
- **THEN** 系统能正确解析所有元素和属性
- **AND** 系统能识别 commit_mode 设置

#### Scenario: 更新任务状态
- **GIVEN** 任务已完成
- **WHEN** 系统更新 tasks.xml
- **THEN** 系统更新任务的 status 属性
- **AND** 系统更新 acceptance_criteria 的 checked 属性

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
