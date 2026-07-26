# Decisions

## Usage

- 本文件记录本 track 创建时已经确认的关键决策。
- 后续执行中出现新的重大取舍，应继续追加到本文件。
- archive 时，只有对未来仍有约束力的 durable decisions 才提升到 `codument/decisions/`。

### 1. 【P0】specs 的长期定位
- 背景：Markdown specs 文档性弱于 docs，事实真源弱于代码和测试，且不适合精确 mutation。
- 需要决定：`specs/` 继续作为 Markdown 文档库，还是转为更精简的 contract registry。
- 选项：
  - A) 保持 Markdown specs。
  - B) 将 specs 降级为 XML contract registry。
  - C) 移除 specs，只依赖 docs 和代码。
- 用户答复：同意将 specs 降级为 Contract Registry，并希望每个 spec 文件是 XML。
- 最终决策：采用 B。
- 决策理由：XML 更适合结构化定位、mutation、BDD case 组织和测试映射；specs 应承载契约而不是完整文档。
- 状态：accepted

### 2. 【P0】BDD case 的存放位置
- 背景：原 spec.md 中的 Scenario/BDD 内容仍需要保留，并且应便于指导测试 case 编写。
- 需要决定：BDD case 是否留在 XML spec 内。
- 选项：
  - A) BDD case 留在 XML spec 内。
  - B) BDD case 移到测试文件。
  - C) BDD case 移到 docs。
- 用户答复：BDD 内容应保留在 XML spec 中，并支持多层级、多目录、场景嵌套，参考测试框架组织方式。
- 最终决策：采用 A，并设计 `suite` / `case` 层级。
- 决策理由：spec registry 的核心价值之一是指导测试组织；suite/case 可自然映射测试框架。
- 状态：accepted

### 3. 【P0】mutation protocol 的形态
- 背景：为每个领域概念增加 mutation 类型会导致协议膨胀。
- 需要决定：mutation 使用领域操作集合，还是泛化 XML 节点 mutation。
- 选项：
  - A) 使用 add-requirement/add-scenario 等领域操作。
  - B) 使用 XML tag 表达领域结构，attribute 表达通用 mutation。
- 用户答复：同意 B。
- 最终决策：采用 XML tag + `op/selector/to` 等通用 attribute，第一版 op 控制在 `upsert/delete/move`。
- 决策理由：新增领域概念时只增加 XML tag，不增加 mutation 类型。
- 状态：accepted

### 4. 【P0】selector 是否使用 VFS URI
- 背景：spec 会从单文件演化为目录，多文件拆分后物理路径不应成为逻辑身份。
- 需要决定：selector 使用物理路径还是虚拟 URI。
- 选项：
  - A) 使用真实文件路径。
  - B) 使用 `spec://` 等 VFS URI。
- 用户答复：使用 `spec://` VFS，并扩展到 `decision://` 等其他系统对象。
- 最终决策：采用 B。
- 决策理由：VFS URI 能在文件拆分、移动、归档后保持逻辑地址稳定。
- 状态：accepted

### 5. 【P0】docs attractor 是否写死 Web 分层
- 背景：Codument 是通用工具，不应把某个项目或 Web 项目的目录结构写成默认规范。
- 需要决定：默认 docs attractor 是否写死 `domain/ui/server` 或类似结构。
- 选项：
  - A) 写死 Web 项目分层。
  - B) 保持领域中立，只在示例中给出不同项目类型的结构。
- 用户答复：采用 B。
- 最终决策：默认 docs attractor 保持业务领域中立，可用 Web、CLI、数据平台、编译器等作为示例。
- 决策理由：Codument 应支持不同项目定义自己的 canonical/derived/implementation knowledge planes。
- 状态：accepted

### 6. 【P0】项目级 attractor 目录
- 背景：Codument 当前项目级不走偏能力弱，原有 product/project/tech-stack 分散在 codument 根层。
- 需要决定：新增文件放在哪里。
- 选项：
  - A) 放在 codument 根目录。
  - B) 统一放在 `codument/attractors/`。
- 用户答复：采用 B，并希望原 `product.md`、`project.md` 也迁入 attractors；`tech-stack.md` 废弃，新项目不再生成。
- 最终决策：采用 B。
- 决策理由：集中项目级吸引子，允许用户自定义添加，不污染根层。
- 状态：accepted

### 7. 【P0】knowledge sync 是否默认开启
- 背景：多数现有 Codument 项目没有规范化 docs 目录结构。
- 需要决定：docs knowledge sync 是否默认启用。
- 选项：
  - A) 默认开启。
  - B) 默认关闭，由 feature config 控制。
- 用户答复：采用 B。
- 最终决策：新增 `codument/config/feature.json`，`knowledgeSync.enabled=false`。
- 决策理由：避免对老项目产生意外文档修改。
- 状态：accepted

### 8. 【P0】track 是否增加多个 knowledge 文件
- 背景：增加 `knowledge.patch.xml`、`docs-updates.md`、`owner-doc-obligations.md`、`closure-audit.md` 会导致 track 文件过多。
- 需要决定：是否新增多个 track 根文件。
- 选项：
  - A) 新增多个独立文件。
  - B) 尽量复用现有文件，未来最多考虑统一 patch 文件。
- 用户答复：不接受新增多个文件。
- 最终决策：采用 B。
- 决策理由：降低 track 噪音，保持目录可维护。
- 状态：accepted

### 9. 【P0】大型 proposal/design 如何组织
- 背景：本 track 设计细节很多，单个 proposal.md/design.md 不便维护。
- 需要决定：大型 track 是否支持 `proposal/` 和 `design/` 子目录。
- 选项：
  - A) 所有内容塞进根级 proposal.md/design.md。
  - B) 大型 track 创建 proposal/ 和 design/ 子目录，根级文件做总览引用。
- 用户答复：采用 B，并要求修改 codument-track 提示词。
- 最终决策：采用 B。
- 决策理由：大型设计需要分方向保存细节，同时保持根级文件可扫描。
- 状态：accepted

### 10. 【P0】decisions 的长期存储
- 背景：track `decisions.md` 记录过程决策，但长期项目记忆需要 durable decisions。
- 需要决定：是否新增与 specs 同级的 decisions registry。
- 选项：
  - A) 决策只留在 archive。
  - B) 新增 `codument/decisions/`。
- 用户答复：倾向 B。
- 最终决策：采用 B。
- 决策理由：长期设计取舍应从过程 track 中提升出来，供未来 session 读取。
- 状态：accepted

### 11. 【P0】memory 的长期存储和目录组织
- 背景：除了 spec 和 decision，还需要记录教训、事故、模式和总结。
- 需要决定：是否新增 memory registry，以及如何组织。
- 选项：
  - A) 不新增 memory。
  - B) 新增 `codument/memory/`，按 lessons/incidents/patterns/summaries 分类。
- 用户答复：采用 B，但不要 `index.md`；时间前缀精确到分钟；第一层时间分区用 `YYYY-MM`。
- 最终决策：采用 B。
- 决策理由：memory 需要长期保留，但应 append-only、低冲突、可扫描。
- 状态：accepted

### 12. 【P0】archive 时间前缀
- 背景：一天多个 track 时日期级前缀不能表达顺序；后补归档会让归档日期和实际迭代时间不一致。
- 需要决定：archive 时间来自归档日期还是 track 最后更新时间。
- 选项：
  - A) 使用归档命令执行时间。
  - B) 使用 track 最后更新时间，精确到分钟。
- 用户答复：采用 B。
- 最终决策：archive 路径使用 `codument/archive/YYYY-MM/YYYY-MM-DD-HHmm-track-id/`。
- 决策理由：历史顺序应反映实际迭代顺序，而不是归档操作时间。
- 状态：accepted

