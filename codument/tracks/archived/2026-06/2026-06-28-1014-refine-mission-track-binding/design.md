# Design

## TrackLink Contract

`cdt:TrackLink` is a mission-to-track binding pointer:

```xml
<Task id="G2-T1" name="创建 runtime contracts track" status="NOT_STARTED" order="0">
  <cdt:TrackLink state="candidate" id="add-runtime-contracts"/>
</Task>
```

After `codument-plan-track` creates the real track:

```xml
<Task id="G2-T1" name="创建 runtime contracts track" status="DONE" order="0">
  <cdt:TrackLink state="bound" id="add-runtime-contracts"/>
</Task>
```

Valid states:

- `candidate`: id is a recommended track id; no real track is guaranteed.
- `bound`: id is the real track id; the track exists or has existed and can be resolved from `codument/tracks/` or `codument/archive/`.

No `path`, no `archive-path`, no duplicate track status. If the real id differs from the candidate id, update `id` to the real id and write the original candidate id in the bind report.

## TaskSpace Shape

Mission TaskSpace should mirror track.xml structure:

- `TaskSpace` contains top-level `TaskGroup` nodes.
- Top-level mission `TaskGroup` dependencies are described in `Schedule/Dag`.
- Each `TaskGroup` contains sequential leaf `Task` nodes ordered by `order`.
- `cdt:TrackLink` appears under the leaf `Task` that creates, implements, verifies, or archives the track.

This keeps long-range mission planning parallel at the group level while preserving clear local execution order inside a group.

## impl-mission Writeback

When a ready leaf task with `TrackLink state="candidate"` creates a track:

1. Run or delegate `codument-plan-track`.
2. Determine the real track id from the created `codument/tracks/<id>/track.xml`.
3. Update the same `cdt:TrackLink` to `state="bound"` and `id="<real-id>"`.
4. Update the leaf `Task.status` according to actual progress.
5. Increment `Metadata.Revision` and update `Metadata.UpdatedAt`.
6. Write `reports/track-bind-XXX.md` with mission task id, candidate id, real id, evidence, and timestamp.

## archive-mission Precheck

Before moving a mission to `archived/`:

1. Scan `mission.xml` for all `cdt:TrackLink state="bound"`.
2. Resolve each id:
   - active: `codument/tracks/<id>/track.xml`
   - archived: `codument/archive/**/<timestamp>-<id>/track.xml`
   - missing: neither location exists
3. If all bound links are archived, continue.
4. If any bound link is active or missing, list them issues-first.
5. Do not silently cascade. Ask whether to call `codument-archive-track` for active completed tracks, leave them active, or block.

This preserves user control while preventing mission archive from hiding unclosed track work.
