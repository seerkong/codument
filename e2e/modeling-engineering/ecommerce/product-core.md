# Product: 电商核心域

实现 B2C 下单系统的核心域：商品 SKU 目录、购物车、库存预留与扣减、订单生命周期状态机。

交付形态包含后端 REST API 和异步消息。系统需要明确商品与订单的事实源、库存预留的跨边界消息、订单状态机迁移和失败恢复路径。

范围限定（不包含支付、优惠券、金额派生，它们由 payment 子域单独负责）：
- 商品 SKU：列表、详情、分类筛选
- 购物车：增删改查、行项校验
- 库存：预留、扣减、释放，含 `StockReservationRequested` / `StockReserved` / `StockReservationFailed` / `StockReleaseRequested` 消息
- 订单：创建（从购物车快照）、状态机 `CREATED → PENDING_PAYMENT → PAID → FULFILLING → COMPLETED`（或 CANCELLED）、支付前取消、预留失败取消
