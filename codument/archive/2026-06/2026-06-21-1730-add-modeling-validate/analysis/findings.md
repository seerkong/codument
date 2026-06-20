# Findings

## Found Facts
- 当前 modeling 校验是**隐式**的：`loadModelingRegistry`→`parseXnl(content,{textBlockStyle:true})`（[src/cli/modeling/registry.ts:91](../../../../src/cli/modeling/registry.ts)），语法错抛 `XnlParseError` 冒泡，无友好报告。
- `modeling lint`（[src/cli/modeling/lint.ts](../../../../src/cli/modeling/lint.ts)）只做分形拆分阈值（行数 >400 / 顶层节点 >8），不是语法/语义校验；它顺带经 loadModelingRegistry 触发 parse。
- `validateModelingNode`（[src/cli/modeling/schema.ts](../../../../src/cli/modeling/schema.ts)）做**单节点**语义校验：kind 谱系、最小必备表征、fact_grade 枚举、命名空间 id。
- `modelingUri(relFile,id)`（registry.ts:57）从**文件路径**取 plane/context、从 **id** 取 name，**不校验 id 命名空间是否与路径 plane/context 一致** —— 例如 `domain/orders/index.xnl` 里放 `#inventory.stock` 不会报错（URI 错误地变成 `modeling://domain/orders/stock`）。这是层级规范缺口的核心。
- `loadModelingRegistry` 已检测**重复 id**（registry.ts:97 抛错）。
- xnl-core 有 for-AI 语法指南 `packages/core/doc/ai-guide/XnlDataFormatForAi.md`（256 行：核心语法/EBNF/类型/示例/生成检查清单/常见错误），但 npm 包只发 `dist/`，doc/ 不在包内 → 要"复用"必须 vendor 一份进 codument。
- codument 当前对 XNL 语法的介绍是 modeling-node-schema.md §3 的"按例学样"小表，无完整语法规范。

## Constraints
- 门控于 `config/modeling.xml`（默认关），与既有 modeling 能力一致。
- 复用既有 `parseXnl` / `validateModelingNode` / `loadModelingRegistry`，不另造解析或单节点校验。
- 校验须覆盖两类文件：registry `codument/modeling/<plane>/<context>/*.xnl` 与 track `modeling_deltas/<plane>/<context>.xnl`。

## Open Questions
- 见 decisions.md（命令名、id↔路径对齐严格度、引用解析范围、未知 plane 严重度）。

## Conclusions
- 新增 `codument modeling validate`：三层（XNL 语法 + 节点 schema 语义 + 层级/引用一致性），友好报告（file/line/reason）。
- vendor `XnlDataFormatForAi.md` → `std/spec/xnl-format.md`，modeling 规范引用之。

## Gap-loop（P4 phase:after）
- Round 1 → FIX_APPLIED：发现 src/templates/manifest.ts stale，漏 6 个模板（modeling.xml + modeling-{registry,node-schema,delta}.md + xnl-format.md）→ 部署层 guide-present/modeling-specs-reference 失效。修复：重生成 manifest（68 条目，含全部 modeling/xnl 模板）。复测 typecheck 0 + 114 pass。
- 子代理另 flag 后续任务（manifest staleness guard 测试缺失，out-of-scope）。
- Round 2 → 复检中（FIX_APPLIED 后强制再验证一轮）。
