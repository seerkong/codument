# Modeling And Engineering E2E

在全新临时 Git 工作区运行当前 Codument CLI，交给 Codex 或 Claude CLI 规划所选任务目录中的应用，验证 Behavior、Modeling、Engineering delta；`MODE=full` 时继续实现代码并生成质量报告。

具体任务：`todo/`、`ecommerce/`、`blog/`。每个目录独立保存 `product.md`、`plan.md`、`implement.md`，runner 不内嵌任务提示词。

```bash
# 不调用真实 agent，依次验证三个任务目录、harness 和 current XNL fixture
bun run test:e2e:smoke

# 真实 Codex，完整规划与实现
AGENT=codex MODE=full bash e2e/modeling-engineering/run.sh ecommerce

# 只让真实 agent 规划和生成 delta
AGENT=codex MODE=plan-only bash e2e/modeling-engineering/run.sh blog

# 重任务拆分为子域运行（ecommerce 拆成 core / payment 两个可独立完成的子域）
AGENT=claude MODE=full PRODUCT_FILE=e2e/modeling-engineering/ecommerce/product-core.md bash e2e/modeling-engineering/run.sh ecommerce
AGENT=claude MODE=full PRODUCT_FILE=e2e/modeling-engineering/ecommerce/product-payment.md bash e2e/modeling-engineering/run.sh ecommerce
```

`PRODUCT_FILE` 覆盖注入的业务需求；对 `ecommerce/` 可选用 `product-core.md`（SKU/购物车/库存/订单生命周期）或 `product-payment.md`（支付/优惠券/金额派生，依赖 core 的 modeling 节点），让单次 agent 会话聚焦一个子域。

默认工作区位于 `/tmp/codument-e2e-<task>-<pid>`，并保留 `_agent-plan.log`、可选 `_agent-impl.log` 与 `reports/code-quality.{json,md}`。可通过 `WS`、`KEEP`、`CODUMENT`、`PRODUCT_FILE`、`AGENT_TIMEOUT` 覆盖运行参数。
