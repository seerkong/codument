# DEPA Codument

DEPA Codument is a spec-driven workflow tool for AI coding assistants. It installs a self-contained `codument/` workspace into a project and gives agents durable prompts, specs, attractors, behavior registries, track/mission workflows, and validation commands.

The npm package is named `depa-codument`. The CLI command remains `codument`.

## Install And Run

Use it directly with npx:

```bash
npx depa-codument --help
npx depa-codument init --agent=codex,claude
```

Or install globally:

```bash
npm install -g depa-codument
codument --help
```

The package also exposes a `depa-codument` bin alias, so this works too:

```bash
depa-codument --help
```

## Requirements

- Bun runtime available on the machine that runs the CLI.
- An AI coding assistant that can read installed skills, such as Codex, Claude Code, or OpenCode.

## What It Provides

Codument organizes AI-assisted development by task scale:

| Scale | Skill / Operation | Use |
|---|---|---|
| Small change | `codument-impl-quick` | Read Codument context and implement a small bug fix, test, local refactor, or config change without creating a track. |
| Pre-plan discussion | `codument-discuss` | Gather context before deciding whether work should be quick, track, mission, or blocked. Temporary notes go to `codument/analysis/` and are cleaned by the workflow. |
| Medium task | `codument-plan-track` / `codument-impl-track` / `codument-archive-track` | Plan, implement, verify, and archive a bounded change. |
| Long task | `codument-plan-mission` / `codument-impl-mission` / `codument-archive-mission` | Coordinate longer work across multiple tracks with a mission DAG and controlled replanning. |

Codument also includes:

- `codument/modeling/` registry support for domain, backend, surface, and other structural models in XNL.
- `codument/engineering/` registry support for long-lived implementation knowledge.
- `codument/behaviors/` as the behavior contract registry.
- `behavior_deltas/`, `modeling_deltas/`, and `engineering_deltas/` for track-local proposed changes.
- `operation-hooks.xml` for command lifecycle hooks such as coding attractor checks before planning.
- `codument/**/analysis` and `codument/**/reports` gitignore rules for scratch evidence and run reports.

## Quick Start

Initialize a project:

```bash
cd your-project
npx depa-codument init --agent=codex,claude
```

This writes:

- `codument/std/` with operation prompts, specs, SOPs, and standard attractors.
- `codument/config/` with attractor profiles, operation hooks, modeling, and engineering config.
- `codument/attractors/project.md` and `codument/attractors/product.md`.
- Skill shells for the selected agents.
- A managed `AGENTS.md` block pointing assistants to `codument/std/AGENTS.md`.

If `.gitignore` already exists, init also ensures:

```gitignore
codument/**/analysis
codument/**/reports
```

## Common Workflows

### Small Change

Ask the agent:

```text
请使用 codument-impl-quick skill, 快速实现这个小改动: <description>
```

`impl-quick` reads Codument context and project files first. If the request is actually a new feature, behavior change, architecture change, or multi-stage task, it should stop and recommend a track or mission.

### Pre-plan Discussion

Ask the agent:

```text
请使用 codument-discuss skill, 分析这个需求应该 quick / track / mission: <description>
```

The result should include:

- `route: quick | track | mission | blocked`
- reason
- suggested next command
- evidence read
- open questions

### Track Workflow

Create a track:

```text
请使用 codument-plan-track skill, 创建 track: <track-id or description>
```

A track is stored in `codument/tracks/<track-id>/` and uses `track.xml` as the state source. A typical track contains:

```text
codument/tracks/<track-id>/
  track.xml
  proposal.md
  design.md
  decisions.md
  behavior_deltas/
  modeling_deltas/
  engineering_deltas/
  analysis/   # gitignored scratch
  reports/    # gitignored run reports
```

Implement it:

```text
请使用 codument-impl-track skill, 实现 track: <track-id>
```

Discuss or refine a phase:

```text
请使用 codument-discuss-phase skill, 讨论 track phase: <track-id> P1
```

Verify or correct:

```text
请使用 codument-verify skill, 验证 track: <track-id>
请使用 codument-gap-loop skill, 校验并修复 track: <track-id>
```

Archive when done:

```text
请使用 codument-archive-track skill, 归档 track: <track-id>
```

Archive promotes behavior deltas into `codument/behaviors/` and, when enabled, merges modeling/engineering deltas into their registries.

### Mission Workflow

Create a mission:

```text
请使用 codument-plan-mission skill, 创建 mission: <long-running goal>
```

Missions live under:

```text
codument/missions/
  pending/
  active/
  archived/
```

Each mission has `mission.xml`, `proposal.md`, and `design.md`. The mission DAG coordinates groups of tasks and can bind leaf tasks to real tracks via `cdt:TrackLink`.

## CLI Commands

```bash
codument init [--agent <tool[,tool...]>] [--skills-dir <path>] [--force]
codument upgrade-workspace [--agent <tool[,tool...]>] [--skills-dir <path>]
codument upgrade-track <track-id-or-archive-id>
codument list [--behaviors] [--json]
codument show [item] [--json]
codument validate [item] [--strict]
codument archive <track-id> [--yes]
codument modeling lint
codument modeling validate [--deltas <track-id>]
codument engineering lint
codument engineering validate [--deltas <track-id>]
codument decisions validate [track-id]
codument status
```

Global option:

```bash
codument --workspace-dir <path> <command>
```

## Agent Skill Targets

Supported `--agent` values:

| Agent | Skill destination |
|---|---|
| `codex` | `~/.codex/skills` |
| `claude` | `.claude/skills` |
| `opencode` | `.opencode/skills` |

You can also provide an explicit destination:

```bash
codument init --skills-dir .agents/skills
```

## Workspace Layout

After init:

```text
codument/
  attractors/          project-owned attractors
  config/              attractor profiles, operation hooks, modeling/engineering gates
  std/                 upgrade-managed standards, specs, SOPs, operation prompts
  behaviors/           behavior registry
  modeling/            optional XNL modeling registry
  engineering/         optional XNL engineering registry
  tracks/              active tracks
  archive/             archived tracks
  missions/            pending / active / archived missions
  decisions/           durable decisions
  memory/              durable lessons/incidents/patterns/summaries
```

## Development

```bash
bun install
bun run check
bun run build:all
```

Build outputs:

```text
dist/codument
dist/codument-dev
```

Local install:

```bash
bun run install:local
```

## Repository

```text
git@github.com:seerkong/depa-codument.git
```
