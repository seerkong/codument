# Codument Protocols

This document defines reusable protocol blocks referenced by `<confirm>` elements in plan.xml.

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

## Protocol: yield-ai-confirm
**ID:** yield-ai-confirm

**Trigger:** A `<confirm protocol="yield-ai-confirm" when="..." ai-agent="..." status="..." />` element exists under the current `<phase>` or `<task>` in plan.xml.

**Attributes:**
- `when` (required): `before` | `after` | `both`
- `ai-agent` (required): subagent name to execute the confirmation review
- `status` (required): `TODO` | `IN_PROGRESS` | `DONE` | `BLOCKED` | `CANCELLED`

**Prompt Requirements (caller MUST include):**
- `workspace_dir`: absolute path to the workspace root
- `track_dir`: absolute path to the current track directory

**Behavior:**
1. Invoke the specified subagent (`ai-agent`) to review intent or completed work.
2. The prompt MUST pass `workspace_dir` and `track_dir`.
3. Subagent output MUST be issues-first: blocking issues, then non-blocking issues, then a brief summary.
4. Apply when logic:
   - when=before: review intent and plan before executing.
   - when=after: review completed work before proceeding.
   - when=both: perform both reviews.

**Status Handling:**
- Set `status=IN_PROGRESS` when starting a confirm.
- If no blocking issues, set `status=DONE`.
- If blocking issues are found, set `status=BLOCKED`, apply changes, then re-run confirm until `status=DONE`.

**Response Handling:**
- If blocking issues are found, stop and surface them to the user for direction.
- If only non-blocking issues (or none), proceed automatically and note risks.
- If the subagent fails or returns no result, set `status=BLOCKED` and request human confirmation.

**Message Template (recommended):**
"Confirm (ai:<ai-agent>) <phase/task> <id>: <name>. When=<before|after>. Issues-first report: <blocking> / <non-blocking>. Proceeding unless blocking issues."
