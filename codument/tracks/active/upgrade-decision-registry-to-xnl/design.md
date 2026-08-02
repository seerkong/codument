# 方案设计：完整 XNL Decision Registry

## 1. 问题定义

当前 durable decision promotion 不是“合并决策”，而是“生成摘要”：

1. `collectDecisionNodes()` 把嵌套 decision tree 展平。
2. `XnlDecisionRecord` 只保留 validation/promotion 所需的字段子集。
3. `formatXnlDecisionArtifact()` 输出 `decision.md`，只含 URI、Source、Status、Evidence、Confidence、Reversibility 等摘要。
4. `decisions/` 存在时，根 `decisions.xnl` 被跳过。
5. `decisions/` 只扫描直接子级 `*.md`，不扫描层级化 XNL。

因此，当前 `codument/decisions/` 不是 track/mission decision forest 的长期合并结果，也不能完整承载条件激活、依赖图和嵌套语义。

## 2. 目标模型

### 2.1 Canonical registry

长期真源为：

```text
codument/decisions/
  <owner-or-topic>.xnl
  <owner-or-topic>/
    index.xnl
    <subtopic>.xnl
```

物理拆分是存储和维护策略，不是 identity。decision identity 只由稳定 XNL `#id` 决定：

```text
decision://track.conditional_decision_activation.graph_nodes
```

CLI 建立全局 id index，因此 URI 解析不依赖时间戳目录或文件名。

### 2.2 输入来源

archive 对 track 和 mission 使用相同的 source discovery 规则：

1. 若存在根 `decisions.xnl`，读取其完整 decision forest。
2. 若存在 `decisions/`，递归读取其中所有 `*.xnl`。
3. 两类 XNL 来源同时存在时全部参与，不互相压制。
4. legacy `decisions.md` 与 `decisions/**/*.md` 只作为兼容输入或显式迁移输入。
5. 只提升符合 durable eligibility 且状态为 accepted/resolved 的 decision；父节点不 durable 但 durable 子节点被选择时，保留解释该子节点所需的层级/provenance 上下文，具体最小闭包由实现测试固定。

### 2.3 Full-fidelity 节点

promotion 和 merge 操作 XNL AST，不通过 `XnlDecisionRecord` 摘要模型往返。至少完整保留：

- `#id`
- tag、attributes、metadata 与未知扩展字段
- `question`、`recommendation`
- `options` / `option`
- `answer` / `raw-answer` / `decision-text` / `rationale` / `evidence`
- `depends_on`、`activation`、`derived_from`
- nested decision hierarchy
- source/provenance

validation 可以继续使用派生 view，但持久化不得使用该 view 重建节点。

## 3. Registry loader、index 与 serializer

新增或抽取通用 XNL registry primitives：

- 递归扫描 `.xnl` 文件，排序稳定且跨平台一致。
- 解析每个文件并保留 top-level AST。
- 遍历所有嵌套节点，建立 `id -> {file, node, ancestors}` index。
- 报告同一 registry 内的重复 id、缺失 id、非法 hierarchy 和引用问题。
- serializer 保留节点语义和稳定输出；不得先降级为 decision DTO。
- 支持单文件与同名目录之间的分形演化。

现有 modeling/engineering registry 与 merge 中存在重复模式。实现阶段应优先抽取可复用 primitives，再由 decision/modeling/engineering 的 schema policy 做领域差异处理，避免复制第三套 loader/merge。

## 4. 节点级合并与冲突

### 4.1 Identity

合并键为 decision `#id`，不是相对路径、文件名或 archive 时间戳。

### 4.2 Merge policy

- 新 id：加入 registry。
- 相同 id、语义等价：幂等，无重复输出。
- 相同 id、字段互补：按节点结构合并，并保留 provenance。
- 相同 id、同一字段值冲突：报告 conflict，不静默选择 ours/theirs。
- delete/modify、parent move/modify、add/add 分歧：按通用三方 merge conflict 处理。
- nested decision 的父子关系也是被合并的语义；不得展平后丢失。

第一版允许使用 conservative human conflict policy。若 archive 缺少可信 base，则按两方保守 merge 处理；不得把 registry 当前值误当作共同 base 从而吞掉冲突。

### 4.3 File ownership

decision id 的 owner file 由 registry policy 决定，推荐优先级：

1. 已存在 id 保持当前 owner file。
2. 新 id 若来自 `decisions/**/*.xnl`，保留其相对层级意图。
3. 根 `decisions.xnl` 中的新 durable roots 按稳定 owner/topic 规则落入 XNL 文件。
4. 同一 decision tree 默认保持在同一 owner file，除非已存在 registry 拆分。

具体文件布局可以演进，但 `decision://id` 和 AST 语义必须稳定。

## 5. Archive transaction

decision registry 必须进入现有 archive staging transaction：

```text
collect all deltas and decision sources
  -> parse and build indexes
  -> merge and detect conflicts
  -> validate staged behavior/modeling/engineering/decision registries
  -> stage all registry trees
  -> commit/rollback all staged registries
  -> move track
  -> write archive summary/provenance
```

要求：

- decision parse/merge/validation 失败时，live registries 和 track path 均不变。
- registry 替换中途失败时，rollback 恢复已替换内容。
- track 只在 registry commit 成功后移动。
- summary 可派生，但不得成为 decision 真源。

## 6. Validation、show 与 VFS

### 6.1 Validation

扩展 `codument decisions validate`：

- 显式文件：验证单个 XNL/legacy Markdown。
- track/mission id：验证根文件与递归 XNL source set。
- registry：递归验证 `codument/decisions/**/*.xnl`。
- 检查 XNL 结构、稳定/重复 id、decision 状态、durable metadata、hierarchy、依赖 id、activation/derived_from 引用。
- 错误报告包含 file、decision id、layer/reason。

### 6.2 URI resolution

`decision://<id>` 通过全局 index 解析。重复 id 是 validation error，不能按目录顺序任取一个。

### 6.3 Show

show 输出 decision id、owner file、status、source/provenance 和必要的层级上下文；不得只列 Markdown 文件路径。

## 7. Legacy migration

### 7.1 可恢复摘要

对带有 `Source: archive://<archive-id>` 的现有 summary `decision.md`：

1. 定位 archive。
2. 读取 archive 根 `decisions.xnl` 与递归 `decisions/**/*.xnl`。
3. 按 summary 中的 decision id 找到完整节点。
4. 把完整节点写入 staged XNL registry。
5. 在 migration manifest 中记录 summary path、archive source、decision id、target owner file 和 hash。

若找不到或找到多个候选，标记 conflict/ambiguous，不臆造。

### 7.2 Markdown-only 历史决策

对没有可恢复 XNL source 的 Markdown：

- 解析能确定的标题、URI、status、rationale、evidence、source 等。
- 生成 canonical XNL decision，保留原始 Markdown 全文或 legacy reference/provenance。
- 不能确定的 id、层级或字段显式标记 migration issue。
- 不把缺失的 question/options/activation 等字段伪造出来。

### 7.3 安全和可回滚

- 迁移前 inventory。
- 建立 `.tmp/codument/migrate-<timestamp>/` 备份或等价可恢复备份。
- 生成 migration manifest，记录 source/target/hash/status。
- 目标 XNL registry 在 staging 中验证通过后再替换。
- 原 archive 与 legacy source 保留。
- 迁移后比较 decision id 集合、关键字段、层级和原始证据。

## 8. `codument-migrate` skill 变更

实现阶段修改：

- `src/templates/skills/codument-migrate/SKILL.md`
  - description 加入历史 decisions。
  - 用法改为 `[archive | specs | decisions | all]`。
  - 明确路由到 decision migration reference。
- 新建 `src/templates/skills/codument-migrate/references/decision-migration.md`
  - inventory/classification
  - archive source recovery
  - Markdown-only conversion
  - conflict and ambiguity handling
  - backup/manifest/staging
  - verification and rollback
- 修改 `src/templates/codument/std/actions/migrate.md`
  - authoritative `what` 支持 `decisions | all`。
  - 主流程引用 reference，统一迁移报告。
- 测试确保 reference 被模板 manifest 打包、skill 正确路由、init/upgrade 后文件存在。
- build 自动刷新 `src/templates/manifest.ts`。

## 9. Dogfood 迁移

当前 `codument/decisions/` 有八条 Markdown 记录：

- 七条近期摘要可从对应 archived track 的 `decisions.xnl` 恢复完整节点。
- `2026-06-01-0036-refactor-codument-vfs-attractors-memory/decision.md` 是较大的 Markdown-only 历史决策，需要 legacy conversion。

dogfood 流程：

1. build 最新 CLI。
2. 备份当前 `codument/decisions/` 并生成 inventory。
3. 运行 decision migration。
4. 检查八条历史 decision identity 都有明确去向。
5. 对七条可恢复记录比较 archive 源节点与 registry 节点的 AST/语义。
6. 对 Markdown-only 记录检查原文 provenance 和未确定字段标记。
7. 运行 decisions validate、workspace validate、focused/full tests、typecheck、build。
8. 运行 `upgrade-workspace`，确认模板 skill/reference 已安装到本工作区。

## 10. 兼容策略

- legacy Markdown 保持可读和可迁移，但新 archive 不再生成 durable `decision.md`。
- `decision://<id>` 保持逻辑 URI，不将时间戳路径暴露为 identity。
- archive 中原始过程 decisions 继续保留，作为 provenance 和恢复来源。
- 若外部消费者仍读取 `decision.md`，可以提供明确的兼容派生视图，但该视图不得作为 registry 真源，也不得参与 merge。

## 11. 风险与缓解

- 风险：XNL serializer 改写未知字段。
  - 缓解：AST round-trip/semantic parity 测试覆盖未知属性和扩展节点。
- 风险：重复 id 的历史数据无法自动裁决。
  - 缓解：issues-first，保留源文件并暂停冲突条目。
- 风险：archive 在多个 registry 写入间部分失败。
  - 缓解：把 decision 纳入现有 staging transaction，并增加 failpoint rollback 测试。
- 风险：恢复 durable child 时丢失父级解释上下文。
  - 缓解：以 tree closure 为测试对象，明确最小上下文闭包。
- 风险：dogfood 覆盖不可恢复的历史 Markdown。
  - 缓解：先备份和 manifest，Markdown-only 使用保真原文/provenance 转换。

## 12. 决策摘要

完整决策记录见 `decisions.xnl`。关键结论：

- durable registry 使用完整 XNL AST，不再使用 Markdown 摘要作为真源。
- 根 `decisions.xnl` 与递归 `decisions/**/*.xnl` 同时参与。
- identity 是 stable decision id；重复 id 走节点级 merge/conflict。
- 历史迁移优先从 archive 恢复完整 XNL，无法恢复时才做保真 Markdown conversion。
- implementation 使用 manual commit；最终 phase 执行 verify-round GapLoop 与 coding AttractorCheck。

