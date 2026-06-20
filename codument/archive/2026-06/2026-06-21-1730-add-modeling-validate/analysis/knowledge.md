# Knowledge Context

## Source Notes
| Source | Summary | Relevance |
|--------|---------|-----------|
| src/cli/modeling/registry.ts | loadModelingRegistry / modelingUri / readNodeId / nodeName；path↔id 映射 | 层级校验复用其加载与 index |
| src/cli/modeling/schema.ts | validateModelingNode：kind/最小表征/fact_grade/id | schema 层直接复用 |
| src/cli/modeling/lint.ts | 分形拆分阈值检查 | validate 与 lint 并列（或合并 check） |
| src/cli/commands/modeling.ts | modeling 子命令分发（当前仅 lint） | 新增 validate 子命令接线 |
| std/spec/modeling-node-schema.md §5 | id 命名空间：#<context>.<name> 或 #<plane>.<context>.<name> | 层级对齐规则来源 |
| std/spec/modeling-registry.md | 物理形态 <plane>/<context>/*.xnl | plane/context 层级定义 |
| std/spec/modeling-delta.md | modeling_deltas/<plane>/<context>.xnl | delta 文件层级 |
| xnl-core doc/ai-guide/XnlDataFormatForAi.md | for-AI XNL 语法权威（256 行） | vendor 进 std/spec/xnl-format.md |

## Codebase Knowledge
- parseXnl 返回 `{ nodes, warnings }`；语法错抛 `XnlParseError`（含 position）。validate 应 try/catch 转友好报告。
- readNodeId(node) 取 `#id`；nodeName(id)=id.split('.').末段；id 的命名空间段 = 去掉末段的前缀（context 或 plane.context）。
- modelingUri 从文件路径取 plane=segs[0]/context=segs[1]。层级校验 = 比对 id 的命名空间段 vs (plane,context)。

## Domain Knowledge
- 层级规范（语义 definition）：节点 id 命名空间须与文件所在 plane/context 对齐；plane 合法（domain 必备 + 开放 derived）；modeling:// 引用可解析；id 全局唯一。
- 三层校验：语法（parse）→ 单节点 schema（语义）→ 跨节点/路径一致性（层级 + 引用）。

## Terms
| Term | Meaning |
|------|---------|
| plane | modeling 顶层视角目录：domain（canonical）+ derived（backend/surface/...） |
| context | plane 下的 bounded context 目录 |
| 命名空间段 | 节点 id 去掉末段 name 后的前缀（context 或 plane.context） |
| 层级规范 | id 命名空间 ↔ 文件路径 plane/context 的一致性约定 |
