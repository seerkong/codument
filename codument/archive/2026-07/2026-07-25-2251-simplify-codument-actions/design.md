# Design

New planning creates the two lightweight root artifacts unconditionally: `design.md` records the implementation shape and `decisions.xnl` is the single decision carrier. Durable directory trees remain demand-created so empty tracks do not accumulate unused folders.

Attractor profiles remain reusable context and explicit validation tools. The default action-hook template has no fresh coding checks, and planning actions read relevant project context directly. A planner adds one final-phase attractor hook only when the track is explicitly classified as architecture, security, or data-consistency risk.

`std/protocols/decision-tree.md` owns severity, frontier, and file-shape guidance. Actions link to it instead of duplicating the protocol.

Archive validates a root `decisions.xnl` before registry staging and track movement. Invalid decision data therefore fails while the active track and registries are unchanged.
