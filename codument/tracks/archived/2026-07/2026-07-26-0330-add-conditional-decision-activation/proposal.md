# Change: Add Conditional Decision Activation

## Goal

Extend topological planning so combinations of resolved decisions can materialize
a new, same-level decision direction without forcing it into one source branch.

## Scope

- Define `activation`, `depends_on`, and `derived_from` roles.
- Add a minimal multi-root XNL example to the shared decision-tree protocol.
- Preserve topological batch behavior after generated nodes appear.
