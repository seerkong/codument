# Fresh Child Capability Model

Gap-loop and similar review loops rely on one invariant:

- Each round must run in a fresh child context.

The exact API differs by target, but the semantics do not. The following are equivalent when they create a brand-new child context for the current round:

- `spawn_agent`
- `task` / fresh task
- delegate worker / child worker
- fresh session / fresh thread
- any other explicit child-agent creation mechanism

## Required Behavior

- If the environment exposes any fresh child mechanism, you must use it for each gap-loop round.
- Do not reuse the previous child context, session, thread, or task ID.
- The parent orchestrator decides whether another round is needed.
- The child for the current round must not silently continue into the next round on its own.

## Fallback Rule

- If the environment cannot create any fresh child context for the required workflow, return `BLOCKED` instead of collapsing the loop into the current top-level context.
