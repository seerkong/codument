# Knowledge Context

## Source Notes
| Source | Summary | Relevance |
|--------|---------|-----------|
| scripts/verify-modeling-e2e.sh | E2E：init→开 modeling→codex/claude exec 生成→modeling validate 判定 | 回归手段 |
| /tmp/cdt-e2e-{todo,ecommerce,blog} | 三题目真实生成产物 + _agent.log | 偏差证据；可改裸标签后验证 |
| src/cli/modeling/schema.ts | component 检查 tags.has('runtime'/'input'/'config'/'output') | 宽容兼容 role 写法在此改 |
| src/templates/codument/std/spec/modeling-node-schema.md | §2.1 capsule-tree、§3 表征、kind 谱系表 | 规范澄清落点 |
| src/templates/codument/std/spec/xnl-format.md | vendored XNL 语法权威 | 加 shell-kind/component 写法说明 |
| std/operations/track.md, implement.md | 生成 modeling_deltas 的流程 | 接入 modeling validate 自检 |

## Codebase Knowledge
- schema.ts component 分支：`for (slot of ['runtime','input','config','output']) req(tags.has(slot), ...)`。宽容＝额外接受 body 中存在 `<types role="<slot>">` 的子节点。
- shell kind 判定：kind 含 ':' → isShell。元素标签(node.tag)与 kind 无关；XNL 解析标签名遇 ':' 报 Expected metadata key。
- modeling validate 命令：`codument modeling validate --deltas <track>`（已实现于 add-modeling-validate track）。

## Domain Knowledge
- canonical（规范推荐）vs accepted（validate 宽容）：component 四块 canonical=裸标签，accepted 也含 role 写法；shell kind 只有一种合法（标签普通词+kind 属性，因标签禁含冒号）。
- 「作者引导」三层：规范文字 + Good/Bad 例（让 LLM 写对）、validate 宽容（少误报）、流程自检（生成后即抓 + 修）。

## Terms
| Term | Meaning |
|------|---------|
| 裸标签 IO | `<runtime>…</runtime>` 等四块，元素标签即角色 |
| role 写法 | `<types role="runtime">…` 用 types 标签 + role 属性表角色 |
| shell kind 节点 | kind 含命名空间冒号（backend:endpoint）的节点；标签名仍须普通词 |
