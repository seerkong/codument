# Proposal: make-subagent-delegation-autonomous

## Why

Codument currently equates track execution with fresh-subagent execution: every leaf task must be delegated, the parent may not implement, and DAG-ready nodes are described as subagent dispatches. This adds latency and repeated context loading even when a task is small, sequential, or already fully understood by the current AI.

Fresh context remains valuable when independence is part of correctness. GapLoop, AttractorCheck, explicit independent verify, and user-requested audit therefore keep their isolation semantics.

## Goals

- Let the current AI choose `local` or `delegated` execution for ordinary track leaf tasks.
- Keep TaskSpace/Schedule orchestration and objective acceptance checks independent of that execution choice.
- Make the track executor the sole writer of `track.xml`, acceptance state, and commits.
- Preserve mandatory fresh isolation for GapLoop, AttractorCheck, explicit independent verify, and user-requested independent review.
- Remove obsolete built-in AttractorCheck defaults from upgraded workspaces without overwriting unrelated user hooks.
- Build the CLI and dogfood `upgrade-workspace` against this repository.

## Non-Goals

- Changing GapLoop round semantics.
- Removing AttractorCheck or independent verification.
- Adding a persistent `execution-mode` attribute to every task.
- Replacing the runtime's native collaboration or concurrency controls.

## Impact

- Templates: impl-track, workflow, DAG execution, TDD, track spec, and skill shells.
- CLI: legacy action-hook migration during `upgrade-workspace`.
- Tests: template policy and workspace-upgrade regression coverage.

