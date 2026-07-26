# Decisions

## Usage
- 记录需用户确认的决策；字母仅用于选项。

### 1. 【P0】component 四块校验策略
- 用户答复：两者都做
- 最终决策：规范推裸标签 `<runtime>/<input>/<config>/<output>` 为 canonical；validate 宽容**也接受** `<types role="runtime">` 等 role 写法（accepted-but-discouraged，过渡兼容）
- 状态：confirmed

### 2. 【P0】shell kind 标签写法
- 背景：ecommerce 写 `<backend:endpoint>`（标签含冒号→XNL 语法错）。
- 最终决策：唯一合法 = 元素标签用普通词（`<endpoint>`/`<route>`）+ `kind="backend:endpoint"` 属性；标签名禁含冒号（XNL 硬限制，不放宽）。规范加 Good/Bad。
- 状态：confirmed

### 3. 【P1】落实范围
- 用户答复：开 track 双管齐下
- 最终决策：① 规范澄清 ② validate 宽容 ③ modeling validate 接进 track/implement 自检 ④ E2E 回归
- 状态：confirmed

### 4. 【过程】提交 + 校验模式
- 沿用上一 track：CommitMode=manual；末 phase cdt:GapLoop（final_phase）；每 phase cdt:AttractorCheck（docs/coding）。
- 状态：默认（review 时可改）
