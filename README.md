# Codument

**Spec-Driven Development Tool for AI Coding Assistants**

Codument is a CLI tool that brings structure and traceability to AI-assisted software development. It helps you manage features, bug fixes, and refactoring through a systematic "track" workflow with structured specifications and task breakdowns.

[中文文档](./README-cn.md)

## Why Codument?

When working with AI coding assistants, it's easy to lose track of what was planned, what's been implemented, and what still needs to be done. Codument solves this by:

- **Structured Planning**: Break down work into phases, tasks, and subtasks in `plan.xml`
- **Specification First**: Define requirements in `spec.md` before coding
- **Progress Tracking**: Track TODO / IN_PROGRESS / DONE / BLOCKED status from `plan.xml`
- **Wave Workflow Support**: Supports discuss / plan-wave / execute-wave / verify command flows
- **Multi-Tool Support**: Works with Claude Code, OpenAI Codex CLI, Eidolon, Gemini CLI, and OpenCode

## Features

### Track-Based Workflow

Each feature or bug fix is managed as a "track" with:
- **proposal.md** - Change proposal with background and scope
- **spec.md** - Behavioral specifications and requirement deltas
- **plan.xml** - Phase / task / subtask plan, status, commit mode, and optional wave DAG
- **metadata.json** - Track metadata and status snapshot
- **design.md** - Optional technical design

### Hierarchical Task Management

```
Track
└── Phase (P1, P2, ...)
    └── Task (T1.1, T1.2, ...)
        └── Subtask (T1.1.1, T1.1.2, ...)
```

### Supported AI CLI Tools

| Tool | Generated command location | Typical invocation |
|------|----------------------------|--------------------|
| Claude Code | `.claude/commands/codument/` | `/codument:init`, `/codument:track`, `/codument:implement` |
| OpenAI Codex CLI | `~/.codex/prompts/` | `/prompts:codument-init`, `/prompts:codument-track`, `/prompts:codument-plan-wave` |
| Eidolon | `.eidolon/commands/codument/` | `/codument:init`, `/codument:track`, `/codument:plan-wave` |
| Gemini CLI | `.gemini/commands/codument/` | `/codument:init`, `/codument:track`, `/codument:plan-wave` |
| OpenCode | `.opencode/command/` | Generated from `codument-*.md` command files |

## Installation

### Prerequisites

- [Bun](https://bun.sh) runtime (v1.0+)

### Build from Source

```bash
# Clone the repository
git clone https://github.com/seerkong/codument.git
cd codument

# Install dependencies
bun install

# Build the CLI
bun run build

# Optional: install to ~/.local/bin (or CODUMENT_BIN_DIR)
bun run scripts/install.ts
```

After build, the binary is at `dist/codument`.
The install script places `codument` in `~/.local/bin` by default and prints PATH instructions if needed.

## Quick Start

### 1. Initialize a Project

```bash
cd your-project
codument init
```

This will:
- Create the `codument/` directory structure
- Generate `project.md`, `product.md`, `tech-stack.md`, `tracks.md`, `state.json`
- Generate `codument/std/` and `codument/workflows/workflow.md`
- Generate command files only for the AI CLI tools you selected

### 2. Create a Change Track

Use the generated command for your selected AI tool.
Examples:

```text
Claude / Gemini / Eidolon: /codument:track Add user authentication feature
Codex: /prompts:codument-track Add user authentication feature
```

The assistant will guide you through:
1. Discussing requirements
2. Creating `spec.md`, `proposal.md`, and `plan.xml`
3. Breaking down work into phases, tasks, and subtasks
4. Choosing commit mode (`auto` / `manual`)

### 3. Implement Tasks

```text
Claude / Gemini / Eidolon: /codument:implement <track-id>
Codex: /prompts:codument-implement <track-id>
```

For wave-based execution, the generated command set also includes:
- `discuss`
- `plan-wave`
- `execute-wave`
- `verify`

### 4. Archive Completed Track

```text
Claude / Gemini / Eidolon: /codument:archive add-user-auth
Codex: /prompts:codument-archive add-user-auth
```

Moves the track to `codument/archive/YYYY-MM-DD-add-user-auth/`.

## Upgrade An Existing Workspace

If your project already has a `codument/` folder and you updated the Codument CLI, you can upgrade the workspace files to the latest embedded versions:

```bash
codument upgrade-workspace
```

This updates `codument/std/` and regenerates assistant command files for the CLI tools listed in `codument/state.json` (`cli_tools`).
For Codex, regenerated prompt files are written to `~/.codex/prompts/`.
A rollback backup is created under `./.tmp/codument/` by default.

See `UPGRADE_WORKSPACE.md` for details.

## Upgrade An Existing Track

To upgrade a single existing track (active or archived) to the latest plan.xml conventions that support wave execution:

```bash
codument upgrade-track <track-id-or-archive-id>
```

See `UPGRADE_TRACK.md` for details.

## CLI Commands

| Command | Description |
|---------|-------------|
| `codument init` | Interactively initialize Codument in the current project |
| `codument list [--specs] [--json]` | List active tracks or specs |
| `codument show <id> [--type track\|spec] [--json]` | Show track or spec details |
| `codument status` | Show project status overview |
| `codument validate [id] [--type track\|spec] [--strict]` | Validate tracks or specs |
| `codument archive <track-id> [--skip-specs] [--yes]` | Archive a completed track |
| `codument upgrade-workspace [--no-backup] [--backup-dir <path>]` | Upgrade embedded workspace files and assistant commands |
| `codument upgrade-track <track-id-or-archive-id> [--mode wave\|sequential]` | Upgrade one track to the current `plan.xml` conventions |
| `codument --help` / `codument --version` | Show help or version |

### Global Options

| Option | Description |
|--------|-------------|
| `-w, --workspace-dir <path>` | Specify working directory |

## Directory Structure

After initialization:

```text
your-project/
├── codument/
│   ├── project.md
│   ├── product.md
│   ├── tech-stack.md
│   ├── tracks.md
│   ├── state.json
│   ├── std/
│   │   ├── AGENTS.md
│   │   ├── plan-xml-spec.md
│   │   ├── workflow.md
│   │   └── protocols.md
│   ├── workflows/
│   │   └── workflow.md
│   ├── tracks/
│   │   └── <track-id>/          # Created later by the AI commands
│   │       ├── proposal.md
│   │       ├── spec.md
│   │       ├── plan.xml
│   │       ├── metadata.json
│   │       ├── design.md        # optional
│   │       ├── analysis/        # optional planning artifacts
│   │       ├── context.md       # optional, wave workflow
│   │       ├── state.md         # optional, wave workflow
│   │       ├── phases/          # optional, wave workflow
│   │       └── waves/           # optional, wave workflow
│   ├── specs/
│   └── archive/
├── .claude/commands/codument/    # if Claude Code was selected
├── .gemini/commands/codument/    # if Gemini CLI was selected
├── .eidolon/commands/codument/   # if Eidolon was selected
├── .opencode/command/            # if OpenCode was selected
├── AGENTS.md
└── ~/.codex/prompts/             # if Codex CLI was selected
```

## plan.xml Format

```xml
<?xml version="1.0" encoding="UTF-8"?>
<plan>
  <metadata>
    <track_id>add-user-auth</track_id>
    <track_name>Add User Authentication</track_name>
    <goal>Implement login and registration</goal>
    <created_at>2026-01-01T10:00:00Z</created_at>
    <updated_at>2026-01-01T10:00:00Z</updated_at>
    <status>new</status>
    <commit_mode>auto</commit_mode>
  </metadata>

  <phases>
    <phase id="P1" name="Infrastructure">
      <goal>Set up authentication infrastructure</goal>
      <tasks>
        <task id="T1.1" name="Create User Model" status="TODO" priority="P0">
          <description>Define User model with username, password hash, email</description>
          <acceptance_criteria>
            <criterion id="T1.1-AC1" checked="false">User model has required fields</criterion>
          </acceptance_criteria>
          <subtasks>
            <subtask id="T1.1.1" name="Write tests" status="TODO" estimated_hours="2"/>
            <subtask id="T1.1.2" name="Implement model" status="TODO" estimated_hours="4"/>
          </subtasks>
        </task>
      </tasks>
      <gate_criteria>
        <criterion>All P0 tasks completed</criterion>
        <criterion>Test coverage >80%</criterion>
      </gate_criteria>
    </phase>
  </phases>

  <summary>
    <total_phases>1</total_phases>
    <total_tasks>1</total_tasks>
    <completed>0</completed>
    <in_progress>0</in_progress>
    <todo>1</todo>
    <blocked>0</blocked>
  </summary>
</plan>
```

### Priority Levels

| Priority | Description |
|----------|-------------|
| P0 | Critical - blocks core functionality |
| P1 | High - important but not blocking |
| P2 | Medium - nice to have |

### Task Status

| Status | Description |
|--------|-------------|
| TODO | Not started |
| IN_PROGRESS | Currently being worked on |
| DONE | Completed |
| BLOCKED | Blocked by dependency or issue |
| CANCELLED | No longer needed |

## Commit Modes

### Auto Mode
- Automatically commits after each task completion
- Creates checkpoint commits at phase boundaries
- Whether commits happen automatically depends on the workflow and assistant executing the prompt

### Manual Mode
- You control when to commit
- No automatic Git operations

## Best Practices

1. **Start with Spec**: Always define spec.md before implementing
2. **Small Tasks**: Break down tasks into 1-4 hour chunks
3. **TDD Workflow**: Write tests before implementation
4. **Phase Gates**: Verify gate criteria before moving to next phase
5. **Regular Status**: Run `codument status` to track progress

## License

MIT License - see [LICENSE](LICENSE) for details.

---

Built with Bun and TypeScript.
