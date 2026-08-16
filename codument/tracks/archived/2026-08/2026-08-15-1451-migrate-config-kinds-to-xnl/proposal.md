# Proposal: migrate config Kinds to XNL

## Goal

Replace the four remaining workspace configuration XML authorities with
versioned Halfcode resources:

- `ActionHooks`
- `AttractorProfiles`
- `ModelingConfig`
- `EngineeringConfig`

Each resource remains a user-owned file under `codument/config/`. The CLI owns
only its initial skeleton, Kind contract, deterministic migration, and reader.

## Constraints

- New files use `apiVersion="codument.tech/v1alpha1"` and normal XNL channels.
- Catalogs share `config/` and use precise single-file `entry` selection from
  `halfcode-compiler.xnl@0.2.1`.
- `upgrade-workspace` must convert legacy XML before a default XNL file can
  shadow it, preserving configured values and comments where semantically useful.
- Legacy XML remains readable during the compatibility window.
- No XML prompt examples or paths remain for these four current authorities.

## Acceptance

1. Fresh init creates only the four XNL config files.
2. Upgrade converts all four XML files, backs them up, and leaves no dual authority.
3. Modeling/engineering readers and profile validation consume XNL structurally.
4. Halfcode loads all four config resources with no diagnostics.
5. Full checks, build, and dogfood upgrade pass.
