# 变更：改进 modeling 创作引导（修复 E2E 暴露的两个系统性 XNL 形式偏差）

## 背景和动机 (Context And Why)

用 `scripts/verify-modeling-e2e.sh` 让真实大模型（codex gpt-5.5）在干净工作区跑 codument-track 生成 modeling_deltas（todo / ecommerce / blog 三题目），`modeling validate` 抓到两个**系统性**偏差：

1. **component 四块标签（3/3 全犯）**：`runtime/input/config/output` 都写成 `<types role="runtime">` 而非裸标签 `<runtime>` 等 → 每个 component 报 4 个 schema error。
2. **shell kind 标签名摇摆（1/3）**：ecommerce 写 `<backend:endpoint … kind="backend:endpoint">`（标签名含冒号 → XNL 语法错），todo/blog 写对 `<endpoint kind="backend:endpoint">`。

建模**概念质量很高**（事实源/单写者/状态机/capsule-tree/引用都对），偏差只在 XNL 形式，根因是**规范表达歧义**。此外 codex 没跑 `modeling validate`（只跑 track 结构校验），所以这些缺陷它没自检出来。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**
- 规范澄清（`modeling-node-schema.md` / `xnl-format.md`）：component 四块用裸标签；shell kind 节点用「普通标签 + kind 属性」（标签名禁含冒号）。各加 Good/Bad 例。
- validate 宽容兼容：`schema.ts` 的 component 检查也接受 `<types role="runtime">` 等 role 写法（过渡兼容；裸标签仍为 canonical）。
- 流程自检接入：track / implement 生成 modeling_deltas 后跑 `modeling validate --deltas` 并修正（gated on modeling enabled）。
- 回归：用 `verify-modeling-e2e.sh` 复跑确认改进后不再系统性犯错。

**非目标:**
- 不放宽「shell kind 标签名含冒号」（XNL 硬语法限制，必须走普通标签）。
- 不改 modeling 默认开关（仍默认关）。
- 不重写 validate 引擎（只在 schema 层加 role 等价识别）。

## 变更内容（What Changes）

- `src/cli/modeling/schema.ts`：component 分支额外接受 body 中 `<types role="<slot>">` 满足 runtime/input/config/output。
- `src/templates/codument/std/spec/modeling-node-schema.md`：§3 表征/component 行 + 新 Good/Bad（component 裸标签、shell kind 标签形式）。
- `src/templates/codument/std/spec/xnl-format.md`：补「shell kind 节点 = 普通标签 + kind 属性，标签名禁含冒号」+ component 四块裸标签，并入常见错误。
- `src/templates/codument/std/operations/track.md` + `implement.md`：生成 modeling_deltas 后 `modeling validate --deltas` 自检步骤（gated）。
- behavior：`codument-core` 新增 `modeling-authoring-form`。
- （dogfood 副本同步 codument/std/...）。

## 影响范围（Impact）

- 受影响能力：`codument-core`（+modeling-authoring-form）。
- 受影响代码：`src/cli/modeling/schema.ts`。
- 受影响文档：modeling-node-schema.md / xnl-format.md / track.md / implement.md（src/templates + dogfood）。
- 测试：schema role 兼容用例 + bad/good fixtures；E2E 回归（手动/可选）。
