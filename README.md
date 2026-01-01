# Codument

**Spec-Driven Development Tool for AI Coding Assistants**

Codument is a CLI tool that brings structure and traceability to AI-assisted software development. It helps you manage features, bug fixes, and refactoring through a systematic "track" workflow with structured specifications and task breakdowns.

[中文文档](./README-cn.md)

## Why Codument?

When working with AI coding assistants, it's easy to lose track of what was planned, what's been implemented, and what still needs to be done. Codument solves this by:

- **Structured Planning**: Break down features into phases, tasks, and subtasks
- **Specification First**: Define requirements in GIVEN/WHEN/THEN format before coding
- **Progress Tracking**: Track task status (TODO, IN_PROGRESS, DONE, BLOCKED)
- **Multi-Tool Support**: Works with Claude Code, OpenAI Codex CLI, Gemini CLI, and Eidolon
- **Git Integration**: Optional auto-commit with Git Notes for full traceability

## Features

### Track-Based Workflow

Each feature or bug fix is managed as a "track" with:
- **proposal.md** - Change proposal with background and scope
- **spec.md** - Behavioral specifications in GIVEN/WHEN/THEN format
- **tasks.xml** - Hierarchical task breakdown (Phase → Task → Subtask)
- **metadata.json** - Track metadata and status

### Hierarchical Task Management

```
Track
└── Phase (P1, P2, ...)
    └── Task (T1.1, T1.2, ...)
        └── Subtask (T1.1.1, T1.1.2, ...)
```

### Supported AI CLI Tools

| Tool | Slash Commands |
|------|----------------|
| Claude Code | `/codument:init`, `/codument:track`, `/codument:implement`, etc. |
| OpenAI Codex CLI | `/prompts:codument-init`, `/prompts:codument-track`, etc. |
| Gemini CLI | `/codument:init`, `/codument:track`, etc. |
| Eidolon | `/codument:init`, `/codument:track`, etc. |

## Installation

### Prerequisites

- [Bun](https://bun.sh) runtime (v1.0+)

### Build from Source

```bash
# Clone the repository
git clone https://github.com/your-repo/codument.git
cd codument

# Install dependencies
bun install

# Build the CLI
bun run build

# The executable will be at dist/codument
# Optionally, move it to your PATH
cp dist/codument /usr/local/bin/
```

## Quick Start

### 1. Initialize a Project

```bash
cd your-project
codument init
```

This will:
- Create the `codument/` directory structure
- Generate configuration files
- Create slash commands for your selected AI CLI tools

### 2. Create a Change Track

Use the slash command in your AI assistant:

```
/codument:track Add user authentication feature
```

The AI will guide you through:
1. Discussing requirements
2. Creating spec.md with GIVEN/WHEN/THEN scenarios
3. Breaking down tasks into phases and subtasks
4. Choosing commit mode (auto/manual)

### 3. Implement Tasks

```
/codument:implement
```

Follow the workflow:
1. Pick the next TODO task
2. Mark as IN_PROGRESS
3. Write tests (TDD recommended)
4. Implement the feature
5. Mark as DONE
6. Proceed to next task

### 4. Archive Completed Track

```
/codument:archive add-user-auth
```

Moves the track to `codument/archive/YYYY-MM-DD-add-user-auth/`

## CLI Commands

| Command | Description |
|---------|-------------|
| `codument init` | Initialize Codument in the current project |
| `codument list` | List all active tracks |
| `codument show <track-id>` | Show track details |
| `codument status` | Show project status overview |
| `codument validate [track-id]` | Validate track format |
| `codument archive <track-id>` | Archive a completed track |

### Global Options

| Option | Description |
|--------|-------------|
| `-w, --workspace-dir <path>` | Specify working directory |

## Directory Structure

After initialization:

```
your-project/
├── codument/
│   ├── project.md        # Project configuration
│   ├── product.md        # Product definition
│   ├── workflow.md       # Workflow guidelines
│   ├── tech-stack.md     # Technology stack
│   ├── tracks.md         # Track index
│   ├── state.json        # Current state
│   ├── tracks/           # Active tracks
│   │   └── <track-id>/
│   │       ├── proposal.md
│   │       ├── spec.md
│   │       ├── tasks.xml
│   │       └── metadata.json
│   ├── specs/            # Shared specifications
│   ├── std/              # Standard specs (immutable)
│   │   └── tasks-xml-spec.md
│   └── archive/          # Archived tracks
├── .claude/commands/codument/     # Claude Code commands
├── .codex/prompts/                # Codex CLI prompts
├── .gemini/commands/codument/     # Gemini CLI commands
├── .eidolon/commands/codument/    # Eidolon commands
└── AGENTS.md                      # AI agent entry point
```

## tasks.xml Format

```xml
<?xml version="1.0" encoding="UTF-8"?>
<track change_id="add-user-auth">
  <metadata>
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
          Define User model with username, password hash, email
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
</track>
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
- Attaches Git Notes with change details

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
