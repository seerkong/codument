# 变更：重构 Codument 为 VFS 驱动的项目知识与 spec coding 系统

## 背景和动机 (Context And Why)

当前 Codument 以 Markdown `spec.md` 和 `specs/` 目录作为规范真源，并在 track 归档时尝试把 Markdown delta 合并回 `specs/`。这个模型已经暴露出三个核心问题：

- Markdown spec 不适合精确表达增删改移动，也不适合长期演化为可测试、可拆分、可定位的契约树。
- `specs/` 的文档性不如项目 docs，事实真源又不如代码和测试，导致长期价值弱化。
- track 结束后知识只尝试合并到 `specs/`，没有可配置地同步到项目 docs、决策库、长期记忆和项目 attractor。

本 track 目标是把 Codument 从“Markdown spec 合并工具”升级为“基于 VFS URI 的 spec coding 与项目知识收敛工具”。

详细背景见 [proposal/problem-statement.md](./proposal/problem-statement.md)。
兼容策略见 [proposal/scope-and-compatibility.md](./proposal/scope-and-compatibility.md)。

## “要做”和“不做” (Goals / Non-Goals)

**目标:**
- 将 `specs/` 定位为 XML capability contract registry，而不是完整文档库。
- 设计并实现 `spec://` VFS selector，使 spec mutation 不依赖物理文件路径。
- 支持 XML spec 中的多层级 BDD 组织：`capability -> requirement -> statement -> suite -> case`。
- 支持 spec 单文件与同名目录两种物理形态，并允许大 spec 拆分为多文件。
- 引入通用 XML mutation protocol，使用 XML tag 表达领域结构，用少量 attribute 表达 `op`、`selector`、`to` 等操作。
- 新增 `codument/attractors/`，并把项目级 product/project 类上下文迁入 attractors；新项目不再生成 `codument/tech-stack.md`。
- 改造 `codument upgrade-workspace`，使旧项目可以升级到新目录和配置格式，同时保留不可安全转换的旧内容。
- 更新 `codument/std/AGENTS.md`，要求读取 `codument/attractors/` 目录，而不是引用固定 attractor 文件名。
- 新增 `codument/config/feature.json`，默认关闭 `knowledgeSync` 和 `projectMemory`，并兼容老项目缺失配置。
- 引入 `codument/decisions/` 作为长期决策 registry，使用 `decision://` URI。
- 引入可选 `codument/memory/` 作为长期项目记忆，使用 `memory://` URI，并按 `lessons/incidents/patterns/summaries/YYYY-MM/` 组织。
- 修改 archive 命名：使用 track 最后更新时间的分钟级前缀，目录形态为 `codument/archive/YYYY-MM/YYYY-MM-DD-HHmm-<track-id>/`。
- 当启用 knowledge sync 时，允许同步到 `docs/` 或配置中的其他 workspace 内/外知识目录。
- 新增手动 docs 同步 lifecycle skills：一个用于将现存项目总结到 `docs/modeling` 与 `docs/impl`，一个用于将指定 track 的改动同步到这两个 docs 目录。
- 新增旧项目迁移 lifecycle skills：一个用于将旧 `archive` 布局转换为新的 `YYYY-MM/YYYY-MM-DD-HHmm-track-id` 目录规范，一个用于将旧 Markdown specs 迁移为新的 XML specs 文件/目录规范。
- 更新 track 生成提示词：大型需求必须能够创建 `proposal/` 和 `design/` 子目录，`proposal.md` 和 `design.md` 作为总览引用子文件。

**非目标:**
- 不把某个特定项目的 docs 结构硬编码为 Codument 默认规范。
- 不强制所有项目启用 docs knowledge sync。
- 不要求第一版实现完整 docs 链接合法性检查。
- 不要求第一版为 memory 建立中心 `index.md`。
- 不要求第一版把所有旧 Markdown specs 一次性迁移为 XML；可以提供兼容读取和渐进迁移路径。
- 不要求立即实现复杂查询 UI；CLI 扫描和验证能力优先。

## 变更内容（What Changes）

- **BREAKING 候选**：新项目初始化的项目级上下文文件从 `codument/product.md`、`codument/project.md` 调整为 `codument/attractors/product.md`、`codument/attractors/project.md`。
- **BREAKING 候选**：新项目不再生成 `codument/tech-stack.md`；旧项目保留但不再作为标准入口。
- `codument/std/AGENTS.md` 改为读取 `codument/attractors/` 下相关 attractor。
- `codument upgrade-workspace` 支持旧项目迁移到新格式；对不便自动升级的旧内容，写入临时备份并保留到 `codument/legacy/`。
- `codument/specs/` 支持 XML capability registry，并定义 `spec://` selector。
- `codument/tracks/<track>/spec.xml` 或未来统一 patch XML 支持 XML mutation。
- `codument/archive/` 改用 `YYYY-MM/YYYY-MM-DD-HHmm-track-id/`，时间来自 track 最后更新时间。
- 新增 `codument/decisions/`，用于 archive 时提升 durable decisions。
- 新增可选 `codument/memory/`，用于 archive 时提升 durable lessons/incidents/patterns/summaries。
- 新增 `codument/config/feature.json`，控制 `knowledgeSync` 和 `projectMemory`。
- 更新 track/archive/implement/plan-wave 等提示词，使启用 knowledge sync 时计划中包含 docs 同步任务。
- 更新 codument-track 提示词，使大需求可创建 `proposal/`、`design/` 子目录。
- 新增 `codument-docs-bootstrap`、`codument-docs-sync-track`、`codument-migrate-archive`、`codument-migrate-specs` 四个 standalone lifecycle skills。

## 影响范围（Impact）

- 受影响的功能规范：
  - `codument-core`
  - 新增或修改：spec XML registry、VFS URI、archive、init、upgrade-workspace、track authoring、knowledge sync、project memory、decisions registry。
- 受影响的代码与文档：
  - `src/cli/commands/init.ts`
  - `src/cli/commands/upgrade-workspace.ts`
  - `src/cli/commands/archive.ts`
  - `src/cli/commands/validate.ts`
  - `src/cli/utils/index.ts`
  - `src/prompts/track.md`
  - `src/prompts/archive.md`
  - `src/prompts/docs-bootstrap.md`
  - `src/prompts/docs-sync-track.md`
  - `src/prompts/migrate-archive.md`
  - `src/prompts/migrate-specs.md`
  - `src/prompts/implement.md`
  - `src/prompts/plan-wave.md`
  - `src/prompts/std_agents.md`
  - `src/prompts/templates/product.md`
  - `src/prompts/templates/project.md`
  - `src/prompts/templates/tech-stack.md`
  - `codument/std/AGENTS.md`
  - `codument/std/workflow.md`
  - generator tests and command tests
