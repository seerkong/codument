# 变更：modeling 显式校验（语法 + 语义 + 层级一致性）与 XNL for-AI 指南复用

## 背景和动机 (Context And Why)

当前 codument 的 modeling 校验是**隐式且割裂**的：

- XNL 语法只在 `loadModelingRegistry`→`parseXnl` 时隐式触发，出错抛 `XnlParseError` 冒泡，没有面向作者的 file/line/reason 报告。
- `modeling lint` 只查分形拆分阈值（行数/节点数），不是语法/语义校验。
- `validateModelingNode` 只校验**单节点**语义（kind/最小表征/fact_grade/id），不校验跨节点/跨文件的**层级规范**。
- 最关键的缺口：节点 id 的命名空间与其文件路径 `<plane>/<context>` **没有任何一致性校验**——`domain/orders/index.xnl` 里放 `#inventory.stock` 不会报错，`modelingUri` 还会算出错误的 `modeling://domain/orders/stock`。

同时，「如何写合法 XNL」缺少权威说明：codument 只有"按例学样"的小表，而 xnl-core 其实有一份 256 行的 for-AI 语法指南 `XnlDataFormatForAi.md`（核心语法/EBNF/生成检查清单/常见错误），但因 npm 只发 `dist/` 而未被 codument 复用。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**
- 新增 `codument modeling validate`：三层校验——(1) XNL 语法（parseXnl，友好报告）；(2) 节点 schema 语义（复用 `validateModelingNode`）；(3) 层级/引用一致性（id 命名空间 ↔ 路径 plane/context、plane 合法性、`modeling://` 引用可解析、id 全局唯一）。
- 覆盖两类文件：registry `codument/modeling/<plane>/<context>/*.xnl` 与 track `modeling_deltas/<plane>/<context>.xnl`。
- vendor `XnlDataFormatForAi.md` → `std/spec/xnl-format.md`（带 provenance），modeling 规范引用它。
- 门控于 `config/modeling.xml`（默认关）。

**非目标:**
- 不替换/重写 `parseXnl`、`validateModelingNode`、`lint`（复用，不重造）。
- 不实现自动修复（validate 只判定 + 报告，issues-first；修复另说）。
- 不强制校验 `behavior://` 引用的存在性（仅语法检查；避免对 behaviors registry 的硬依赖）。
- 不改动 modeling 默认开关（仍默认关）。

## 变更内容（What Changes）

- 新增 `src/cli/modeling/validate.ts`：编排三层校验，产出结构化 findings（file/line/reason/severity）。
- 层级校验新逻辑：id 命名空间段 vs 文件路径 (plane, context) 对齐；plane 合法性；`modeling://` 引用按 registry index 解析；重复 id 转为 finding（不再抛）。
- `src/cli/commands/modeling.ts` 增 `validate` 子命令（registry 模式 + `--deltas <track>` 模式），友好分组输出 + 非零计数。
- vendor `std/spec/xnl-format.md`（源自 xnl-core `doc/ai-guide/XnlDataFormatForAi.md`），三份 modeling 规范加引用。
- behavior：`codument-core` 新增 `modeling-validate`、`xnl-format-guide` 两条需求。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`codument-core`（+modeling-validate, +xnl-format-guide）。
- 受影响的代码：`src/cli/modeling/validate.ts`（新）、`src/cli/commands/modeling.ts`（+子命令）、`src/cli/modeling/registry.ts`（可能抽出 id 命名空间解析 helper）、`src/cli/index.ts`（help 文案）。
- 受影响的文档：`std/spec/xnl-format.md`（新 vendored）、`modeling-registry/node-schema/delta.md`（加引用）。
- 测试：新增 bad-case fixtures（语法错/缺表征/id 错位/悬空引用/重复 id/delta 错位）+ validate 单测。
