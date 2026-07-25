# Change: Restructure Track Lifecycle Directories

## Context And Why

Missions already use explicit `pending`, `active`, and `archived` lifecycle
directories. Tracks instead mix active work directly under `tracks/` with
history under a separate `archive/` root. That makes lifecycle state implicit,
complicates command path resolution, and leaves `upgrade-workspace` unable to
normalize the layout safely.

## Goals

- Put every track lifecycle state under `codument/tracks/`.
- Make CLI active operations use `tracks/active/` and archive into
  `tracks/archived/YYYY-MM/`.
- Let `upgrade-workspace` back up and migrate legacy active and archived
  directories without overwriting conflicts.
- Update release templates so newly installed prompts create and consume the
  same layout.

## Non-Goals

- Add a separate CLI command for approving or activating a pending track.
- Rewrite user-owned historical tracks outside an explicit workspace upgrade.

## Impact

- CLI path resolution, archive, validation, show/status, and upgrade-track.
- `codument upgrade-workspace` migration behavior.
- Release templates and E2E helpers.
