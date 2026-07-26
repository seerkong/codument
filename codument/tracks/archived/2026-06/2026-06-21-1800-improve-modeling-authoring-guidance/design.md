## 上下文
- 依据：E2E dogfood（见 analysis/findings.md）暴露两个 XNL 形式偏差，根因是规范歧义 + 流程缺自检。
- 决策（已定）：component 四块「两者都做」——规范推裸标签为 canonical + validate 宽容接受 role 写法；shell kind 只一种合法写法（标签普通词 + kind 属性）。
- 门控：config/modeling.xml（默认关）。

## 方案概览

1. **validate 宽容（schema.ts）**
   - component 分支：slot 满足条件 = `tags.has(slot)` **或** body 存在 `<types>` 且其 `metadata.role === slot`。
   - 抽 helper `hasIoSlot(node, slot)`；保持其余校验不变。
   - 不影响 entity/enum/state-machine/module 校验。

2. **规范澄清（modeling-node-schema.md + xnl-format.md，src/templates + dogfood）**
   - node-schema §2 kind 谱系表脚注：shell kind 是 `kind` 属性值，元素标签用普通词。
   - node-schema §3 component 行：四块用裸标签 `<runtime>/<input>/<config>/<output>`（canonical）；注明 validate 也接受 `<types role="…">`。
   - node-schema §7 Good/Bad 增：
     - Good `<endpoint kind="backend:endpoint">` / Bad `<backend:endpoint …>`（标签禁含冒号）。
     - Good component 裸四块 / Bad（缺四块或仅 `<types role>` 当唯一表征——其实 accepted，强调 canonical 裸标签）。
   - xnl-format.md「常见错误」补：① 元素标签名禁含冒号（shell kind 用属性）；② component 四块裸标签示例。

3. **流程自检接入（track.md / implement.md，src/templates + dogfood）**
   - track.md §3.3b（生成 modeling_deltas 处）：写完后 `codument modeling validate --deltas <track>`，有 error 则按报告修正再继续（gated）。
   - implement.md：实现期若改 modeling，同样自检（gated）。
   - 纯文字流程指引（非代码）。

4. **回归（verify-modeling-e2e.sh）**
   - 可选：改进后复跑 1 个题目（如 ecommerce，含两类偏差），确认 LLM 写对或 validate 通过。耗时（真实模型），列为可选验证项。
   - 必做：用 /tmp 已生成产物，手动把 component 改裸标签（或依赖 role 兼容）后 `modeling validate` 应 0 error，验证 schema 宽容生效。

## 影响范围与修改点（Impact）
- 改：src/cli/modeling/schema.ts；4 份规范/操作文档 ×2（src/templates + dogfood）= 8 文件。
- 测试：test/cli/modeling/schema.test.ts（role 兼容）+ 可能 validate.test.ts 用例。

## 决策摘要
- 详见 decisions.md。
- 关键：component 两者都做（裸标签 canonical + role 兼容）；shell kind 单一合法写法；自检接入 track/implement；门控不变。

## 风险 / 权衡
- role 兼容可能让作者长期用 role 写法 → 用「accepted-but-discouraged」措辞 + 规范主推裸标签缓解；未来可加 lint 提示（本 track 不做）。
- 流程自检增加一步 → 仅 modeling enabled 时触发，存量无感。

## 待解决问题
- 见 decisions.md。
