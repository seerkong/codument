# Real E2E request: multi-repository ecommerce ordering

Build a minimal but runnable B2C ordering capability across two independent repositories using Codument's Mission control loop.

## Repositories

The workspace contains two repositories:

- `main-repo`: the integration/orchestration repository.
- `inventory-repo`: the inventory and stock repository.

Treat `main-repo` as the host ProjectRef and `inventory-repo` as an external ProjectRef. Do not persist absolute workspace paths in Mission or Track resources.

## Business requirement

Implement a small ecommerce ordering slice:

- `main-repo` owns the order API and order lifecycle: create an order, reserve inventory, confirm payment, cancel an order, and derive the total from line items.
- `inventory-repo` owns stock quantity and reservation behavior: reserve stock, release a reservation, and reject insufficient stock.
- The integration must expose a deterministic, testable boundary between order and inventory. A simple local HTTP or in-process adapter is acceptable, but facts and ownership must be explicit.
- Include a runnable implementation, tests, and package scripts in both repositories.

## Mission requirement

Use a root Mission in `main-repo`, and create a child Mission in `inventory-repo` for inventory evolution. The root Mission must:

1. use an explicit `MissionLink` to the child Mission;
2. use `completion_mode = "selected-tasks"` and select only leaf child Tasks needed for the current inventory reservation delivery;
3. use a cross-layer `TrackLink` with explicit `project_ref`, `mission_ref`, and `track_ref` for at least one inventory Track;
4. keep the child Mission autonomous and allowed to remain active after the selected delivery is complete;
5. use `codument/.local/workspace-bindings.xnl` and `codument project bind` for the local absolute path mapping;
6. keep the parent/child relationship reciprocal with `ParentMission` and preserve a strict tree (no shared child or cycle).

## Execution protocol

This is a non-interactive real-agent E2E. Read each repository's `AGENTS.md`. Use the installed `.eidolon/skills/codument-plan-mission` and `.eidolon/skills/codument-impl-mission` skills. Follow the Mission control loop autonomously; do not ask the user for confirmation. Create real implementation Tracks and use `codument-impl-track` for code work. Run strict Codument validation and all application tests before finishing.

Do not merely write planning documents or fake receipts. The final workspace must contain runnable code, tests, Mission/Track resources, and verification evidence.
