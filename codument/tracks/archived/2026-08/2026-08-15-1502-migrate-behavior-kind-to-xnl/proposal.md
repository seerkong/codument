# Proposal: migrate Behavior registry Kind to XNL

## Goal

Make `codument/behaviors/<capability>.xnl` the current single-file behavior
registry authority, backed by a Halfcode `Behavior` KindDefinition and catalog.

## Scope

- Canonical Behavior DSL for requirements, suites, cases, and scenario text.
- Deterministic migration from top-level `<behaviors>` XML files.
- Archive patch application can read/write XNL registries while legacy XML patch
  inputs continue to work.
- New capability creation emits XNL.
- Existing folder/include XML registries remain a compatibility fallback.

BehaviorPatch authoring remains XML in this Track and is migrated separately so
registry state and mutation semantics are not changed simultaneously.

## Acceptance

1. XML Behavior converts without losing requirement/suite/case content.
2. XML patch application updates an XNL registry and creates new XNL capabilities.
3. Halfcode discovers every current Behavior with no diagnostics.
4. Current workspace has no top-level `codument/behaviors/*.xml` authority.
