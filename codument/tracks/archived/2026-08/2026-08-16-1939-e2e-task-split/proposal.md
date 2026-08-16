# Track: e2e-task-split

## Context and Why

`e2e/modeling-engineering/ecommerce/` 的 product.md 描述了一个 B2C 下单子系统，包含：

- 商品 SKU、购物车、库存预留与扣减
- 订单生命周期、支付、优惠券
- 金额派生、异步消息
- 前端商城页面

这导致 agent 生成 26 个 planning 产物（7 behavior + 15 modeling + 4 engineering），单次 claude 会话上下文耗尽（实际只完成了 ~30% 实现）。

## Goals

- 将重 e2e 任务拆分为多个 track，每个 track 的产物量在单次 claude 会话可承载范围内
- mission DAG 表达 track 间依赖关系
- runner 支持 `--max-capabilities` 或 `--split` 参数，控制单次 e2e 的产物规模
- 拆分后的 track 独立可验证，不依赖一次性全量完成

## Non-Goals

- 不改变 e2e 的评分标准（score.ts 不变）
- 不拆分 todo/blog 等轻量任务（它们在单次会话内可完成）
- 不改变 modeling/engineering schema

## Implementation

### ecommerce 拆分方案

```
ecommerce-core (track):
  product: 商品 SKU + 购物车 + 库存预留 + 订单生命周期（核心域）
  behavior: catalog/cart/inventory/order (4 capabilities)
  modeling: domain/backend/surface (核心域结构)
  engineering: howto/rules/reference/code-map (核心域工程知识)

ecommerce-payment (track, 依赖 ecommerce-core):
  product: 支付 + 优惠券 + 金额派生
  behavior: payment/coupon/pricing (3 capabilities)
  modeling: domain/backend (支付域结构，derived_from 引用 core)
  engineering: howto/rules/reference (支付域工程知识)
```

### Runner 改造

在 `run.sh` 中新增 `--max-capabilities` 参数（可选）：

```bash
# 默认行为不变（一次性完成所有 capabilities）
bash e2e/modeling-engineering/run.sh ecommerce

# 拆分模式：每次 e2e 只处理前 N 个 capabilities
bash e2e/modeling-engineering/run.sh ecommerce --max-capabilities 4
```

实际拆分通过 product.md 变体实现（不改 run.sh 核心逻辑）：

- `e2e/modeling-engineering/ecommerce/product.md`：原需求（完整）
- `e2e/modeling-engineering/ecommerce/product-core.md`：核心域（SKU + 购物车 + 库存 + 订单生命周期）
- `e2e/modeling-engineering/ecommerce/product-payment.md`：支付域（支付 + 优惠券 + 金额派生）

## Acceptance

- [x] `ecommerce-core` track 在单次 claude 会话内完成（planning < 15 min, 实现完成, score >= 80）
- [x] `ecommerce-payment` track 在单次 claude 会话内完成（planning < 15 min, 实现完成, score >= 80）
- [x] `ecommerce-payment` 的 modeling delta 通过 `derived_from` 引用 `ecommerce-core` 的节点
- [x] 原有 `bash e2e/modeling-engineering/run.sh ecommerce` 命令仍可用（运行完整 ecommerce）
