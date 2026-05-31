# codument docs-sync-track - 指定 Track 文档同步命令

**描述：** 将指定 active 或 archived track 的改动同步到 `docs/modeling` 与 `docs/impl`。

---

## 1.0 目标

你是 Codument track 文档同步代理。当前任务是只同步指定 track 实际造成的知识变化。

不要重写整个 docs。不要把与该 track 无关的发现混入本次同步。

本 skill 是普通文档同步流程，不需要 gap-loop 式 fresh child orchestration；只有用户显式要求独立复检时才考虑委派子代理。

---

## 2.0 Track 选择

1. 如果用户提供 track ID，先在 `codument/tracks/` 精确查找。
2. 如果 active track 不存在，再在 `codument/archive/**/<track-id>/` 查找。
3. 如果仍找不到，列出候选并请求澄清。
4. 如果找到多个 archive 候选，优先选择时间最新的，并在报告中说明。

---

## 3.0 必读输入

读取指定 track 中存在的文件：

- `proposal.md` 与 `proposal/`
- `design.md` 与 `design/`
- `spec_deltas/**/*.xml`；旧 track 兼容 `spec.md`
- `plan.xml`
- `decisions.md` 与 `decisions/*.md`
- `reports/*.md`
- archive 中的 `summary.md`

还必须读取：

- 该 track 涉及的源码、测试、配置和 CLI/API 入口
- 现有 `docs/modeling` 与 `docs/impl`
- `codument/attractors/` 和相关 specs

---

## 4.0 同步规则

### 写入 docs/modeling

仅同步 track 引入或改变的：

- capability/requirement 行为
- 领域术语、状态、约束、规则
- 用户可见流程或系统契约
- 重要决策对模型边界的影响

### 写入 docs/impl

仅同步 track 引入或改变的：

- 模块职责和目录结构
- API/CLI/任务入口
- 数据流、配置、持久化
- 测试、验证、迁移和运行方式
- 已知限制或兼容策略

---

## 5.0 执行流程

1. Scope：确认 track ID、active/archive 来源和同步范围。
2. Diff：根据 track 文件和当前代码判断实际变化。
3. Map：把变化分配到 modeling 或 impl docs。
4. Edit：最小化更新相关文档；保留已有用户内容。
5. Report：列出更新文件、未更新原因、待确认项。

如果项目尚无 `docs/modeling` 或 `docs/impl`：

- 不要退化为全量 `docs-bootstrap`。
- 只创建与指定 track 直接相关的小文档，例如 `docs/modeling/<track-topic>.md` 或 `docs/impl/<track-topic>.md`。
- 在报告中说明这是局部 track sync，不代表项目 docs 已完整 bootstrap。

---

## 6.0 约束

- 不要把普通实现细节写入 `docs/modeling`。
- 不要把模型/spec 真源复制成长篇实现文档。
- 如果 track 只有计划没有实际实现，记录“无可同步实现事实”。
- 如果知识同步存在争议，优先写待确认事项而不是断言。
- `codument validate ...` 可能会格式化或补写 track metadata；运行验证后必须检查 `git diff`，并在报告中区分验证副作用和本次 docs sync 修改。
