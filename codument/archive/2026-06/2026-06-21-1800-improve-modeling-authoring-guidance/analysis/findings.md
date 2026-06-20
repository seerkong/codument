# Findings

## E2E dogfood（依据）
用 `scripts/verify-modeling-e2e.sh` 让真实大模型 codex(gpt-5.5, high effort) 在干净工作区跑 codument-track，生成 modeling_deltas，再用 `modeling validate --deltas` 机器判定。三题目结果：

| 题目 | track | 规模 | validate |
|---|---|---|---|
| todo | add-todo-app | 3 entity·1 sm·1 module·9 endpoint·3 route | 4 error |
| ecommerce | add-ecommerce-ordering | 6 entity·4 enum·5 module·10 endpoint·4 route | 6 error |
| blog | add-blog-cms-platform | 5 entity·3 sm·2 module·14 endpoint·6 route | 4 error |

建模**概念质量普遍很高**：fact_grade/single_writer/fact-source、state-machine+mermaid、capsule-tree 到文件级、behavior:// 引用、domain/backend/surface 三 plane 都到位。偏差**只在 XNL 形式**。

## 两个系统性偏差（根因＝规范表达歧义）
1. **component 四块标签 — 3/3 全犯**：runtime/input/config/output 都写成 `<types role="runtime">`（等）而非裸标签 `<runtime>/<input>/<config>/<output>`。schema 只认裸标签 → 每个 component 报 4 个 schema error。
2. **shell kind 标签名摇摆 — 1/3**：ecommerce 写 `<backend:endpoint #... kind="backend:endpoint">`（标签名含冒号 → XNL `Expected metadata key` 语法错）；todo/blog 写对 `<endpoint kind="backend:endpoint">`。规范 kind 谱系表写 `backend:endpoint`，LLM 误以为是标签名。

## 额外洞察
- codex 自跑了 `codument validate`（track 结构 OK）但**没跑 `modeling validate`** → 生成的 modeling 缺陷没自检出来。流程缺自检接入。
- `modeling validate` 三层（syntax+schema）100% 精确抓到——工具有效，问题在「作者引导」与「流程接入」。

## Constraints
- XNL 标签名不能含冒号（硬语法）→ shell kind 必须走「普通标签 + kind 属性」，无法放宽。
- component 四块「role 写法」语义合理 → 可在 validate 宽容接受作过渡兼容（决策：两者都做）。
- 改进门控于 config/modeling.xml（默认关）。

## Conclusions
- ① 规范澄清（component 裸标签 + shell kind 写法 + Good/Bad）；② validate 宽容接受 role 写法；③ modeling validate 接进 track/implement 自检；④ 用 E2E 脚本回归。
- 工作区留存：/tmp/cdt-e2e-{todo,ecommerce,blog}/（KEEP=1）。

## 实现期补充发现（spot-check）
- 真实 LLM 的 component IO 实际有**三种**写法：① 裸标签 `<runtime>`（canonical）② `<types role="runtime">`（role 属性，todo/blog 用）③ `<types ?runtime>`（**marker 名**编码角色，ecommerce 用）。
- 决策：validate 接受 ①②，**不**接受 ③（marker 是免转义 id、不承载语义）。规范 Bad 例已补 marker-名反例。
- 端到端验证：role 兼容生效——todo/blog（role 写法）重跑 validate → 0 error；ecommerce 仍报 component 4（marker-名写法，正确拒绝）+ 2 shell-kind syntax（旧产物标签含冒号）。这些是旧产物的不同偏离，非本 track 回归。

## Gap-loop（P4 phase:after）
- Round 1：fresh 复检中。
- Round 1 → NO_GAP（4 case 实跑满足 + marker 拒绝 + 119 pass）。
- Round 2（首轮怀疑验证轮）→ NO_GAP（独立复跑 6 项 + 边界 modeling 54 tests 全过）。GapLoop 收口。
- Note：dogfood std/spec 仅有 xnl-format.md（无 modeling-node-schema/delta/registry，预存在状态），非本 track scope。
