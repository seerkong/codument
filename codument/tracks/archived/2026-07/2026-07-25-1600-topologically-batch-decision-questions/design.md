# Design

Nested decision records represent parent-to-child refinement. A child becomes
eligible only after its parent is resolved; `depends_on` adds explicit
cross-branch edges. At each questioning round, the planner resolves evidence
locally, computes every remaining zero-dependency record, and asks a single
batch of the highest-priority ready records. A response updates all addressed
records before recomputing the next frontier.

This gives breadth-first refinement across multiple roots while preserving
causal ordering inside each branch. Severity remains the cap on questions per
round, not a reason to serialise unrelated roots.
