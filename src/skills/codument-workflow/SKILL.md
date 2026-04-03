---
name: codument-workflow
description: Use when the user wants to initialize, operate, validate, inspect, discuss, plan, execute, verify, or archive a Codument-based project workflow. Trigger for requests involving `codument/` directories, tracks, `tracks.md`, `plan.xml`, `spec.md`, wave execution, track creation, Codument status, or migrating an existing repo onto the Codument methodology.
---

# Codument Workflow

## Overview

This skill consolidates the old `/codument:*` lifecycle entrypoints into one workflow skill. Use it whenever the user's request maps to a Codument lifecycle action.

Keep the active instruction set small. First determine the user's intent, then load only the matching sub-skill from `subskills/`.

Before loading a sub-skill, also check:

- `shared/workflow-routing.md` for the generated routing map
- `shared/target-capabilities.md` for target-specific loading and fresh-child guidance
- `shared/subagent-model.md` for the common fresh-child capability model

## Intent Router

Choose the narrowest matching workflow:

- Project bootstrap or resume Codument setup: read `subskills/init/SKILL.md`
- Create a new track, proposal, spec, or plan: read `subskills/track/SKILL.md`
- Show project progress or summarize tracks/tasks: read `subskills/status/SKILL.md`
- Validate Codument track/spec structure or strict mode output: read `subskills/validate/SKILL.md`
- Implement a track sequentially from `plan.xml`: read `subskills/implement/SKILL.md`
- Discuss a phase and persist implementation decisions into `context.md`: read `subskills/discuss/SKILL.md`
- Convert a phase into wave DAG execution groups: read `subskills/plan-wave/SKILL.md`
- Orchestrate wave execution across phases/tasks: read `subskills/execute-wave/SKILL.md`
- Independently verify completed work with issues-first reporting: read `subskills/verify/SKILL.md`
- Run a fresh gap analysis and repair loop for a track or phase: read `subskills/gap-loop/SKILL.md`
- Archive a completed track and merge spec deltas: read `subskills/archive/SKILL.md`

If a request spans multiple lifecycle steps, load only the current step first. Pull adjacent sub-skills only when the current step explicitly depends on them.

## Working Rules

- Treat the selected sub-skill as the authoritative procedure for that Codument action.
- Preserve Codument's explicit stop conditions. If required files are missing or the workflow says to stop, do not improvise hidden recovery logic.
- Prefer direct file inspection over assumptions. Read the actual `codument/` files before proposing next steps.
- Use the environment's structured question tools when the selected sub-skill requires user choice or confirmation.
- Keep outputs aligned with the original workflow's intent. Do not silently collapse interactive checkpoints that were designed to capture requirements or approval.
- When implementing or verifying, keep the user's repo changes intact and operate only on the target track or files the workflow requires.

## Common Paths

- Project root: `codument/`
- Track registry: `codument/tracks.md`
- Track folder: `codument/tracks/<track_id>/`
- Shared workflow standards: `codument/std/`
- Project-specific workflow config: `codument/workflows/workflow.md`

## Output Expectations

- For status/validation/verification, prefer concise structured results over narration.
- For verification, keep an issues-first order.
- For workflow steps that create or update files, explain what changed and what state transition happened.
- When a workflow references commands like `/codument:init`, interpret that as "load the matching `codument-workflow` sub-skill or wrapper entrypoint for this target".
