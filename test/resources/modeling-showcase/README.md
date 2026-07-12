# modeling-showcase — 一眼看懂 modeling 的节点设计 + delta + apply 效果

不用编译 / 运行 codument，直接读这些文件就能看到：**所有 modeling kind 的 XNL 节点设计**，以及一次 track delta 经**归档 3-way 合并**后落盘的效果。

## 目录

| 目录 | 是什么 |
|---|---|
| `base/` | 当前 registry（订单域，覆盖**所有 kind** 的节点设计） |
| `ours/` | 一个**并发 track 已合并**的状态（`inventory.stock` 加 `warehouse` 字段） |
| `theirs/` | **本 track 的 modeling_delta 目标态**（order+couponId、status+Refunded、lifecycle+refund、新增 refund_policy、删 pricing） |
| `merged/` | 归档 **3-way apply** 的结果（base + ours + theirs）+ `CHANGES.md` |
| `generate.ts` | 用真实 `mergeModeling` 生成 `merged/` 的脚本：`bun run test/resources/modeling-showcase/generate.ts` |

## 覆盖的 kind（在 `base/` 里逐个看）

| kind | 节点 | 文件 |
|---|---|---|
| `entity`/`object` | `orders.order`, `inventory.stock` | domain/orders/index.xnl, domain/inventory/index.xnl |
| `enum` | `orders.order_status` | domain/orders/index.xnl |
| `state-machine` | `orders.order_lifecycle` | domain/orders/index.xnl |
| `policy` | `orders.pricing` | domain/orders/index.xnl |
| `module`/`capsule` | `orders.orders_module` | domain/orders/module.xnl |
| `component` | `orders.place_order` | domain/orders/module.xnl |
| `actor` | `inventory.inventory` | domain/inventory/index.xnl |
| `port` | `orders.create_order_port` | backend/orders/ports.xnl |
| `backend:endpoint`（shell 命名空间 kind） | `orders.create_order_endpoint` | backend/orders/ports.xnl |
| `surface:route`（shell 命名空间 kind） | `orders.checkout_route` | surface/orders/routes.xnl |

## 表征形式（XNL TextElement，零转义）

`prose`（语义）· `ts`（TypeScript 类型/枚举/组件 IO）· `mermaid`（状态机 / actor 消息流）· `pseudo kind="ctrl|rule"`（控制流 / datalog 规则）· `fact-source`（事实源）。
结构属性：`fact_grade` / `single_writer`（事实源）· `depends_on` / `capsule-tree`（模块依赖+capsule 目录树）· `runtime`/`input`/`config`/`output`（组件 IO）。
跨文档引用用 **VFS URI**（`modeling://…` / `behavior://…`），见 `single_writer`、`depends_on`、policy 的 `behaviors`。

## 怎么看 delta 的效果

1. `diff base/ theirs/` = **本 track 改了什么**（order+couponId、+Refunded、+refund transition、+refund_policy、−pricing）。
2. `ours/` 里 stock 多了 `warehouse` = **另一个并发 track** 的改动。
3. `merged/CHANGES.md` + `merged/**.xnl` = **归档后落盘的最终效果**：两边 disjoint 自动合并、**0 冲突**；pricing 因 theirs 删除且 ours 未动而被尊重删除。

`merged/` 由 `generate.ts` 用真实合并引擎生成，并由 `test/cli/modeling/showcase.test.ts` 回归绑定——改了 base/ours/theirs 而不重生成，测试会失败。
