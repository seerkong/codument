# Knowledge Context

## Source Notes
| Source | Summary | Relevance |
|--------|---------|-----------|
| `codument/std/AGENTS.md` | Requires reading relevant project-level attractors before work, but does not define an enforceable plan node. | Shows the current advisory-only gap. |
| `codument/std/plan-xml-spec.md` | Defines `<confirm>` as a reusable plan XML gate with `protocol`, `when`, and `status`. | Provides the pattern for the new hook. |
| `codument/std/protocols.md` | Defines `yield-human-confirm` and `yield-gap-loop` protocol behaviors and status transitions. | New hook should compose with existing confirmation protocols. |
| `codument/tracks/refactor-codument-vfs-attractors-memory/design/attractors-and-config.md` | Defines `codument/attractors/` as the project-level attractor root and permits custom attractors. | Provides the conceptual basis for profile bundles. |
| User request | Describes the need for different attractor sets by lifecycle phase and post-check policies. | Primary requirement source for this track. |
| User follow-up | Confirms `codument/config/operation-hooks.xml` as the workspace hook overlay file and `revise-track` as the new command/skill name. | Defines final naming and adds the track revision workflow requirement. |

## Codebase Knowledge
- Attractors are project-level long-running direction controls, not task-local implementation details.
- `codument/config/feature.json` is the current workspace-level JSON config precedent.
- Existing `knowledgeSync` targets can already reference an attractor path, which suggests profile entries should also use file paths initially.
- `plan.xml` already acts as the authoritative state and workflow source for track execution.
- Existing confirm semantics include `TODO`, `IN_PROGRESS`, `DONE`, `BLOCKED`, and `CANCELLED`; reusing them avoids a parallel state model.
- `operation-hooks.xml` should be a workspace-level sparse overlay for commands and skills that do not have their own `plan.xml`.
- `revise-track` should modify an existing track's own artifacts instead of creating a parallel plan or relying on ad hoc manual instructions.

## Domain Knowledge
- An attractor check is different from a gap loop: it evaluates alignment against selected project-level attractors, while a gap loop evaluates track implementation against track goals and specs.
- Profile selection lets one track use different attractor scopes at design, implementation, docs sync, and archive readiness points.
- A hook node should be composable: first run the check, then optionally run a nested confirmation or other post-check behavior.

## Terms
| Term | Meaning |
|------|---------|
| Attractor | Project-level long-term direction or truth-boundary document under `codument/attractors/`. |
| Attractor Profile | Named bundle of attractor files used for a specific validation context. |
| Attractor Check Hook | Proposed `plan.xml` node that runs attractor alignment validation for a track, phase, or task. |
| Result Policy | Proposed child configuration that decides what to do after a check finds a gap. |
| Scope | The plan node or lifecycle artifact being checked: track design, phase, task, or archive readiness. |
| Operation Hook | Workspace-level hook entry for a Codument command or skill in `codument/config/operation-hooks.xml`. |
| Revise Track | Proposed command/skill for correcting or appending existing track artifacts during non-linear work. |
