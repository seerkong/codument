# Modeling + Engineering E2E Design

## 上下文

旧 E2E 只验证 modeling delta 是否能被真实 LLM 生成并通过 `modeling validate`。新增 engineering 后，完整链路要覆盖两类 registry：

- `modeling_deltas/`：结构真源。
- `engineering_deltas/`：工程知识真源。

同时用户希望验证更靠近真实使用：track 创建后，agent 要参考 track 设计与 modeling/engineering 设计完成代码开发，并给出代码质量评价。

## 方案概览

1. **E2E 脚本**
   - `scripts/verify-modeling-engineering-e2e.sh <topic>`
   - 在 `/tmp/cdt-me-e2e-<topic>-<pid>` 创建干净 git 工作区。
   - 运行 `codument init --agent=<agent>`。
   - 开启 `codument/config/modeling.xml` 与 `codument/config/engineering.xml`。
   - 写入 `codument/attractors/product.md`。
   - 调用真实 `codex exec` 或 `claude -p` 创建 track，要求生成 `modeling_deltas` 和 `engineering_deltas`。
   - 运行 `codument validate <track> --strict`、`codument modeling validate --deltas <track>`、`codument engineering validate --deltas <track>`。
   - full 模式继续调用真实 agent，要求根据 track + deltas 实现代码。
   - 运行质量评分脚本输出 `reports/code-quality.{json,md}`。

2. **模式**
   - `MODE=full`：默认完整链路。
   - `MODE=plan-only`：只验证 track + deltas，保留旧 modeling E2E 的能力。
   - `TOPIC=todo|ecommerce|blog|custom`。

3. **质量评分脚本**
   - `scripts/score-e2e-code-quality.ts <workspace> [--track <id>] [--out <dir>]`
   - 收集命令证据：package scripts、test/typecheck/lint/build、codument validate、modeling/engineering validate。
   - 分维度评分：runnable、tests、architecture、codument alignment、maintainability、safety。
   - 输出 JSON 和 Markdown，保留证据与扣分理由。

4. **Skill**
   - `codument-modeling-engineering-e2e`：告诉 agent 如何运行真实 E2E、如何解读结果、如何避免污染当前仓库。
   - `codument-code-quality-score`：告诉 agent 如何做代码质量评分，优先使用评分脚本，再补人工审查。

## 影响范围与修改点（Impact）

- `scripts/verify-modeling-engineering-e2e.sh`
- `scripts/verify-modeling-e2e.sh`
- `scripts/score-e2e-code-quality.ts`
- `src/templates/skills/**`
- `test/scripts/**`
- `src/templates/manifest.ts`

## 决策摘要

- 不把真实 LLM E2E 放入 `bun test`，避免 CI/本地常规测试不可控。
- 旧 modeling-only 脚本保留，但委托新脚本 `MODE=plan-only ENGINEERING=0`。
- 评分脚本确定性执行，skill 负责在此基础上做人工/agent 评价。

## 风险 / 权衡

- 真实 LLM E2E 耗时且可能受模型状态影响。缓解：脚本保留工作区、日志和报告，方便复核。
- 不同 agent 生成的项目技术栈不同。缓解：评分脚本从 package scripts 和文件结构自适应，不假设固定栈。
- 质量评分可能误判。缓解：输出证据、扣分理由和人工复核项，不只给单一分数。

## 待解决问题

- 暂无。
