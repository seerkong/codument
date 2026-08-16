# Product: 电商支付域

实现 B2C 下单系统的支付域：支付流程、优惠券系统、金额派生规则。

前置：电商核心域（ecommerce-core）已完成，商品/购物车/订单/库存的节点已存在于 modeling registry。本子域的 modeling delta 通过 `derived_from` 引用 core 域的订单与购物车节点。

交付形态包含后端 REST API 和异步消息。系统需要明确支付事实源、优惠券使用边界、金额派生规则和失败恢复路径。

范围限定（不重复 core 域的 SKU/购物车/库存/订单创建逻辑）：
- 支付：发起、成功/失败回调，含 `PaymentSucceeded` / `PaymentFailed` 消息，订单在支付成功后推进到 PAID
- 优惠券：定义、校验、使用（固定金额 / 百分比）、每人限用、过期
- 金额派生：购物车 subtotal → 优惠券 discount → total 的确定性规则，作为订单金额快照
