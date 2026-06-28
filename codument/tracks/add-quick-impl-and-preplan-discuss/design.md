# Design

## 产品尺度

Codument 的任务入口按尺度分为四类：

| 尺度 | Operation / Skill | 管理对象 | 作用 |
|---|---|---|---|
| 小改动 | `impl-quick` / `codument-impl-quick` | 无 | 读取 Codument 上下文后直接实现小变更 |
| 前置澄清 | `discuss` / `codument-discuss` | 对话 + 临时 `codument/analysis/` | 创建 track/mission 前与用户讨论并分流 |
| 中期任务 | `plan-track` / `impl-track` | track | 明确功能/行为/架构变更 |
| 长期任务 | `plan-mission` / `impl-mission` | mission | 跨多个 track 的长期自动化 |

## `impl-quick`

`impl-quick` 是“带 Codument 上下文的直接实现”：

1. 读取 `coding` attractor profile。
2. 读取相关工程文件、测试、behaviors、modeling、engineering、decisions。
3. 判断是否仍适合 quick：
   - 小范围 bug、测试、局部重构、配置修正：继续。
   - 新能力、行为契约变化、架构变更、多阶段任务：停止并建议 `plan-track` 或 `plan-mission`。
4. 实现代码与测试。
5. 运行最小必要验证。
6. 报告修改内容、验证结果、是否发现需要沉淀的长期知识。

默认不创建 track、不写 proposal、不写 behavior delta。若发现稳定结构知识或工程知识，必须提示是否写入 `codument/modeling` 或 `codument/engineering`，不得静默沉淀。

## `discuss-phase`

当前 `discuss.md` 的 phase 细化能力迁移为 `discuss-phase.md`：

- 输入：已存在 track，可选 phase。
- 输出：细化 `track.xml` 的 TaskSpace/Gate/Acceptance/Schedule 建议，并可实时沉淀稳定知识。
- skill 名称：`codument-discuss-phase`。

## 新 `discuss`

新的 `discuss` 是 pre-plan 人机讨论：

- 不创建 `codument/discussions/`。
- 不创建 discussion workspace。
- 必须与用户进行讨论、提问、确认或澄清，除非用户显式要求 `auto` / 无问答。
- 临时文件只写入 `codument/analysis/`，且只写 findings/knowledge 类证据与临时知识。
- 讨论内容、route、下一步建议和决策主要保留在 AI agent 对话上下文中。
- 每次触发 `codument-discuss` 时先清理旧 `codument/analysis/`。
- 讨论完成、准备创建 track/mission 前，再清理 `codument/analysis/`。

允许写入 `codument/analysis/` 的文件：

- `findings.md`：代码/文档/registry 扫描证据。
- `knowledge.md`：尚未稳定、仅供本轮推理的临时知识草稿。

不得在 `codument/analysis/` 生成 `context.md` / `decision-tree.md` / `recommendation.md` 这类把讨论过程替换成报告的固定产物。

`discuss` 输出必须给出：

- `route: quick | track | mission | blocked`
- route 理由
- 建议下一步命令
- 已读取证据
- 未解决问题

## `.gitignore` 维护

`codument init` 和 `codument upgrade-workspace` 若工作区存在 `.gitignore`，必须确保包含：

```gitignore
codument/**/analysis
codument/**/reports
```

不存在 `.gitignore` 时不强制创建，避免改变无 gitignore 项目的意图。存在但缺失规则时追加规则。

## 测试策略

- skill 覆盖测试应确保新增 operation 都有 skill shell。
- template manifest 测试确保新增模板被部署。
- init/upgrade 测试覆盖 `.gitignore` 规则追加。
- full check 覆盖 TypeScript、lint、bun test。
