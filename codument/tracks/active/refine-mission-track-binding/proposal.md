# Refine Mission Track Binding

## Background

Mission support introduced `mission.xml` as a long-running control-plane state source. The current spec allows mission nodes to represent candidate tracks, but the example places `cdt:TrackCandidate` directly under a `TaskGroup`, and `impl-mission` does not clearly require the candidate to be rewritten after a real track is created.

The archive side also says mission archive does not automatically archive tracks, but it does not yet require a precheck that detects bound tracks which are still active or missing.

## Goals

- Replace `cdt:TrackCandidate` with `cdt:TrackLink state="candidate|bound" id="..."/>`.
- Require `cdt:TrackLink` to appear only on leaf `Task` nodes.
- Keep task execution state on `TaskGroup.status` / `Task.status`, not on `TrackLink`.
- Keep `TrackLink` free of path/archive/status projection attributes.
- Make mission examples Track-like: top-level `TaskGroup` DAG, sequential `Task` execution inside a group.
- Require `impl-mission` to update `TrackLink` from `candidate` to `bound` immediately after creating a real track and to write a report.
- Make `archive-mission` precheck bound track links before moving the mission.

## Non-Goals

- Do not add a CLI mission validator in this track.
- Do not auto-archive all mission tracks without user confirmation.
- Do not introduce separate `TrackCandidate`, `TrackRef`, or `TrackBinding` nodes.
- Do not store active/archive paths in mission.xml.

## Acceptance

- Mission spec documents the compact `TrackLink` node and valid states.
- Mission examples show `TrackLink` on leaf `Task` nodes.
- `impl-mission` operation requires immediate mission.xml writeback and `reports/track-bind-XXX.md`.
- `archive-mission` operation lists bound tracks and blocks or asks before archiving if they are not archived.
- Template copies are synchronized and template manifest is regenerated.
