# Showcase merge result (CHANGES)

> base + ours (concurrent track) + theirs (this track’s modeling_delta) → merged (archive 3-way apply).

- merged node count: 11
- added: orders.refund_policy
- deleted: orders.pricing
- conflicts: (none — disjoint auto-merge)

What changed vs base:
- `orders.order`        — modified: +couponId field + invariant (theirs)
- `orders.order_status` — modified: +Refunded (theirs)
- `orders.order_lifecycle` — modified: +paid→refunded transition (theirs)
- `orders.refund_policy` — added (theirs)
- `orders.pricing`      — deleted (theirs omits it; ours unchanged → honored)
- `inventory.stock`     — modified: +warehouse field (ours, concurrent) — auto-merged disjointly
