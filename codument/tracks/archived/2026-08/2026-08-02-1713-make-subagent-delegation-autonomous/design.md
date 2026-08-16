# Design

## Execution Policy

For each ordinary leaf task, the track executor chooses one of two transient strategies:

- `local`: execute in the current context. This is the default when context continuity, shared-file ownership, or task size makes delegation wasteful.
- `delegated`: use one or more subagents when work is independently bounded, genuinely parallel, context-heavy, or explicitly requested.

The strategy is runtime judgment, not persisted plan structure. TaskSpace describes work, Schedule describes readiness/dependencies, and Hooks describe mandatory behavior. None of those axes should imply delegation unless the hook protocol explicitly requires independent context.

## Completion Ownership

The track executor owns `track.xml`, acceptance checkmarks, task/group status, findings, and commit decisions. A delegated worker returns code/outputs and evidence; it does not mark the task complete or commit track state. The executor performs objective verification before writeback. For local execution, the same acceptance/test/diff checks apply without inventing a second parent-child review cycle.

## Mandatory Isolation

Fresh context remains mandatory for:

- `cdt:GapLoop` rounds.
- `cdt:AttractorCheck`.
- `codument-verify`, whose declared purpose is independent validation.
- User-requested independent review, audit, or parallel agent work.

## Upgrade Migration

The embedded action-hooks template already omits old command-wide coding checks. `upgrade-workspace` will also remove the exact historical built-in hooks for `discuss:before`, `impl-quick:before`, and `revise-track:before` from existing workspace configuration. Other actions, other hook types, non-coding profiles, and additional hooks remain intact. Empty legacy Action/ Hooks containers are cleaned up.

## Verification

- Template tests assert ordinary impl-track wording is autonomous and mandatory isolation wording remains.
- Upgrade tests assert obsolete built-ins are removed and unrelated custom hooks survive.
- Typecheck, focused tests, full tests, and build pass.
- Dogfood `upgrade-workspace` installs the new standard into this repository.

