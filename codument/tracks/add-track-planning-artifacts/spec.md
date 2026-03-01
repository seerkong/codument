## ADDED Requirements

### Requirement: Track 创建时生成 analysis 产物
系统应当（SHALL）在创建新的 track 目录后，自动在该 track 目录下生成用于持久化上下文理解与进展的 analysis 产物。

#### Scenario: 创建新 track 时生成 analysis 目录与文件
- **GIVEN** `codument/` 已初始化且用户创建一个新的 track
- **WHEN** AI 助手完成 `codument/tracks/<track_id>/` 目录创建
- **THEN** 系统在 `codument/tracks/<track_id>/analysis/` 创建以下文件：
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- **AND** 以上文件包含可用的模板内容，用于后续持续更新

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

## Non-Goals

- 不要求 codument CLI 本身提供新的命令来管理这些 analysis 文件
- 不强制 validate 对 analysis 文件做结构校验（避免破坏已有/自定义用法）
