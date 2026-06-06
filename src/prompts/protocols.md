# Codument Protocols

This document defines reusable protocol blocks referenced by prompts and `<confirm>` elements in plan.xml.

## Common Rule: Question ToolCall Usage

Question ToolCalls are only a transport mechanism for real user questions. They are never a capability probe.

**Never do this:**
- Do not call a question ToolCall only to test whether the runtime supports questions.
- Do not ask placeholder questions such as `A) your answer`, `Type your answer`, or `User input required`.
- Do not ask an extra question only because a prompt mentions interactive-question support.

**Required behavior:**
- Trigger an ask protocol only when the workflow has a real clarification, choice, approval, or failure-handling question.
- If the environment supports a question ToolCall and a real ask protocol is triggered, use the ToolCall with the same concrete question content.
- If no real question is required, continue the workflow without asking.
- If the ToolCall API requires options, every option must be meaningful for the concrete workflow question; do not use dummy options to satisfy the schema.

## Protocol: ask-single-question-closed
**ID:** ask-single-question-closed

**Trigger:** You need to ask a single question and the answers must be chosen from fixed options (no free-text option).

**Behavior:**
- Ask one question at a time.
- Use lettered options (`A)`, `B)`, `C)`...).
- Follow **Common Rule: Question ToolCall Usage**.
- If this protocol is triggered and the environment supports question ToolCalls, use those ToolCalls with equivalent content.

**Example (suggested):**
```
A) [选项 A]
B) [选项 B]
```

## Protocol: ask-single-question-free
**ID:** ask-single-question-free

**Trigger:** You need to ask a single question and allow a free-text answer in addition to suggested options.

**Behavior:**
- Ask one question at a time.
- Prefer 2-3 high-quality options when possible.
- Use lettered options (`A)`, `B)`, `C)`...).
- The **last option must allow free-text input**, but the option label/name is NOT fixed.
  - Do NOT require the literal text "自定义答案".
  - Use a flexible label such as "其他（可填写）" / "自由输入" / "自定义".
  - In ToolCall environments that already provide a built-in free-input/"Other" option, do NOT add a duplicate.
- Follow **Common Rule: Question ToolCall Usage**.
- If this protocol is triggered and the environment supports question ToolCalls, use those ToolCalls with equivalent content.

**Example (suggested):**
```
A) [选项 A]
B) [选项 B]
C) [其他（可填写）]
```

## Protocol: ask-multi-question-closed
**ID:** ask-multi-question-closed

**Trigger:** You need to ask multiple questions in one round and answers must be chosen from fixed options (no free-text option).

**Behavior:**
- Ask 2-4 questions per round unless a prompt specifies a different cap.
- Prefix each question with `Q1`/`Q2`... and ask the user to answer by label.
- Use lettered options (`A)`, `B)`, `C)`...).
- Provide brief context and examples per question when helpful.
- Follow **Common Rule: Question ToolCall Usage**.
- If this protocol is triggered and the environment supports question ToolCalls, use those ToolCalls with equivalent content.

**Response Format (recommended):**
```
q1: <answer>
q2: <answer>
q3: <answer>
------
q4: <answer>
```

## Protocol: ask-multi-question-free
**ID:** ask-multi-question-free

**Trigger:** You need to ask multiple questions in one round and allow free-text answers in addition to suggested options.

**Behavior:**
- Ask 2-4 questions per round unless a prompt specifies a different cap.
- Prefix each question with `Q1`/`Q2`... and ask the user to answer by label.
- Prefer 2-3 high-quality options when possible.
- Use lettered options (`A)`, `B)`, `C)`...).
- The **last option must allow free-text input**, but the option label/name is NOT fixed.
  - Do NOT require the literal text "自定义答案".
  - Use a flexible label such as "其他（可填写）" / "自由输入" / "自定义".
  - In ToolCall environments that already provide a built-in free-input/"Other" option, do NOT add a duplicate.
- Provide brief context and examples per question when helpful.
- Follow **Common Rule: Question ToolCall Usage**.
- If this protocol is triggered and the environment supports question ToolCalls, use those ToolCalls with equivalent content.

**Response Format (recommended):**
```
q1: <answer>
q2: <answer>
q3: <answer>
------
q4: <answer>
```

## Protocol: yield-human-confirm
**ID:** yield-human-confirm

**Trigger:** A `<confirm protocol="yield-human-confirm" when="..." status="..." />` element exists under the current `<phase>` or `<task>` in plan.xml.

**Attributes:**
- `when` (required): `before` | `after` | `both`
- `status` (required): `TODO` | `IN_PROGRESS` | `DONE` | `BLOCKED` | `CANCELLED`

**Behavior:**
- when=before: summarize intent and scope, request confirmation before executing.
- when=after: summarize completed work, request confirmation before proceeding.
- when=both: perform both before and after confirmations.

**Status Handling:**
- Set `status=IN_PROGRESS` when starting a confirm.
- If confirmed, set `status=DONE`.
- If not confirmed or changes requested, set `status=BLOCKED`, apply changes, then re-run confirm until `status=DONE`.

**Response Handling:**
- If user confirms, proceed.
- If user requests changes, apply updates and re-confirm.
- If user declines or asks to stop, halt and await new instructions.

**Message Template (recommended):**
"Confirm (human) <phase/task> <id>: <name>. When=<before|after>. Summary: <summary>. Continue? (Y/N)"

## Protocol: yield-gap-loop
**ID:** yield-gap-loop

**Trigger:** A `<confirm protocol="yield-gap-loop" when="..." status="..." />` element exists under the current `<phase>` or `<task>` in plan.xml.

**Attributes:**
- `when` (required): `before` | `after` | `both`
- `status` (required): `TODO` | `IN_PROGRESS` | `DONE` | `BLOCKED` | `CANCELLED`

**Related Metadata:**
- `<validation_mode>yield-gap-loop</validation_mode>`
- `<validation_granularity>`: `final_phase` or `every_phase`
- `<gap_loop_round>`: current round counter, initialized to `0` and incremented by the parent orchestrator before each fresh round

**Behavior:**
1. The current execution agent reaches the confirm point and yields control to its parent orchestrator.
2. If the current execution is embedded in a higher-level orchestration environment that already implements `yield-gap-loop`, that higher-level orchestrator takes precedence as the parent orchestrator.
3. If the user explicitly invoked `codument:gap-loop` for a track whose `plan.xml` is not yet configured for gap-loop mode, the effective parent orchestrator MUST normalize `plan.xml` before round 1:
   - set `<validation_mode>yield-gap-loop</validation_mode>`
   - fill `<validation_granularity>` by preserving the existing phase-confirm coverage when it is clear, otherwise default to `final_phase`
   - initialize `<gap_loop_round>0</gap_loop_round>` if it is missing
   - migrate the relevant `<confirm>` protocol(s) to `yield-gap-loop`
   - add any missing phase-level `yield-gap-loop` confirms required by the final granularity
4. The effective parent orchestrator MUST start a fresh gap-loop child agent for the relevant track or phase.
5. The fresh child agent performs one complete round of:
   - target comparison
   - gap report generation
   - optional `plan.xml` / `spec_deltas/**/*.xml` / `design.md` updates
   - optional first-pass repair
6. The fresh child agent MUST end by returning only structured XML.
7. Before starting each fresh round, the parent orchestrator MUST update `<gap_loop_round>` to the next round number.
8. The parent orchestrator handles the XML result:
   - `NO_GAP`: mark the current `<confirm>` as `DONE` and continue, unless this was round 1 with no prior gap-loop reports; in that special case, start one more fresh verification round before marking `DONE`
   - `FIX_APPLIED`: keep the confirm unresolved and start another fresh gap-loop child for recheck
   - `BLOCKED`: mark the current `<confirm>` as `BLOCKED` and stop for user input
9. Downstream workers or member agents MUST NOT start a competing nested gap-loop when an upper-layer orchestrator has already claimed ownership of the protocol for the current scope.
10. Apply when logic:
   - when=before: run a fresh gap loop before executing the guarded scope
   - when=after: run a fresh gap loop after completing the guarded scope
   - when=both: do both

**Status Handling:**
- Set `status=IN_PROGRESS` when starting a confirm.
- If the gap-loop child returns `NO_GAP`, set `status=DONE` only after any required first-round verification has also passed.
- If the gap-loop child returns `FIX_APPLIED`, keep the confirm unresolved and re-run with a new child agent.
- If the gap-loop child returns `BLOCKED`, set `status=BLOCKED`.

**Response Handling:**
- The gap-loop child must not continue into the next round by itself.
- Each recheck round must use a fresh child agent or fresh child session.
- `FIX_APPLIED` is never a stopping condition for the parent orchestrator.
- If round 1 returns `NO_GAP` and there are no prior gap-loop reports for the current scope, the parent orchestrator must treat that result as provisional and run one more fresh verification round.
- If an upper-layer orchestration workflow already owns gap-loop for the current scope, lower-layer workers must hand control back to that workflow instead of creating an internal nested loop.
- If the track was not previously in gap-loop mode, the parent orchestrator must finish normalizing `plan.xml` before it launches round 1.
- If the child fails or returns malformed / missing XML, set `status=BLOCKED` and request human input.

**Message Template (recommended):**
"Confirm (gap-loop) <phase/task> <id>: <name>. When=<before|after>. Yield control to parent orchestrator and start a fresh gap-loop child round."

## Protocol: attractor-check
**ID:** attractor-check

**Trigger:** An `<attractor-check profile="..." when="..." status="..." executor="..." />` element exists under the current `plan.xml` scope, or inside `codument/config/operation-hooks.xml` for the current operation point.

**Attributes:**
- `profile` (optional): attractor profile name from `codument/config/attractor-profiles.json`; defaults to `default`.
- `when` (required): `before` | `after` | `both`
- `status` (required): `TODO` | `IN_PROGRESS` | `DONE` | `BLOCKED` | `CANCELLED`
- `executor` (optional): `main-agent` | `subagent` | `fresh-subagent`; defaults to `subagent`.

**Behavior:**
1. Resolve the requested attractor profile.
2. Read every attractor file in the profile.
3. Compare the guarded scope against those attractors.
4. Return a structured status:
   - `PASS`: no meaningful deviation found.
   - `GAP`: deviation found and a repair can be proposed.
   - `BLOCKED`: profile, scope, or repair path cannot be resolved safely.
5. Apply `<result-policy>`:
   - `fix-immediately`: repair, then rerun the check.
   - `confirm-before-fix`: run the nested `<confirm>` before repair.
   - `block`: mark the hook `BLOCKED` and wait for user input.

**Ownership:**
- If an upper-level operation hook already owns the attractor check for the current scope, downstream agents MUST NOT start competing nested checks.
- If `executor=fresh-subagent` is requested and no fresh child mechanism exists, return `BLOCKED` instead of silently degrading to same-context review.

**No Implicit Checks:**
- Do not run an attractor check merely because `codument/attractors/` exists.
- Run it only when a `plan.xml` or `operation-hooks.xml` hook explicitly configures it.

## Protocol: artifact-sync
**ID:** artifact-sync

**Trigger:** An `<artifact-sync artifact="..." status="..." executor="..." />` element exists inside `codument/config/operation-hooks.xml` for the current operation point.

**Attributes:**
- `artifact` (required): artifact id from `codument/config/artifacts.xml`.
- `status` (required): `TODO` | `IN_PROGRESS` | `DONE` | `BLOCKED` | `CANCELLED`
- `executor` (optional): `main-agent` | `subagent` | `fresh-subagent`; defaults to `subagent`.

**Behavior:**
1. Load `codument/config/artifacts.xml`.
2. Resolve the requested artifact from the `<artifacts>` section.
3. Resolve every resource referenced by the artifact's `<uses>` entries.
4. Treat `skill` resources as read-only rule or prompt sources, never as artifact outputs.
5. Use `workflow` resources, especially files under `codument/workflows/`, as execution guidance.
6. Use `attractor-profile` resources as artifact quality guidance.
7. Resolve the artifact's `<targets>` entries. Each `<target>` defines the target kind, destination `base-dir`, either `relative-dir` for directory artifacts or `relative-file` for single-file artifacts, and optional target-specific attractor.
8. Generate the artifact content once, preserving its relative file paths. For directory artifacts, distribute the same relative file tree into every target's `base-dir/relative-dir`. For file artifacts, write the same generated file content to every target's `base-dir/relative-file`.
9. Do not treat multiple targets as multiple independent artifact generations, and do not alter filenames or hierarchy per target unless a workflow or skill resource explicitly says so.
10. Execute the artifact sync according to the artifact source attributes, resolved targets, and `<policy>`.
11. Return a structured result with artifact id, status, summary, changed outputs per target, and manifest path when provenance is enabled.

**Policy:**
- `dry-run`: `never` | `first` | `always` | `changed`
- `conflict`: `block` | `diff-confirm` | `merge` | `overwrite` | `append` | `skip`
- `provenance`: `none` | `manifest` | `inline` | `both`

**No Implicit Sync:**
- Do not run artifact sync merely because `codument/config/artifacts.xml` exists.
- Run artifact sync only when an explicit `artifact-sync` hook configures it.
- If `executor=fresh-subagent` is requested and no fresh child mechanism exists, return `BLOCKED` instead of silently degrading to same-context execution.
