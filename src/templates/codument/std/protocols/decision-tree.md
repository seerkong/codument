# Decision Tree Protocol

Decision-tree is the shared planning protocol for `plan-track`, `plan-mission`, and `maintain-track`. It turns unresolved choices into a bounded frontier; it is not a distributed skill and does not require a separate agent invocation.

## Severity

Use `auto`, `light`, `normal`, or `deep` as defined by `questioning.md`. `auto` asks no routine questions: inspect local evidence, choose the conservative default, and record the assumption. Other modes ask only choices that local evidence cannot resolve.

## Storage

- Every new track and mission has a valid root `decisions.xnl` as its single process-decision carrier.
- Use `analysis/decision-tree.xnl` only when a complex frontier needs working memory; it is optional and is not a second decision source.
- Create `decisions/` only for eligible durable legacy records. Create `memory/` only for eligible reusable memory.

## Procedure

1. Read code, tests, owner registries, prior decisions, and the relevant project constraints.
2. Separate resolved facts from choices that block the next irreversible action.
3. Record each unresolved choice in `decisions.xnl` with evidence, recommendation, and status.
4. Ask only the current blocking frontier when the selected severity permits it.
5. Write the accepted result back to the same record, then continue the plan.

The XNL shape and decision record validity rules are defined by `std/spec/xnl-format.md` and validated with `codument decisions validate`.
