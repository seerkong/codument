## ADDED Requirements

### Requirement: Codex 使用 skill 目录分发 Codument 工作流
系统应当（SHALL）对新版 Codex 通过 skill 目录分发 Codument 工作流，而不是继续生成 `~/.codex/prompts/codument-*.md`。

#### Scenario: 选择 Codex 时安装 codument-workflow skill
- **GIVEN** 用户运行 `codument init`
- **AND** 用户选择支持 Codex
- **WHEN** 系统生成 Codex 相关产物
- **THEN** 系统将 Codument 工作流写入 `~/.codex/skills/codument-workflow/`
- **AND** 不再依赖 `~/.codex/prompts/codument-*.md`

#### Scenario: 升级工作区时更新 Codex skill
- **GIVEN** 用户运行 `codument upgrade-workspace`
- **AND** `codument/state.json` 中包含 `codex`
- **WHEN** 系统升级 Codex 相关产物
- **THEN** 系统备份并更新 `~/.codex/skills/codument-workflow/`

### Requirement: Codex skill 内容与用户现有迁移版本一致
系统应当（SHALL）以用户当前已迁移完成的 `codument-workflow` skill 结构作为新版 Codex 兼容基线，确保初始化和升级产生相同目录形态。

#### Scenario: 初始化后 skill 目录结构完整
- **GIVEN** 系统为 Codex 安装 `codument-workflow`
- **WHEN** 用户检查目标目录
- **THEN** 目录至少包含：
  - `SKILL.md`
  - `agents/openai.yaml`
  - `references/` 下各工作流参考文件

## MODIFIED Requirements

### Requirement: 项目初始化命令
系统应当（SHALL）提供 `codument init` 命令，支持：
- 检测项目类型（Brownfield/Greenfield）
- 交互式收集项目信息
- 生成 `project.md`、`product.md`、`workflow.md`、`tech-stack.md`
- 创建初始 track
- 支持恢复中断的初始化流程
- 根据用户选择的 AI coding 工具生成对应产物

#### Scenario: 初始化时为 Codex 生成 skill 而非 prompts
- **GIVEN** 用户在初始化过程中选择 Codex
- **WHEN** 初始化完成
- **THEN** 系统输出的完成提示指向 `~/.codex/skills/codument-workflow/`
- **AND** 不再声明生成 `~/.codex/prompts/codument-*.md`

### Requirement: 升级工作区命令
系统应当（SHALL）提供 `codument upgrade-workspace` 命令，支持升级工作区内嵌标准文件与所选 AI coding 工具产物。

#### Scenario: 升级时备份 Codex skill
- **GIVEN** 用户已选择 Codex
- **WHEN** 用户运行 `codument upgrade-workspace`
- **THEN** 系统将 `~/.codex/skills/codument-workflow/` 备份到升级备份目录
- **AND** 随后用新的 skill 内容覆盖该目录

## REMOVED Requirements

### Requirement: Codex prompts 目录生成
**原因**：新版 Codex 不再以 `~/.codex/prompts/` 中的 command 文件作为 Codument 工作流入口，继续生成这些 prompts 会导致文档、初始化输出和升级逻辑与真实使用方式脱节。
**迁移**：将 Codex 相关产物统一迁移到 `~/.codex/skills/codument-workflow/`，并在代码与文档中移除 `~/.codex/prompts/codument-*.md` 的主路径表述。
