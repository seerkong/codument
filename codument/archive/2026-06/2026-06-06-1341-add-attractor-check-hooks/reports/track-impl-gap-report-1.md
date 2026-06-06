# add-attractor-check-hooks Gap Report - Round 1

## Scope

- Track: `add-attractor-check-hooks`
- Round: 1
- Scope kind: whole track
- Compared against: `proposal.md`, `design.md`, `spec_deltas/**/*.xml`, `plan.xml`, current implementation, and uncommitted diff

## Findings

### Fixed: malformed attractor profile config crashed validation

The implementation added validation for `plan.xml` `<attractor-check>` nodes and `codument/config/operation-hooks.xml`, including profile resolution. However, `validate` called `resolveAttractorProfile()` directly. If `codument/config/attractor-profiles.json` existed but contained malformed JSON, validation escaped through the CLI top-level exception handler instead of reporting a track validation error.

This was a gap against the track's validation intent: profile and hook validation should produce clear validation diagnostics for configuration problems rather than an unstructured command failure.

Applied fix:

- Updated `src/cli/commands/validate.ts` to catch profile config parsing failures while validating attractor checks and report them against `codument/config/attractor-profiles.json`.
- Added a regression test in `src/cli/commands/validate.test.ts` that verifies malformed profile JSON is reported as a validation error with exit code 1 and no stderr crash.

### Reviewed: generated skill behavior

The source lifecycle skill generator now includes `revise-track`, and the generated-skill test covers `operation-hooks.xml`, `before-revise`, and `attractor-check` in the generated `codument-revise-track` skill. Workspace-local generated skill directories under `.eidolon`, `.sparrow`, and `.opencode` are not tracked by git in this repository, so this round did not rewrite those local generated artifacts.

### Reviewed: archive knowledge-sync diff

The uncommitted archive diff changes durable decision sync behavior and related tests/prompts. This appears to belong to existing knowledge-sync/archive semantics rather than this track's attractor-check hook surface. I did not revert or further modify it in this round.

## Coverage Check

- Attractor profiles: implemented in `src/cli/utils/feature-config.ts`, initialized by `init`, ensured by `upgrade-workspace`, tested.
- `<attractor-check>` DSL: documented in standard and prompt docs; validated for `when`, `status`, `executor`, profile references, and missing attractor files.
- `<result-policy>` and nested `<confirm>`: documented and validated for supported policy and nested confirm timing/status.
- `codument/config/operation-hooks.xml`: documented as sparse overlay; missing file is valid; known hook points validated for `track`, `archive`, and `revise-track`.
- `revise-track`: prompt and generated skill source added; generated-skill behavior tested.
- Validate/init/upgrade/prompt/generated skill behavior: covered by focused tests and full test suite.

## Verification

- `bun test src/cli/commands/validate.test.ts src/cli/utils/feature-config.test.ts src/skills/codument-lifecycle.test.ts` passed: 12 tests.
- `bun run src/cli/index.ts validate add-attractor-check-hooks --strict` passed.
- `bun test` passed: 80 tests.

## Result

Status: `FIX_APPLIED`

No blocker remains for this round. Because a fix was applied, the parent gap-loop orchestrator should schedule a fresh follow-up round.
