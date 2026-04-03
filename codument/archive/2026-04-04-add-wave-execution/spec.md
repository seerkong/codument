## ADDED Requirements

### Requirement: 波次执行模式
系统应当（SHALL）在 plan.xml 中支持 `wave` 执行模式，通过 `<metadata>` 中的 `<execution_mode>` 字段声明。当值为 `wave` 时，phase 内的 task 按 wave DAG 调度并行执行；当值为 `sequential` 或缺失时，保持原有顺序执行行为。

#### Scenario: 声明波次执行模式
- **GIVEN** 用户创建新 track
- **AND** 需求涉及可并行化的任务
- **WHEN** 系统生成 plan.xml
- **AND** `<metadata>` 中 `<execution_mode>` 设置为 `wave`
- **THEN** plan.xml 中的 phase 包含 `<waves>` 声明和 task 级别的 `wave` 属性

#### Scenario: 缺失 execution_mode 时的默认行为
- **GIVEN** 一个旧的或未声明 execution_mode 的 plan.xml
- **WHEN** 系统读取该 plan.xml
- **THEN** 系统将其视为 `sequential` 模式
- **AND** 保持原有顺序执行行为不变

### Requirement: Wave DAG 依赖声明
系统应当（SHALL）在每个 `<phase>` 下支持 `<waves>` 容器，包含多个 `<wave>` 节点。每个 `<wave>` 通过 `id` 属性标识（格式 `WAVE-P{n}-{序号}`，如 `WAVE-P1-01`），通过可选的 `depends_on` 属性声明对其他 wave 的依赖（逗号分隔，支持多依赖），形成 DAG。

#### Scenario: 声明 wave 依赖关系
- **GIVEN** 一个 phase 包含多个可分组的 task
- **WHEN** 系统生成 plan.xml
- **THEN** phase 下包含 `<waves>` 节点
- **AND** 每个 `<wave>` 有唯一 `id`（格式 `WAVE-P{n}-{序号}`）
- **AND** 有依赖的 wave 通过 `depends_on` 属性引用前置 wave

#### Scenario: 无依赖的 wave 立即可执行
- **GIVEN** 一个 wave 节点没有 `depends_on` 属性
- **WHEN** 执行引擎构建 DAG
- **THEN** 该 wave 入度为 0，立即加入就绪队列

#### Scenario: 多依赖 wave
- **GIVEN** 一个 wave 的 `depends_on` 包含多个 wave ID（如 `WAVE-P1-01,WAVE-P1-02`）
- **WHEN** 执行引擎评估该 wave 的就绪状态
- **THEN** 仅当所有依赖的 wave 全部完成后，该 wave 才加入就绪队列

### Requirement: Task 级别 Wave 分配
系统应当（SHALL）在 `<task>` 元素上支持 `wave` 属性，值为该 task 所属的 wave ID。同一 wave 内的 task 可并行执行。

#### Scenario: task 分配到 wave
- **GIVEN** 一个 phase 声明了 `<waves>`
- **WHEN** 系统生成 task
- **THEN** 每个 task 的 `wave` 属性值必须是该 phase 的 `<waves>` 中已声明的 wave ID

#### Scenario: 未声明 wave 属性的 task
- **GIVEN** 一个 wave 模式的 plan.xml 中某 task 缺少 `wave` 属性
- **WHEN** 系统解析该 task
- **THEN** 系统报告验证错误

### Requirement: Phase 顺序执行保证
系统应当（SHALL）保证 phase 之间严格顺序执行。前一个 phase 的所有 wave 和 task 全部完成后，才启动下一个 phase。

#### Scenario: phase 顺序执行
- **GIVEN** plan.xml 包含 P1 和 P2 两个 phase
- **AND** P1 包含 WAVE-P1-01 和 WAVE-P1-02
- **WHEN** 执行引擎运行
- **THEN** P1 的所有 wave 全部完成后才启动 P2
- **AND** P2 的 wave 编号从 WAVE-P2-01 重新开始

### Requirement: Subtask 嵌套
系统应当（SHALL）支持 subtask 的递归嵌套。subtask 可以从自闭合标签扩展为开闭标签，内部包含 `<subtasks>` 子容器。嵌套层级无硬性限制，建议不超过 4 层。

#### Scenario: subtask 嵌套
- **GIVEN** 一个 task 包含复杂的子任务结构
- **WHEN** 系统生成 plan.xml
- **THEN** subtask 可以包含 `<subtasks>` 子容器
- **AND** 子 subtask 的 ID 格式为 `T{phase}.{task}.{sub}.{sub}...`

#### Scenario: 旧的自闭合 subtask 兼容
- **GIVEN** 一个旧 plan.xml 使用自闭合 `<subtask ... />` 标签
- **WHEN** 系统解析该 plan.xml
- **THEN** 自闭合标签仍然合法，解析正常

### Requirement: Subtask 详情外链
系统应当（SHALL）支持在 subtask 内通过 `<detail_ref>` 标签引用外部文件，将复杂任务的详细描述存放在 track 目录下的独立文件中，避免 plan.xml 过度膨胀。

#### Scenario: subtask 外链详情文件
- **GIVEN** 一个 subtask 的任务描述过于复杂
- **WHEN** 系统生成 plan.xml
- **THEN** subtask 内包含 `<detail_ref>` 标签，值为相对于 track 目录的文件路径
- **AND** 对应的详情文件存放在 `phases/P{n}/` 目录下

#### Scenario: detail_ref 文件不存在时的验证
- **GIVEN** subtask 的 `<detail_ref>` 引用了一个不存在的文件
- **WHEN** 系统执行验证
- **THEN** 系统报告验证错误，指出缺失的文件路径

### Requirement: Context Files 上下文声明
系统应当（SHALL）在 `<phase>` 下支持 `<context_files>` 容器，包含多个 `<file>` 子元素，声明该 phase 执行时需要读取的上下文文件路径。此机制替代原有的 `<references>` 标签。

#### Scenario: 声明 phase 上下文文件
- **GIVEN** 一个 phase 的执行需要特定文件作为上下文
- **WHEN** 系统生成 plan.xml
- **THEN** phase 下包含 `<context_files>` 节点
- **AND** 每个 `<file>` 子元素包含相对于项目根目录的文件路径

#### Scenario: 子代理读取上下文文件
- **GIVEN** 执行引擎启动子代理执行某 phase 的 task
- **WHEN** 子代理初始化
- **THEN** 子代理根据 `<context_files>` 声明的路径读取所需文件
- **AND** 编排器不传递文件内容，仅传递路径

### Requirement: Wave 配置
系统应当（SHALL）在 plan.xml 根级别支持 `<wave_config>` 节点，配置波次执行的全局参数，包括是否并行（`<parallel>`）、最大并发数（`<max_concurrent>`）、波次间抽检（`<spot_check>`）。

#### Scenario: 配置波次执行参数
- **GIVEN** 用户创建 wave 模式的 track
- **WHEN** 系统生成 plan.xml
- **THEN** plan.xml 包含 `<wave_config>` 节点
- **AND** 包含 `<parallel>`、`<max_concurrent>`、`<spot_check>` 配置项

### Requirement: Track 目录结构扩展
系统应当（SHALL）在 wave 模式的 track 目录下支持以下新增目录和文件，且不删除任何现有文件：
- `context.md`：用户决策记录
- `state.md`：活记忆，执行状态追踪
- `phases/P{n}/index.md`：phase 级别共享知识索引
- `waves/WAVE-P{n}-{序号}/index.md`：wave 级别共享知识索引

#### Scenario: wave 模式 track 目录结构
- **GIVEN** 用户创建 wave 模式的 track
- **WHEN** 执行引擎开始执行
- **THEN** track 目录下创建 `phases/` 和 `waves/` 子目录
- **AND** 每个 phase 完成后生成 `phases/P{n}/index.md`
- **AND** 每个 wave 完成后生成 `waves/WAVE-P{n}-{序号}/index.md`

#### Scenario: 现有 track 文件不受影响
- **GIVEN** 一个现有的 sequential 模式 track
- **WHEN** 系统处理该 track
- **THEN** 不创建 phases/ 和 waves/ 目录
- **AND** 现有文件（metadata.json、spec.md、proposal.md、plan.xml、design.md）不被修改或删除

### Requirement: 新增命令
系统应当（SHALL）提供以下新命令，所有提示词使用中文编写，命令前缀为 `codument:`：
- `/codument:discuss`：Phase 级讨论，生成 context.md
- `/codument:plan-wave`：生成带 wave 标记的 plan.xml
- `/codument:execute-wave [phase]`：按波次并行执行，可选指定单个 phase
- `/codument:verify`：独立验证子代理

#### Scenario: execute-wave 执行全部 phase
- **GIVEN** 用户有一个 wave 模式的 track
- **WHEN** 用户运行 `/codument:execute-wave`
- **THEN** 系统按 phase 顺序遍历，每个 phase 内按 wave DAG 调度执行

#### Scenario: execute-wave 执行指定 phase
- **GIVEN** 用户有一个 wave 模式的 track
- **AND** P1 已完成
- **WHEN** 用户运行 `/codument:execute-wave P2`
- **THEN** 系统仅执行 P2 的 wave 调度
- **AND** 跳过已完成的 phase

#### Scenario: discuss 生成 context.md
- **GIVEN** 用户需要在执行前讨论某 phase 的实现方案
- **WHEN** 用户运行 `/codument:discuss`
- **THEN** 系统引导用户讨论并将决策记录到 track 目录的 `context.md`

#### Scenario: verify 独立验证
- **GIVEN** 用户完成了 wave 执行
- **WHEN** 用户运行 `/codument:verify`
- **THEN** 系统启动独立验证子代理
- **AND** 验证 must_haves 与实际代码库的一致性

## MODIFIED Requirements

### Requirement: Plan XML 格式
系统应当（SHALL）定义结构化的 plan.xml 格式，包含：
- metadata 元数据（含 commit_mode、execution_mode）
- milestones 里程碑
- phases 阶段（含 waves 声明、context_files）
- tasks 任务（状态在属性中，含 wave 属性）
- subtasks 子任务（支持递归嵌套、detail_ref 外链）
- acceptance_criteria 验收标准
- gate_criteria 阶段门控标准
- wave_config 波次配置
- validations 验证
- risks 风险
- summary 统计

#### Scenario: 解析 plan.xml
- **GIVEN** 系统需要读取任务信息
- **WHEN** 系统读取 plan.xml 文件
- **THEN** 系统能正确解析所有元素和属性
- **AND** 系统能识别 commit_mode 和 execution_mode 设置

#### Scenario: 更新任务状态
- **GIVEN** 任务已完成
- **WHEN** 系统更新 plan.xml
- **THEN** 系统更新任务的 status 属性
- **AND** 系统更新 acceptance_criteria 的 checked 属性

### Requirement: Metadata.json 职责精简
系统应当（SHALL）将 metadata.json 的职责限定为项目级元数据，移除与 plan.xml 重复的字段：
- `commit_mode` 仅在 plan.xml 的 `<metadata><commit_mode>` 中维护，从 metadata.json 中移除
- metadata.json 的 `status` 语义明确为项目级状态（如 codument init 所处阶段），track 执行状态仅在 plan.xml 的 `<metadata><status>` 中维护

#### Scenario: metadata.json 不含 commit_mode
- **GIVEN** 用户创建新 track
- **WHEN** 系统生成 metadata.json
- **THEN** metadata.json 不包含 `commit_mode` 字段
- **AND** commit_mode 仅在 plan.xml 的 `<metadata>` 中声明

#### Scenario: 读取 commit_mode
- **GIVEN** 系统需要获取 track 的提交模式
- **WHEN** 系统读取配置
- **THEN** 系统从 plan.xml 的 `<commit_mode>` 读取
- **AND** 不从 metadata.json 读取

## REMOVED Requirements

### Requirement: Task 级别 Dependencies
**原因**：依赖关系由 wave DAG（`<waves>` 中的 `<wave depends_on="...">`) 统一表达，task 级别的 `<dependencies>` 标签成为冗余信息源，存在两套依赖互相矛盾的风险。
**迁移**：从 plan-xml-spec、提示词、解析器中移除 `<dependencies>` 相关描述和代码。旧归档 plan.xml 中的 `<dependencies>` 保留不动，但不再被解析器使用。

### Requirement: Metadata.json 中的 commit_mode 字段
**原因**：与 plan.xml 中的 `<commit_mode>` 重复，存在不一致风险。
**迁移**：从 metadata.json 模板和生成逻辑中移除 `commit_mode`。现有 track 的 metadata.json 中若包含该字段，解析器忽略即可。
