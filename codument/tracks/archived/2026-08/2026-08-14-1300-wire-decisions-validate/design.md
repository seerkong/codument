# 设计：decisions.xnl 校验接入 track validate + XNL 闭合规范锚点

## 1. 修复原则

沿用 `fix-spec-validator-conflicts` 确立的原则：**确定性逻辑一律走 CLI，不堆提示词**。本次修复把"decisions.xnl 语法校验"从独立命令/归档 gate 下沉到 `codument validate` 的 track 校验面——plan-track 收尾的 best-effort validate（`codument validate <id>`）无需改动提示词即可覆盖 decisions，创建即拦截。

## 2. 根因链回顾

1. XNL 文本块闭合 `</?>` 与 XML 对称闭合习惯冲突 → 长文件生成时漂移（14 处 `</description>`）。
2. `codument validate` 不覆盖 decisions.xnl → 创建时不拦截，归档 gate 才暴露。

## 3. 修复设计

### 3.1 CLI 接线（T1.1）

`src/cli/commands/validate.ts` `validateCommand` 的 track 循环内新增：

- 目标路径解析：`<trackDir>/decisions.xnl`（单文件）或 `<trackDir>/decisions/`（递归 source set，目录存在时优先按 source set 校验，与 `codument decisions validate` 的 resolveTarget 语义一致）。
- 复用 `validateDecisionsFile`（`src/cli/commands/decisions.ts` 导出），零重复实现。
- 输出映射：`DecisionFinding { file, severity, decision, message, layer? }` → `ValidationError { file, message, severity, rule? }`（rule 取 `decision.${layer ?? 'syntax'}` 或省略；message 已含 decision id）。
- `--json`：合并进 `allFindings` 数组（保持既有 schema）。
- 不存在 `decisions.xnl` / `decisions/` 时**跳过**（不误报，兼容旧 track）。
- 循环依赖检查：decisions.ts 不 import validate.ts → 无环。

### 3.2 错误提示增强（T1.2）

`decisions.ts` 的 XNL 解析失败路径（`validateXnlDecisionsFile` 的 `parseXnl` try/catch 或 `readXnlDecisionRecords` 的抛错分支）在消息后追加：

```
XNL 文本块闭合应为 </?>`（如 <description ?>…</?>），检查是否误写为 </tagname>（XML 风格闭合）
```

（实际文本用 `</?>` 字面，避免与 XML 注释冲突时转义 `&lt;/?&gt;`。）

### 3.3 规范反例（T2.1）

`xnl-format.md` 文本块规则（§核心语法速览 L11 附近）补充：

```
❌ 错误：<description ?>…</description>（XML 风格对称闭合，XNL 解析器不识别）
✅ 正确：<description ?>…</?>
```

### 3.4 防回归测试（T2.2）

`test/cli/commands/validate.test.ts` 新增：

1. track 含语法错误 decisions.xnl（`<decision ... ( <question ?>q</description> )>` 之类混用闭合）→ `codument validate` exit 1，输出含闭合提示。
2. track 含合法 decisions.xnl → validate 通过（exit 0）。
3. track 无 decisions.xnl → validate 通过（不误报）。

## 4. 验证路径

1. `bun run check` 全绿。
2. 实测：`codument validate <track-id>`（含合法/非法/缺失 decisions 三种情况）。
3. 模板同步：`xnl-format.md` 副本 hash 一致。

## 5. 风险与兼容

| 风险 | 缓解 |
|---|---|
| 既有 track 的 decisions.xnl 存在历史语法问题 → validate 从 pass 变 fail | 这正是期望行为（创建/维护时暴露而非归档时）；错误消息可操作；受影响 track 可单独 `codument decisions validate` 修复 |
| 输出格式破坏现有消费方 | findings 沿用标准格式（severity/message/file），仅新增条目；`--json` schema 不变 |
| decisions.ts import 循环 | 已确认无环 |
