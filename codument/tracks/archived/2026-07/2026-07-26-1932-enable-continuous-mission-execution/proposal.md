# Enable Continuous Mission Execution

## Background

`codument-impl-mission` 曾描述 mission work 为 bounded action per turn。第一轮改造已移除启动和单条 track 后的默认停手点，但把每次成功动作后完整 `observe -> reconcile` 写成硬规则，导致连续执行可能产生不必要的重复观察。

## Goals

- Make implementing a mission continuous by default: pending missions activate and immediately begin execution.
- 让每个 mission action 使用与其影响相称的完成判定，而不新增统一的回执文件或数据格式。
- 完成判定通过且未发现计划失效信号时，直接继续下一个 planned ready action。
- 仅在完成判定不确定或发现前提、依赖、范围、目标偏差时，观察受影响范围并进入 reconcile。
- Pause only for a required pending decision confirmation, a real blocked condition, a terminal mission state, or the explicit ten-track invocation checkpoint.
- Replace mission-specific bounded-action wording with a continuous execution model.
- Limit one uninterrupted invocation to ten completed track lifecycles while leaving the mission active and resumable.

## Non-Goals

- Do not remove bounded terminology from the decision-tree protocol or GapLoop, where it describes different mechanisms.
- Do not add a daemon, background worker, or a general max-actions limit.
- Do not introduce an action-receipt artifact, XNL receipt schema, or any other per-action serialization requirement.
- Do not change track-level execution or archive semantics.

## Acceptance

- `codument-impl-mission <id>` never treats activation as a start-only endpoint.
- A successful ready action verifies its own completion before proceeding.
- A confirmed action without an invalidation signal continues directly to the next planned ready action, without a mandatory full observation/reconciliation pass.
- Uncertain verification or an invalidation signal causes a scoped observation and reconciliation before planning continues.
- A non-auto mission asks and pauses only when its decision frontier contains a confirmation-required decision.
- Normal execution stops only at `completed`, `blocked`, `cancelled`, `superseded`, or after ten completed tracks in one invocation.
- Templates, dogfood files, behavior contract, and regression tests agree on the same semantics.
