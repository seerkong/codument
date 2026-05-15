# Upgrade Workspace

`codument upgrade-workspace` updates the Codument workspace files in the current directory to the latest versions embedded in the Codument binary.

It is designed for projects that already have a `codument/` folder and want to pull in updates (new prompts, schema changes, new assistant commands or skills) without rerunning the interactive `codument init` flow.

## What It Upgrades

- `codument/std/`
  - `AGENTS.md`
  - `plan-xml-spec.md`
  - `workflow.md`
  - `protocols.md`
- Assistant command files for the CLI tools selected in `codument/state.json` (`cli_tools`)
  - Claude Code: `.claude/commands/codument/`
  - CodeFlicker: `.codeflicker/commands/codument/`
  - Codex CLI: `~/.codex/skills/codument-*/`
  - Eidolon: `.eidolon/commands/codument/`
  - Sparrow: `.sparrow/skills/codument-*/`
  - OpenCode: `.opencode/command/`
  - Standalone lifecycle skills: `codument-*` under each selected tool's skill directory

It does NOT modify:

- `codument/tracks/` (active tracks)
- `codument/archive/` (historical tracks)
- `codument/specs/`

## Backup And Rollback

Before overwriting anything, the command creates a backup under:

`./.tmp/codument/upgrade-workspace-<timestamp>/`

The backup mirrors the original paths. Workspace files stay under relative workspace paths (for example `codument/std/workflow.md`). Codex skill backups may appear under a user-home subtree because the source path is under `~/.codex/skills/`. Sparrow skill backups stay under workspace-relative `.sparrow/skills/` paths. Legacy `codument-workflow` directories may be backed up before being removed.

To rollback, copy the files back from the backup directory to the workspace root. Example:

```bash
# Example rollback (pick the exact timestamp directory you need)
cp -R ".tmp/codument/upgrade-workspace-2026-03-01T12-34-56-000Z/codument/std" "codument/"
cp -R ".tmp/codument/upgrade-workspace-2026-03-01T12-34-56-000Z/.opencode/command" ".opencode/"
```

## Usage

```bash
codument upgrade-workspace
```

Options:

- `--no-backup`: skip creating backups (not recommended)
- `--backup-dir <path>`: set a custom backup directory
