# add-attractor-check-hooks Gap Report - Round 2

## Scope

- Track: `add-attractor-check-hooks`
- Round: 2
- Scope kind: whole track
- Compared against: `proposal.md`, `design.md`, `spec_deltas/**/*.xml`, `plan.xml`, `reports/track-impl-gap-report-1.md`, current implementation, and uncommitted diff

## Findings

### Fixed: operation-hooks.xml version was not validated

The track requires `codument/config/operation-hooks.xml` to be validated as a sparse XML hook overlay, and the documented root shape is `<operation-hooks version="1">`. The implementation validated the root tag but accepted a missing or unsupported `version` attribute.

Applied fix:

- Updated `src/cli/commands/validate.ts` to report an operation hook validation error unless the root has `version="1"`.
- Extended `src/cli/commands/validate.test.ts` to cover an invalid operation hook version.

### Fixed: nested confirm protocol was not validated under result-policy

The track requires `<result-policy>` with nested `<confirm>` to reuse the existing confirm DSL consistently. Validation checked nested confirm `when` and `status`, but did not validate `protocol`, so unsupported nested confirm protocols could pass.

Applied fix:

- Updated `src/cli/commands/validate.ts` to accept only `yield-human-confirm` or `yield-gap-loop` for nested `<confirm>` under `<result-policy>`.
- Extended `src/cli/commands/validate.test.ts` to cover an invalid nested confirm protocol.

### Reviewed: malformed attractor profile configuration

The Round 1 fix remains in place. `validate` catches malformed `codument/config/attractor-profiles.json` while resolving attractor profiles and reports it as a structured validation error against `codument/config/attractor-profiles.json`, with regression coverage in `src/cli/commands/validate.test.ts`.

### Reviewed: target coverage

- Attractor profiles: default fallback, custom profile preservation, missing attractor file reporting, init creation, and upgrade preservation are implemented and tested.
- `<attractor-check>` DSL: `when`, `status`, `executor`, profile references, missing profile files, and `result-policy` values are validated.
- `<result-policy>` + nested `<confirm>`: supported `on-gap`, nested confirm `protocol`, `when`, and `status` are validated.
- `codument/config/operation-hooks.xml`: missing file is valid; root tag, version, hook status, known hook points, nested attractor checks, and profile references are validated.
- `revise-track`: prompt and generated lifecycle skill source are present, and generated-skill tests cover `operation-hooks.xml`, `before-revise`, and `attractor-check`.
- Standard docs and prompt docs are synchronized for plan XML, protocols, workflow, AGENTS guidance, validate guidance, archive, implement, execute-wave, gap-loop, track, and generated lifecycle skills.

## Verification

- `bun test src/cli/commands/validate.test.ts src/cli/utils/feature-config.test.ts src/skills/codument-lifecycle.test.ts` passed: 12 tests.
- `bun run src/cli/index.ts validate add-attractor-check-hooks --strict` passed.
- `bun test` passed: 80 tests.

## Result

Status: `FIX_APPLIED`

No blocker remains for this round. Because a fix was applied, the parent gap-loop orchestrator should schedule a fresh follow-up round.
