# Design

## Lifecycle Model

```text
tracks/pending/<id>  -- approval -->  tracks/active/<id>
tracks/active/<id>   -- archive  -->  tracks/archived/YYYY-MM/<timestamp>-<id>
```

`pending` holds planned but unapproved work. `active` is the only source for
implementation, list, status, and archive operations. Archived tracks retain
the timestamp bucket layout but no longer live under a separate root.

## Migration Safety

`upgrade-workspace` creates its full backup before any lifecycle move. It moves
direct legacy track directories containing `track.xml` or `plan.xml` into
`tracks/active/`, and moves legacy `codument/archive/` entries into
`tracks/archived/`. A destination conflict leaves the legacy source untouched
and reports its path; migration never overwrites a track.

## Prompt Routing

`plan-track` writes to pending and states the activation boundary. `impl-track`,
`verify`, and phase reports use active. `archive-track` moves active to archived.
Shared specs describe all three paths once, while command documentation only
describes command usage.
