# Change: Batch Decision Questions by Topological Frontier

## Goal

Make track and mission planning ask all independently answerable decision
directions in one batch, then expand only the newly unlocked dependent
questions after the response.

## Scope

- Define a decision forest dependency model and topological frontier algorithm.
- Apply the shared protocol to track, mission, discuss, and maintain prompts.
- Preserve `auto` as a no-question mode and existing severity budgets.

## Non-Goals

- Add a runtime CLI question engine.
- Change the XNL parser or decision-file compatibility rules.
