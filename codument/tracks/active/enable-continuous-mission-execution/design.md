# Design

## Execution Session

An invocation of `codument-impl-mission` is a continuous control loop. A pending mission is moved to `active/` and then immediately reloaded from its active path. Activation and a completed track are never default return points.

## Action Verification

Each logical mission action owns a completion check appropriate to its effect: a code change uses its relevant tests or static checks; a linked track uses its leaf status and acceptance evidence; an external operation re-reads the affected resource; an analysis action checks that its agreed evidence has been written.

This is not a receipt protocol. The action does not write a dedicated report or serialize a common XNL/JSON shape merely to continue. It records only the ordinary state and evidence already required by the action.

When the completion check passes and reveals no invalidation signal, the executor selects the next planned ready action from its updated DAG state and continues directly. An uncertain check, failed check, or a signal that a prerequisite, dependency, scope, or goal has changed causes an observation of the affected scope followed by reconciliation. Full observation is reserved for uncertainty that cannot be bounded to a relevant scope.

## Pause Conditions

The loop returns only when:

- the decision protocol requires a user confirmation for a ready pending decision;
- actual state is genuinely blocked;
- mission status becomes `completed`, `cancelled`, or `superseded`; or
- ten track lifecycles have completed in the current invocation.

`QuestionSeverity=auto` records conservative assumptions and continues without asking.

## Track Budget

`max-tracks=10` is a mission execution-session budget, not a general action counter. A track counts only after the linked track lifecycle reaches its terminal evidence and the mission leaf task is written `DONE`. Creating or binding a track does not consume the budget.

At ten completed tracks, the executor writes a continuation checkpoint/report and returns with `Metadata.Status=active`. A later `codument-impl-mission` invocation resumes from `mission.xml`; the checkpoint is not `blocked` or `completed`.

## Prompt Surface

The behavior registry, skill description, mission action, and Mission XML spec all use the same vocabulary: continuous execution, action-local verification, conditional observation/reconciliation, decision confirmation, blocked/terminal states, and a ten-track checkpoint. Mission-only bounded-action wording is removed. Decision-tree and GapLoop retain their own unrelated bounded terminology.
