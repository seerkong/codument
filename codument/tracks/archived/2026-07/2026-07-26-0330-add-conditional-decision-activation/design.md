# Design

A conditional decision is an incrementally materialized graph node. Its source
decisions remain roots or peers; the generated decision is also a peer and
lists every prerequisite in `depends_on`. `activation` records the predicate
that makes it applicable and `derived_from` records the actual resolved choices
that activated it.

The agent evaluates declared activation rules after each answer batch. It adds
only applicable decisions as `pending`, then recomputes the ready set. An
unmet condition does not create a speculative user question.
