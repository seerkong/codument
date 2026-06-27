## 上下文

本 track 要把 Codument 的核心从 Markdown spec 合并流程，升级为基于 VFS URI 的 spec coding 与项目知识收敛模型。

设计点很多，因此本 track 使用 `design/` 子目录存放详细设计：

- [spec-vfs-and-xml.md](./design/spec-vfs-and-xml.md)：XML spec registry、BDD suite/case、VFS URI、mutation protocol。
- [attractors-and-config.md](./design/attractors-and-config.md)：`codument/attractors/`、`feature.json`、init/upgrade 兼容。
- [archive-decisions-memory.md](./design/archive-decisions-memory.md)：archive minute-prefix、decisions registry、memory registry。
- [docs-knowledge-sync-and-track-authoring.md](./design/docs-knowledge-sync-and-track-authoring.md)：docs knowledge sync、docs attractor、大型 proposal/design 子目录提示词。

## 方案概览

1. 建立 Codument VFS URI namespace
   - `spec://`
   - `decision://`
   - `memory://`
   - `attractor://`
   - `track://`
   - `archive://`
   - `knowledge://`
   - `test://`

2. 将 `specs/` 转为 XML capability registry
   - `capability -> requirement -> statement -> suite -> case`
   - `suite` 可嵌套
   - `case` 是 BDD 叶子场景
   - 支持单文件和同名目录拆分
   - selector 使用 `spec://`，不绑定物理路径

3. 引入通用 XML mutation protocol
   - XML tag 表达领域结构
   - attribute 表达 `op`、`selector`、`to`
   - 第一版只需要 `upsert`、`delete`、`move`

4. 引入项目级 attractors
   - 新项目创建 `codument/attractors/product.md`、`codument/attractors/project.md`
   - 新项目不再生成 `codument/tech-stack.md`
   - `std/AGENTS.md` 读取 `codument/attractors/` 目录，而不是具体固定文件
   - `upgrade-workspace` 将旧项目补齐到新格式，并把不能安全转换的旧内容保留到 `codument/legacy/`

5. 引入 feature config
   - `codument/config/feature.json`
   - `knowledgeSync.enabled=false`
   - `projectMemory.enabled=false`
   - 老项目缺失配置时等价于默认关闭

6. 改造 archive
   - 归档路径使用 `YYYY-MM/YYYY-MM-DD-HHmm-track-id/`
   - 时间来自 track 最后更新时间
   - archive 时可提升 durable decisions 到 `decision://`
   - archive 时可在 feature 开启后提升 memory 和执行 knowledge sync

7. 更新提示词与 track authoring
   - 大 track 支持 `proposal/` 和 `design/` 子目录
   - `proposal.md` 和 `design.md` 作为总览引用子文件
   - docs sync 启用时，计划中自动加入知识同步任务

## 影响范围与修改点（Impact）

- CLI commands：
  - `init`
  - `upgrade-workspace`
  - `archive`
  - `validate`
  - `status/list/show` 如需展示新 registry
- Utils：
  - VFS URI parser/resolver
  - feature config loader
  - track updatedAt resolver
  - XML spec parser and patch applier
- Prompts：
  - `track`
  - `archive`
  - `implement`
  - `plan-wave`
  - `std_agents`
- Templates：
  - `product`
  - `project`
  - remove or deprecate `tech-stack` for new init
- Tests：
  - init tests
  - upgrade workspace tests
  - archive tests
  - VFS parser tests
  - XML spec parser/patch tests
  - prompt generation tests

## 决策摘要

详见 [decisions.md](./decisions.md)。

当前关键结论：

- spec 使用 XML 表示，并保留 BDD case。
- XML spec 使用 `suite` 和 `case` 支持多层级测试组织。
- mutation protocol 使用少量通用 op attribute，而不是大量领域操作类型。
- Codument 使用 VFS URI 统一 selector 和长期引用。
- docs attractor 保持领域中立，不写死 Web 项目的分层。
- `codument/decisions/` 存放长期决策。
- `codument/memory/` 存放可选长期项目记忆，不生成中心 `index.md`。
- archive 和 memory 使用分钟级时间前缀，目录第一层为 `YYYY-MM/`。

## 风险 / 权衡

- 风险：XML spec parser 和 patch applier 一次性实现过大。
  - 缓解：先实现 schema、parser、验证和最小 `upsert/delete/move`，保持 Markdown spec 兼容期。
- 风险：新增 VFS URI 概念过抽象。
  - 缓解：所有 URI scheme 都映射到明确物理目录，并在 track 中提供 examples。
- 风险：docs knowledge sync 误改外部目录。
  - 缓解：默认关闭，必须通过 feature config 显式启用 target。
- 风险：memory 泛滥且缺少中心索引。
  - 缓解：不维护 index，通过 CLI 扫描，核心总结进入 summaries 或提升到 attractors。

## 兼容性设计

- 老项目缺失 `feature.json` 时所有新可选功能关闭。
- 老项目旧 archive 目录继续可读。
- 老项目旧 `project.md`、`product.md`、`tech-stack.md` 继续保留。
- 老项目 upgrade 时补齐新目录和配置，但不破坏旧入口；旧 specs 等不能安全转换的内容既保留原位置兼容读取，也复制到 `codument/legacy/`。
- 新项目不再生成 `tech-stack.md`。
- 旧 Markdown specs 继续可读，XML spec registry 渐进引入。

## 迁移计划

1. 先实现目录和配置兼容能力。
2. 再实现 VFS parser/resolver 和 XML spec schema。
3. 再实现 archive 新路径、decision promotion、memory promotion。
4. 再接入 prompt/skill 和 docs sync。
5. 最后更新 tests 和 validate。

## 待解决问题

- 是否在第一版提供 `codument memory list/search/summarize` 命令。
- 是否在第一版提供 `codument decisions list/show` 命令。
- 是否把 XML patch 独立为 `spec.xml`，还是未来收敛成统一 `patch.xml`。
