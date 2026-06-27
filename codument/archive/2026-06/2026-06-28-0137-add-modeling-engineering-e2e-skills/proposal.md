# 变更：新增 modeling + engineering 真实 LLM E2E 与评分 skill

## 背景和动机 (Context And Why)

之前 modeling 能力通过 todo/ecommerce/blog 三个真实业务题目做过 E2E dogfood：在 `/tmp` 干净工作区初始化 codument、开启 modeling、让真实 codex 生成 track 和 `modeling_deltas`，再用 validate 找出 XNL 形式偏差。现在 codument 新增了 `codument/engineering/`，需要把 E2E 升级成同时验证 modeling + engineering，并继续走真实大模型闭环。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**
- 新增可复跑脚本：初始化项目、开启 modeling + engineering、创建 track、生成两类 deltas、实现代码、运行验证和质量评分。
- 保留 todo/ecommerce/blog 三业务题目，并支持自定义 PRODUCT/PROMPT。
- 新增代码质量评分辅助脚本，输出 JSON + Markdown 报告。
- 在 `src/templates/skills/` 新增两个 skill：
  - 运行 modeling+engineering E2E。
  - 对生成代码做质量评分和评价。
- 添加不调用真实大模型的自动化测试，保障脚本/skill/manifest 不漂移。

**非目标:**
- 不在普通 `bun test` 中调用真实 codex/claude。
- 不固定业务实现技术栈，E2E 允许大模型选择合适栈，但要求其留下可运行验证命令。
- 不把质量评分作为绝对事实；评分必须带证据和人工可复核项。

## 变更内容（What Changes）

- 新增 `scripts/verify-modeling-engineering-e2e.sh`。
- 新增 `scripts/score-e2e-code-quality.ts`。
- 更新 `scripts/verify-modeling-e2e.sh` 为兼容入口。
- 新增 `src/templates/skills/codument-modeling-engineering-e2e/SKILL.md`。
- 新增 `src/templates/skills/codument-code-quality-score/SKILL.md`。
- 更新 `src/templates/skills/README.md` 和 `src/templates/manifest.ts`。
- 新增脚本与 skill 结构测试。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`codument-core`
- 受影响的代码：`scripts/`、`src/templates/skills/`、`src/templates/manifest.ts`、`test/`
