# Findings

## Found Facts
- `codument/attractors/` already exists and currently contains `project.md` and `product.md`.
- Existing standard guidance tells agents to read relevant attractors, but this is advisory and can be skipped in practice.
- Existing `plan.xml` supports explicit gated XML nodes through `<confirm protocol="..." when="..." status="..." />`.
- Different lifecycle moments need different attractor sets: normal development usually needs project/product attractors, while archive or documentation synchronization may need documentation-related attractors.
- `codument/config/feature.json` already exists and is the current location for workspace-level feature configuration.
- `plan.xml` only covers a concrete track implementation plan; Codument commands or skills such as track creation and archive currently do not have an equivalent explicit XML surface for hook configuration.
- A workspace-level sparse hook overlay can make only selected command or skill points explicit without pre-populating every Codument subcommand.

## Constraints
- The new mechanism should be explicit in `plan.xml`, not only prose guidance.
- The new mechanism should reuse the existing `when` and `status` lifecycle model used by `<confirm>`.
- The new mechanism should compose with existing `<confirm>` behavior after a check completes.
- Default behavior should remain lightweight: default profile is `project.md` plus `product.md`.
- Track artifacts must be self-contained and should not rely on hidden-directory documents.
- The command/skill hook overlay file name is confirmed as `codument/config/operation-hooks.xml`.
- The new revision command/skill name is confirmed as `revise-track`.

## Open Questions
- Exact XML tag name is not final; this track proposes `<attractor-check>`.
- Exact profile config format is not final; this track proposes `codument/config/attractor-profiles.json`.
- The implementation must decide how much validation is CLI-enforced versus prompt/protocol-enforced.

## Conclusions
- Codument should add an explicit Attractor Check Hook that can be placed in `plan.xml` at track, phase, or task scope.
- Attractor profiles should provide reusable named bundles of attractor files for different lifecycle moments.
- Check result policy should decide whether gaps are repaired immediately, require human confirmation, or block execution.
- Codument should support a sparse workspace-level hook XML that reuses attractor-check and confirm DSL outside `plan.xml` for commands or skills that do not have their own execution plan.
- Codument should add `revise-track` as a first-class command/skill for correcting or appending track artifacts during implementation, gap-loop, archive preparation, or other non-linear work.
