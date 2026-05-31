# Specification Delta: Codument VFS, XML Specs, Attractors, Decisions, Memory

## ADDED Requirements

### Requirement: Codument MUST support XML spec registry
系统应当（SHALL）支持以 XML 文件表达 `codument/specs/` 下的 capability contract registry，并保留从 Markdown spec 迁移的兼容路径。

#### Scenario: XML spec contains BDD cases
- **GIVEN** 一个 capability 需要表达可测试行为
- **WHEN** 维护者创建 XML spec
- **THEN** spec 可以包含 `capability`、`requirement`、`statement`、`suite`、`case` 节点
- **AND** `case` 节点可以包含 `given`、`when`、`then`
- **AND** 这些 case 可用于指导测试 case 组织

#### Scenario: XML spec supports nested suites
- **GIVEN** 一个 requirement 下存在多层测试语境
- **WHEN** 维护者组织 XML spec
- **THEN** 可以在 `requirement` 下创建嵌套 `suite`
- **AND** 叶子行为场景使用 `case`
- **AND** 不需要用 Markdown 标题层级表达测试语境

#### Scenario: Large XML spec upgrades to same-name folder
- **GIVEN** 一个 XML spec 文件内容过长
- **WHEN** 维护者或 AI 拆分该 spec
- **THEN** 可以将 `codument/specs/<capability>.xml` 升级为 `codument/specs/<capability>/index.xml`
- **AND** 通过 `include` 引用拆分出的 requirement 或 suite 文件
- **AND** 逻辑 selector 不因物理拆分而改变

### Requirement: Codument MUST provide VFS URI selectors
系统应当（SHALL）提供统一 VFS URI namespace，用于 spec、decision、memory、attractor、track、archive、knowledge 和 test 的逻辑引用。

#### Scenario: Spec selector uses spec URI
- **GIVEN** 一个 spec patch 需要定位某个 case
- **WHEN** patch 声明 selector
- **THEN** selector 使用 `spec://...`
- **AND** selector 不使用真实文件路径

#### Scenario: Decision selector uses decision URI
- **GIVEN** 一个长期决策需要被引用
- **WHEN** track、spec 或 memory 关联该决策
- **THEN** 使用 `decision://...` 作为逻辑引用

#### Scenario: Knowledge target uses knowledge URI only when enabled
- **GIVEN** `knowledgeSync.enabled=true`
- **WHEN** spec 或 plan 需要提示 docs 同步位置
- **THEN** 可以使用 `knowledge://<target-name>/...`
- **AND** 未启用 knowledge sync 时不应生成 knowledge hint

### Requirement: Codument MUST support generic XML mutation protocol
系统应当（SHALL）使用通用 XML node mutation protocol 表达 spec delta，而不是为每类领域节点创建独立操作类型。

#### Scenario: Upsert XML node
- **GIVEN** track 需要新增或替换 spec case
- **WHEN** spec patch 包含 `op="upsert"` 和 `selector="spec://..."`
- **THEN** 系统将该 XML 节点写入 selector 对应逻辑位置

#### Scenario: Delete XML node
- **GIVEN** track 需要移除 spec case
- **WHEN** spec patch 包含 `op="delete"` 和 `selector="spec://..."`
- **THEN** 系统删除 selector 对应节点

#### Scenario: Move XML node
- **GIVEN** track 需要移动 requirement 或 suite
- **WHEN** spec patch 包含 `op="move"`、`selector="spec://..."` 和 `to="spec://..."`
- **THEN** 系统移动该逻辑节点

### Requirement: Codument MUST create project attractors directory for new projects
系统应当（SHALL）在新项目初始化时创建 `codument/attractors/`，并将项目级 product/project 类上下文放入该目录。

#### Scenario: New init creates attractors
- **GIVEN** 用户在新项目运行 `codument init`
- **WHEN** 初始化完成
- **THEN** 系统创建 `codument/attractors/product.md`
- **AND** 系统创建 `codument/attractors/project.md`
- **AND** 系统不再生成 `codument/tech-stack.md`

#### Scenario: std AGENTS reads attractors directory
- **GIVEN** AI 助手开始处理 Codument 项目
- **WHEN** 助手读取 `codument/std/AGENTS.md`
- **THEN** 指南要求根据任务读取 `codument/attractors/` 下相关文件
- **AND** 不假设 attractors 目录只有固定文件名

### Requirement: Codument MUST upgrade old workspaces to the new format
系统应当（SHALL）通过 `codument upgrade-workspace` 将旧项目补齐到新的 Codument 目录、配置和兼容读取格式。

#### Scenario: Upgrade creates missing new structure
- **GIVEN** 一个旧项目只有旧版 `codument/project.md`、`codument/product.md`、`codument/specs/` 和标准文件
- **WHEN** 用户运行 `codument upgrade-workspace`
- **THEN** 系统创建缺失的 `codument/attractors/`
- **AND** 系统创建缺失的 `codument/config/feature.json`
- **AND** 默认关闭 `knowledgeSync` 和 `projectMemory`
- **AND** 系统不删除旧项目文件

#### Scenario: Upgrade preserves existing user edits
- **GIVEN** 旧项目已经手动创建或编辑了 `codument/attractors/` 或 `codument/config/feature.json`
- **WHEN** 用户运行 `codument upgrade-workspace`
- **THEN** 系统不覆盖已有 attractor 内容
- **AND** 系统不改变已有 feature 配置值
- **AND** 仅补齐明确缺失且安全的默认项

#### Scenario: Old specs are preserved when conversion is unsafe
- **GIVEN** 旧项目存在 Markdown spec
- **AND** 系统无法保证自动转换为 XML 后语义等价
- **WHEN** 用户运行 `codument upgrade-workspace`
- **THEN** 系统保留旧 spec 原路径以支持兼容读取
- **AND** 系统将旧 spec 复制到 `codument/legacy/specs/...`
- **AND** 如果实现存在临时备份机制，系统也可以写入临时备份
- **AND** 临时备份不能替代 `codument/legacy/`

#### Scenario: Legacy directory stores migration evidence
- **GIVEN** 旧项目包含不再作为新格式入口的文件
- **WHEN** upgrade 无法或不应自动迁移这些内容
- **THEN** 系统在 `codument/legacy/` 中保存可读副本
- **AND** `codument/legacy/` 不作为新的事实真源
- **AND** `codument/legacy/` 不生成中心 `index.md`

### Requirement: Codument MUST provide feature config
系统应当（SHALL）提供 `codument/config/feature.json` 控制可选能力，并在缺失时使用默认关闭语义。

#### Scenario: Missing feature config defaults to disabled
- **GIVEN** 老项目没有 `codument/config/feature.json`
- **WHEN** Codument 判断 knowledge sync 或 project memory 是否启用
- **THEN** `knowledgeSync.enabled` 等价为 `false`
- **AND** `projectMemory.enabled` 等价为 `false`

#### Scenario: Upgrade preserves existing feature config
- **GIVEN** 项目已有 `codument/config/feature.json`
- **WHEN** 用户运行 `codument upgrade-workspace`
- **THEN** 系统不覆盖已有配置项
- **AND** 仅在安全缺省范围内补齐缺失配置

#### Scenario: Knowledge sync target may be outside workspace
- **GIVEN** `knowledgeSync.enabled=true`
- **AND** target root 是绝对路径
- **WHEN** 系统执行知识同步任务
- **THEN** 仅使用配置中显式声明的绝对路径
- **AND** 不自行猜测 workspace 外目录

### Requirement: Codument MUST archive tracks using minute-level updated time
系统应当（SHALL）使用 track 最后更新时间生成 archive 路径，而不是使用归档命令执行日期。

#### Scenario: Archive path uses YYYY-MM bucket
- **GIVEN** track 最后更新时间是 `2026-05-30T14:32:00+08:00`
- **WHEN** 用户归档 track `refactor-spec-xml-vfs`
- **THEN** 归档路径为 `codument/archive/2026-05/2026-05-30-1432-refactor-spec-xml-vfs/`

#### Scenario: Late archive preserves iteration order
- **GIVEN** track 在 2026-05-30 最后更新
- **AND** 用户在 2026-06-02 才执行归档
- **WHEN** 系统生成 archive 目录
- **THEN** 目录时间前缀仍使用 2026-05-30 的 track 最后更新时间

### Requirement: Codument MUST support long-term decisions registry
系统应当（SHALL）支持 `codument/decisions/` 作为长期项目决策 registry。

#### Scenario: Durable track decision is promoted
- **GIVEN** track 的 `decisions.md` 中存在对未来仍有约束力的决策
- **WHEN** track 归档
- **THEN** 系统可将该决策提升到 `codument/decisions/YYYY-MM/YYYY-MM-DD-HHmm-slug/decision.md`
- **AND** 该决策可以通过 `decision://...` 引用

### Requirement: Codument MUST support optional project memory
系统应当（SHALL）在 `projectMemory.enabled=true` 时支持 `codument/memory/` 长期项目记忆。

#### Scenario: Memory is not created by default
- **GIVEN** `projectMemory.enabled=false`
- **WHEN** track 归档
- **THEN** 系统不创建 `codument/memory/`
- **AND** 不提升 memory

#### Scenario: Lesson memory is promoted
- **GIVEN** `projectMemory.enabled=true`
- **AND** track 暴露了未来应避免的规则
- **WHEN** track 归档
- **THEN** 系统可创建 `codument/memory/lessons/YYYY-MM/YYYY-MM-DD-HHmm-slug/lesson.md`
- **AND** 不创建 `codument/memory/index.md`

#### Scenario: Incident memory is promoted
- **GIVEN** `projectMemory.enabled=true`
- **AND** track 记录了一次具体错误、根因和修复
- **WHEN** track 归档
- **THEN** 系统可创建 `codument/memory/incidents/YYYY-MM/YYYY-MM-DD-HHmm-slug/incident.md`

#### Scenario: Pattern memory is promoted
- **GIVEN** `projectMemory.enabled=true`
- **AND** track 产生了可复用工作模式
- **WHEN** track 归档
- **THEN** 系统可创建 `codument/memory/patterns/YYYY-MM/YYYY-MM-DD-HHmm-slug/pattern.md`

### Requirement: Codument MUST support configurable knowledge sync
系统应当（SHALL）在 `knowledgeSync.enabled=true` 时，根据配置 target 和对应 attractor 同步 docs 或其他知识目录。

#### Scenario: Plan includes docs sync task when enabled
- **GIVEN** `knowledgeSync.enabled=true`
- **WHEN** 系统生成大型 track 的 `plan.xml`
- **THEN** 计划包含知识同步任务
- **AND** 任务要求读取 target 对应 attractor

#### Scenario: No docs link when disabled
- **GIVEN** `knowledgeSync.enabled=false`
- **WHEN** 系统生成 spec XML 或 plan
- **THEN** 不生成 `knowledge://` hint
- **AND** 不要求更新 docs

### Requirement: codument-track MUST support proposal and design subdirectories for large tracks
系统应当（SHALL）在创建设计点多、内容大的 track 时，允许并鼓励创建 `proposal/` 和 `design/` 子目录，根级 `proposal.md` 与 `design.md` 作为总览引用子文件。

#### Scenario: Large proposal uses proposal directory
- **GIVEN** track 背景、范围、兼容性或 rollout 内容较多
- **WHEN** AI 助手创建 proposal
- **THEN** 可以创建 `proposal/` 子目录
- **AND** `proposal.md` 引用子文件
- **AND** 子文件位于当前 track 目录内

#### Scenario: Large design uses design directory
- **GIVEN** track 有多个子方向详细设计
- **WHEN** AI 助手创建 design
- **THEN** 可以创建 `design/` 子目录
- **AND** `design.md` 引用子设计文件
- **AND** 子文件位于当前 track 目录内

#### Scenario: Track prompt provides good bad examples
- **GIVEN** AI 助手使用 codument-track 创建大型 track
- **WHEN** 提示词说明 proposal/design 子目录规则
- **THEN** 提示词包含 good examples
- **AND** 提示词包含 bad examples

## MODIFIED Requirements

### Requirement: 项目初始化命令
系统应当（SHALL）继续提供 `codument init` 命令，并调整新项目初始化的项目级上下文输出。

#### Scenario: 初始化新项目生成 attractors
- **GIVEN** 用户在新项目运行 `codument init`
- **WHEN** 初始化完成
- **THEN** 系统创建 `codument/attractors/`
- **AND** 系统在该目录下创建 project/product 类 attractor
- **AND** 系统不再为新项目生成 `codument/tech-stack.md`

### Requirement: 创建变更追踪命令
系统应当（SHALL）继续提供 `/codument:track` 命令，并支持大型需求的 proposal/design 子目录拆分。

#### Scenario: 创建大型 track
- **GIVEN** 用户提出的需求涉及多个设计方向
- **WHEN** AI 助手创建 track
- **THEN** track 可以包含 `proposal/` 和 `design/`
- **AND** 根级 `proposal.md`、`design.md` 作为导航和摘要

### Requirement: 归档命令
系统应当（SHALL）继续提供 archive 命令，并扩展为 spec、decision、memory、knowledge 的归档收敛入口。

#### Scenario: Archive promotes durable artifacts
- **GIVEN** track 已完成
- **WHEN** 用户归档 track
- **THEN** 系统按配置更新 `spec://`
- **AND** 系统提升 durable decisions 到 `decision://`
- **AND** 如 `projectMemory.enabled=true`，系统提升 durable memory 到 `memory://`
- **AND** 如 `knowledgeSync.enabled=true`，系统执行或提示 knowledge sync

## Non-Functional Requirements

### Requirement: 新结构必须对多分支协作友好
系统应当（SHALL）避免为 archive 和 memory 维护中心 `index.md`，优先通过追加新目录和 CLI 扫描降低冲突。

#### Scenario: 多个分支同时产生 memory
- **GIVEN** 两个分支都启用了 project memory
- **WHEN** 两个分支分别归档 track
- **THEN** 各自创建独立时间前缀目录
- **AND** 不修改共享 `memory/index.md`

### Requirement: 新结构必须保持项目中立
系统应当（SHALL）避免把某一类项目的 docs 目录结构写成 Codument 默认强制规范。

#### Scenario: 生成 docs knowledge attractor
- **GIVEN** 用户启用 knowledge sync
- **WHEN** 系统生成默认 docs attractor
- **THEN** attractor 描述 canonical/derived/implementation knowledge 的中立规则
- **AND** 只把 Web、CLI、数据平台、编译器等作为示例

## 验收标准

- 新项目初始化创建 `codument/attractors/` 和 `codument/config/feature.json`。
- 新项目不再生成 `codument/tech-stack.md`。
- `codument/std/AGENTS.md` 改为读取 `codument/attractors/` 目录。
- `codument upgrade-workspace` 能将旧项目补齐到新格式。
- 不便安全自动升级的旧 spec 和旧上下文文件被保留在 `codument/legacy/`，并且旧原路径继续兼容读取。
- `codument/config/feature.json` 缺失时默认关闭 knowledge sync 和 project memory。
- archive 使用 track 最后更新时间生成 `codument/archive/YYYY-MM/YYYY-MM-DD-HHmm-track-id/`。
- archive 读取兼容旧 archive 目录。
- XML spec schema 支持 capability/requirement/statement/suite/case。
- XML spec 支持单文件和同名目录拆分。
- spec mutation 使用 `op`、`selector`、`to` 等通用 attribute。
- VFS URI parser 支持 `spec://`、`decision://`、`memory://`、`attractor://`、`track://`、`archive://`、`knowledge://`、`test://`。
- durable decisions 可提升到 `codument/decisions/`。
- projectMemory 启用时，memory 可提升到 `codument/memory/lessons|incidents|patterns|summaries/YYYY-MM/...`。
- memory 不生成中心 `index.md`。
- knowledgeSync 启用时，计划生成包含知识同步任务；关闭时不生成 knowledge hint。
- codument-track 提示词支持大型 proposal/design 子目录，并包含 good/bad examples。

## 范围外事项

- 不一次性迁移所有现有 Markdown specs。
- 不实现强 docs 链接合法性检测。
- 不为 memory 生成中心索引。
- 不把任何特定项目 docs 结构写成 Codument 强制默认结构。
