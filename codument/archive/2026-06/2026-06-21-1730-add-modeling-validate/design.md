## 上下文

- 约束：复用 `parseXnl` / `validateModelingNode` / `loadModelingRegistry`，不重造解析与单节点校验。
- 缺口：无显式校验入口、无层级一致性校验、id↔路径无对齐校验、for-AI 语法指南未复用。
- 门控：`config/modeling.xml`（默认关），与既有 modeling 能力一致。

## 方案概览

1. **校验引擎 `src/cli/modeling/validate.ts`** —— 返回 `ValidateFinding[]`
   - `Finding { file, line?, layer: 'syntax'|'schema'|'hierarchy', severity: 'error'|'warning', message }`
   - **Layer 1 语法**：对每个 `.xnl` try `parseXnl(content,{textBlockStyle:true})`；`catch (XnlParseError)` → finding（含 position→line）。
   - **Layer 2 schema**：parse 成功后对每个 DataElement 跑 `validateModelingNode` → findings。
   - **Layer 3 层级/引用**（跨节点，基于一次性加载的 index）：
     - id↔路径对齐：解析 id 命名空间段（去掉末段 name），比对文件路径 (plane=segs[0], context=segs[1])。规则按决策 2。
     - plane 合法性：domain 必存在；未知 derived plane 按决策 4。
     - `modeling://` 引用解析：扫节点 metadata/attribute 值，凡 `modeling://` 前缀（scheme 自识别）→ 查 registry index，缺失=悬空（决策 3）；`behavior://` 仅语法检查。
     - 重复 id：复用/改造 `loadModelingRegistry` 的重复检测为 **finding 而非 throw**（需要一个不抛的加载路径）。
   - 抽出 `idNamespace(id)` helper（registry.ts 或 schema.ts），供对齐校验与 modelingUri 共用。

2. **CLI 子命令**（`src/cli/commands/modeling.ts`）
   - `modeling validate [dir]`：校验 registry（默认 `codument/modeling`）。
   - `modeling validate --deltas <track>`：校验 `tracks/<track>/modeling_deltas/`（同规则，path 层级取 `<plane>/<context>.xnl`）。
   - 输出：按 file 分组、error/warning 计数、issues-first；干净则成功。命令名/合并见决策 1。
   - 门控：`modelingEnabled()` 关则跳过并说明。

3. **vendor XNL for-AI 指南**
   - 拷 `xnl-core` `doc/ai-guide/XnlDataFormatForAi.md` → `src/templates/codument/std/spec/xnl-format.md`，顶部加 provenance（source 路径 + xnl-core 版本 0.1.7）。
   - `modeling-registry.md` / `modeling-node-schema.md` / `modeling-delta.md` 加"XNL 语法权威见 std/spec/xnl-format.md"。
   - 同步 dogfood 副本（codument/std/spec/）。

4. **不抛的加载路径**
   - `loadModelingRegistry` 现遇重复 id/解析错会 throw。validate 需要"收集而非中断"——新增 `loadModelingRegistrySafe`（或给 load 加 `{collect:true}`）返回 `{registry, findings}`，validate 用它；既有调用方不变。

## 影响范围与修改点（Impact）

- 新增：`src/cli/modeling/validate.ts`、`src/templates/codument/std/spec/xnl-format.md`（+ dogfood 副本）。
- 修改：`src/cli/commands/modeling.ts`（+validate 子命令）、`src/cli/modeling/registry.ts`（抽 idNamespace + 不抛加载路径）、`src/cli/index.ts`（help）、三份 modeling 规范（加引用）。
- 测试：`test/cli/modeling/validate.test.ts` + `test/resources/modeling-validate/` bad-case fixtures。

## 决策摘要
- 详见 `decisions.md`。
- 当前建议：validate 与 lint 并列（决策1-A）；id 对齐宽松（决策2-A）；modeling:// 悬空=error、behavior:// 不验存在（决策3-A）；未知 plane=warning（决策4-A）。

## 风险 / 权衡
- 抽 `idNamespace`/不抛加载路径可能触及 registry.ts 既有逻辑 → 用新增函数、保持既有 API 不变来隔离。
- 层级校验误报（合法的省略 plane 前缀场景）→ 决策 2-A 明确"plane 前缀可选"，减少噪音。

## 待解决问题
- 见 decisions.md（4 项，pending）。
