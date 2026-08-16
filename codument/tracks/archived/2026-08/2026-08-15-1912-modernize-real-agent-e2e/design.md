# Design: modernize-real-agent-e2e

## Harness

`e2e/modeling-engineering/run.sh` 以 `CODUMENT` 选择编译后二进制，缺失时回退到源码 CLI，并以参数选择 `todo`、`ecommerce` 或 `blog` 具体任务目录。初始化后，真实 agent 用 `codument-plan-track` 生成 pending 或 active Track；harness 从两个 lifecycle stage 发现 authority，并按 id 运行统一验证。full mode 再把“已批准”的 Track 交给 `codument-impl-track`。

runner 与 `score.ts` 留在套件根目录；每个具体任务目录独立保存 `product.md`、`plan.md`、`implement.md`，任务提示词不嵌入 Shell 代码。

`SKIP_AGENT=1` 使用当前版本的 Track、BehaviorPatch、modeling 与 engineering XNL fixture，验证 harness 自身而不调用外部模型。

## Scoring

评分器解析 Track 的实际 stage 与 authority，所有 delta 扫描基于该目录。`--codument` 接受可执行二进制或 `.ts` 入口，避免 E2E 声称测试构建产物却实际调用源码。

## Verification

- `bun run test:e2e:smoke`
- `bun test test/scripts/e2e-scripts.test.ts`
- `AGENT=codex MODE=plan-only bash e2e/modeling-engineering/run.sh todo`
- `AGENT=codex MODE=full bash e2e/modeling-engineering/run.sh ecommerce`
