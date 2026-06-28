# Decisions

## TrackLink Shape

Decision: Use one XML node, `cdt:TrackLink`, with a compact `state` attribute instead of multiple nodes.

```xml
<cdt:TrackLink state="candidate" id="add-runtime-contracts"/>
<cdt:TrackLink state="bound" id="add-runtime-contracts"/>
```

Rationale:
- Keeps mission.xml simple.
- Avoids separate `TrackCandidate` / `TrackRef` / `TrackBinding` nodes.
- Makes the binding lifecycle explicit without duplicating track status.

## No Path Attribute

Decision: `cdt:TrackLink` has no `path` attribute.

Rationale:
- Active or archived location is derived by scanning `codument/tracks/<id>/` and `codument/archive/**/<timestamp>-<id>/`.
- Avoids updating mission.xml again solely because a track moved to archive.
- Keeps mission.xml as desired/control state, not a projection cache of filesystem paths.

## Link Placement

Decision: `cdt:TrackLink` must be attached to a leaf `Task`, not a `TaskGroup`.

Rationale:
- Mission TaskSpace should stay aligned with track.xml: `TaskGroup` groups work; `Task` is the executable unit.
- Task/TaskGroup status remains on those nodes. `TrackLink` only binds a task to a track id.

## Mission Scheduling

Decision: Mission top-level `TaskGroup` nodes may be DAG-scheduled, while tasks inside each group execute sequentially by `order` unless a future spec explicitly allows nested DAG.

Rationale:
- Keeps long-running mission planning parallel enough at the group level.
- Keeps each group understandable and close to track.xml semantics.
