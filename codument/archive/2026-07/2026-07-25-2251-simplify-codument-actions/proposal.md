# Change: simplify Codument action defaults

## Goals

- Create `design.md` and `decisions.xnl` for every new track and mission.
- Keep `decisions/` and `memory/` conditional on eligible durable content.
- Load short project constraints as direct context, not as a routine fresh attractor check.
- Leave ordinary tracks without phase attractor checks; allow a final check only when an architecture, security, or data-consistency scope explicitly needs it.
- Define decision-tree once in `std/protocols/` and remove the distributed skill surface.
- Reject invalid `decisions.xnl` before archive can mutate registries or move a track.

## Non-Goals

- Remove explicit `cdt:AttractorCheck` support.
- Split the coding profile into coding-core and architecture profiles.
- Change durable-decision promotion semantics.
