# Design: e2e-task-split

## Problem

当前 `e2e/modeling-engineering/ecommerce/product.md` 把所有需求放在一个文件中：

> 实现一个 B2C 下单子系统，支持商品 SKU、购物车、库存预留与扣减、订单生命周期、支付、优惠券和金额派生。

Agent 尝试一次性生成所有 modeling/engineering delta，导致：
- planning 产物 26 个文件，单次会话上下文耗尽
- 实现阶段无法完成（实际只完成 ~30%）
- score 59/100 (F)

## Solution

将 ecommerce 拆分为两个独立 track，每个 track 有独立的 product.md：

### ecommerce-core

`e2e/modeling-engineering/ecommerce/product-core.md`：

```markdown
# Product: 电商核心域

实现 B2C 下单系统的核心域：商品 SKU 管理、购物车、库存预留与扣减、订单生命周期状态机。

交付形态包含后端 REST API。系统需要明确订单与库存的事实源、状态机迁移和跨边界消息。
```

Behavior capabilities：catalog, cart, inventory, order
Modeling planes：domain（SKU, cart, inventory, order）, backend（API 端点）, surface（路由）
Engineering categories：howto, rules, reference, code-map

### ecommerce-payment

`e2e/modeling-engineering/ecommerce/product-payment.md`：

```markdown
# Product: 电商支付域

实现 B2C 下单系统的支付域：支付流程、优惠券系统、金额派生规则。

前提：ecommerce-core track 已完成。本 track 的 modeling delta 通过 derived_from 引用 core 域的节点。
```

Behavior capabilities：payment, coupon, pricing
Modeling planes：domain（payment, coupon, pricing）, backend（支付 API）
Engineering categories：howto, rules, reference

### Runner 适配

`run.sh` 支持 `--max-capabilities N` 参数（可选，不改变默认行为）：

```bash
# 默认：完整 ecommerce（原有行为）
bash e2e/modeling-engineering/run.sh ecommerce

# 拆分模式：只处理前 4 个 capabilities（core 域）
bash e2e/modeling-engineering/run.sh ecommerce --max-capabilities 4

# 继续处理剩余 capabilities（payment 域）
bash e2e/modeling-engineering/run.sh ecommerce --max-capabilities 4 --offset 4
```

实际实现中，更简单的方式是新增 product-core.md 和 product-payment.md，让用户显式选择运行哪个子集。

## Acceptance

- [x] `ecommerce-core` track 在单次 claude 会话内完成（score >= 80）
- [x] `ecommerce-payment` track 在单次 claude 会话内完成（score >= 80）
- [x] 两个 track 的 modeling delta 通过 `derived_from` 正确关联
- [x] 原有 `run.sh ecommerce` 命令仍可运行完整 ecommerce（product.md）
