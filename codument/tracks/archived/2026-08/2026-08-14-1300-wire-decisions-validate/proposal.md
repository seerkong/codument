# 变更：把 decisions.xnl 校验接入 track 创建时 validate，固化 XNL 文本块闭合规范

## 背景和动机 (Context And Why)

对已归档 track `fix-spec-validator-conflicts` 的归档复盘发现：生成的 `decisions.xnl` 有 **14 处**把 XNL 文本块闭合 `</?>` 误写成 XML 风格 `</description>`/`</tradeoff>`，直到**归档 gate** 才被 `Invalid decisions.xnl before archive` 拦截。

根因（两层）：

1. **生成侧认知漂移**：XNL 文本块闭合 `</?>` 与打开标签名不对称，与 XML 对称闭合习惯（`<description>...</description>`）高度相似；写长 decisions.xnl 到中后段时，生成习惯回归 XML 模式。全仓库规范/模板/示例（xnl-format.md、plan-track.md §3.5、decision-tree.md、真实文件）均正确使用 `</?>`，规范本身一致——问题不在规范示例，而在生成锚点与校验时机。
2. **流程缺口（主因）**：plan-track.md §3.8 收尾的 best-effort validate 只跑 `codument validate <id> --strict`，而 `codument validate` **不覆盖 decisions.xnl**（decisions 是独立命令 `codument decisions validate`）。于是 ★必有 产物 decisions.xnl 的语法错误在创建时不被拦截，直到归档 gate 才暴露。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**
- `codument validate <track-id>` 顺带校验该 track 的 `decisions.xnl`（含 `decisions/**` 递归 source set），让 plan-track 收尾的 validate 自动覆盖 decisions——创建即拦截，不等到归档 gate。
- decisions validate 的 XNL 语法错误消息追加可操作提示（闭合应为 `</?>`，检查是否误写为 `</tagname>`）。
- xnl-format.md 文本块规则补充显式反例（bad example），给生成侧明确锚点。
- 防回归测试：语法错误 → validate 失败；合法 → 通过；无 decisions.xnl → 不误报。
- Dogfood：`bun run check` 全绿；模板副本同步。

**非目标:**
- 不改变 XNL 语法本身（不碰 xnl-core parser）。
- 不改 plan-track.md 提示词（接线后 `codument validate` 自然覆盖 decisions，符合"确定性逻辑走 CLI、不堆提示词"原则）。
- 不迁移历史 archive 内容。

## 变更内容（What Changes）

- CLI：
  - `src/cli/commands/validate.ts`：validateCommand 的 track 循环内复用 `validateDecisionsFile` 校验 `decisions.xnl` / `decisions/` source set；findings 并入统一输出（human + `--json`）。
  - `src/cli/commands/decisions.ts`：XNL 解析失败（parseXnl 抛错）路径的错误消息追加 `</?>` 闭合提示。
- 规范：
  - `codument/std/spec/xnl-format.md`（+模板副本）：文本块规则补显式反例。
- 测试：
  - `test/cli/commands/validate.test.ts`：3 个新断言（错误 / 合法 / 缺失不误报）。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`codument-core`
- 受影响的代码/文档：
  - `src/cli/commands/{validate,decisions}.ts`
  - `codument/std/spec/xnl-format.md`、`src/templates/codument/std/spec/xnl-format.md`
  - `test/cli/commands/validate.test.ts`
- 兼容性：无 decisions.xnl 的旧 track 不受影响（跳过）；decisions 校验结果并入 validate 输出后，既有 `codument validate` 输出格式向后兼容（追加的 finding 以标准格式呈现）；decisions.ts 的 `--json` 输出结构不变。
