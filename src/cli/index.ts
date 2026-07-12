#!/usr/bin/env bun
import { listCommand } from './commands/list';
import { showCommand } from './commands/show';
import { validateCommand } from './commands/validate';
import { statusCommand } from './commands/status';
import { initCommand } from './commands/init';
import { archiveCommand } from './commands/archive';
import { upgradeWorkspaceCommand } from './commands/upgrade-workspace';
import { upgradeTrackCommand } from './commands/upgrade-track';
import { modelingCommand } from './commands/modeling';
import { engineeringCommand } from './commands/engineering';
import { decisionsCommand } from './commands/decisions';
import { setWorkspaceDir } from './utils';
import { VERSION } from '../version';

function helpText(): string {
  return `
codument v${VERSION} - Spec-driven development tool for AI coding assistants

Usage:
  codument <command> [options]

Commands:
  init              Initialize Codument in the current project
  upgrade-workspace  Upgrade workspace Codument files to latest
  upgrade-track      Upgrade a track plan.xml to wave-capable format
  list              List active tracks or specs
  show [item]       Show details of a track or spec
  validate [item]   Validate track or spec format
  archive <id>      Archive a completed track
  status            Show project status overview
  modeling lint     Flag oversized modeling XNL files for fractal split
  modeling validate Validate modeling XNL (syntax + schema + hierarchy)
  engineering lint  Flag oversized engineering XNL files for fractal split
  engineering validate Validate engineering XNL (syntax + schema + hierarchy)
  decisions validate Validate track decisions.xnl (legacy decisions.md supported)

Options:
  -h, --help              Show this help message
  -v, --version           Show version number
  -w, --workspace-dir     Set workspace directory (default: current directory)

Examples:
  codument init --agent=codex,claude,eidolon,sparrow            # Install skills into the target skills dir
  codument init --skills-dir=.claude/skills --force
  codument upgrade-workspace --agent=codex,claude,eidolon,sparrow  # Refresh std + selected agent skills
  codument list                          # List active tracks
  codument show add-user-auth            # Show track details
  codument validate                      # Validate all tracks (track.xml + behavior deltas)
  codument validate add-user-auth        # Validate one track
  codument status                         # Show project status
`;
}

const COMMAND_HELP: Record<string, string> = {
  init: `
Usage:
  codument init [path] [options]

Initialize Codument in the current project.

Options:
  --agent <names>       Comma-separated target agent skills dirs
  --skills-dir <path>   Explicit skills destination
  --force               Overwrite existing codument/** files
  -h, --help            Show this help message
`,
  list: `
Usage:
  codument list [--behaviors]

List active tracks or behavior registries.

Options:
  --behaviors           List behavior registry capabilities
  -h, --help            Show this help message
`,
  show: `
Usage:
  codument show [item] [--json]

Show details of a track or behavior registry item.

Options:
  --json                Print machine-readable JSON
  -h, --help            Show this help message
`,
  validate: `
Usage:
  codument validate [item] [--strict]

Validate tracks, behavior deltas, or a selected item.

Options:
  --strict              Treat warnings as failures where supported
  -h, --help            Show this help message
`,
  archive: `
Usage:
  codument archive <track-id>

Archive a completed track.

Options:
  -h, --help            Show this help message
`,
  status: `
Usage:
  codument status

Show project status overview.

Options:
  -h, --help            Show this help message
`,
  'upgrade-workspace': `
Usage:
  codument upgrade-workspace [options]

Refresh managed Codument workspace files and installed skill shells.

Options:
  --agent <names>       Comma-separated target agent skills dirs
  --skills-dir <path>   Explicit skills destination
  -h, --help            Show this help message
`,
  'upgrade-track': `
Usage:
  codument upgrade-track <track-id|archive-id> [options]

Upgrade a track plan.xml to the current track.xml format.

Options:
  --mode <mode>         wave|sequential
  --backup-dir <path>   Explicit backup destination
  --no-backup           Do not create a backup
  -h, --help            Show this help message
`,
  modeling: `
Usage:
  codument modeling lint [dir] [--max-lines N] [--max-nodes N]
  codument modeling validate [dir] [--deltas <track>]

Inspect and validate the modeling registry.

Options:
  -h, --help            Show this help message
`,
  engineering: `
Usage:
  codument engineering lint [dir] [--max-lines N] [--max-nodes N]
  codument engineering validate [dir] [--deltas <track>]

Inspect and validate the engineering registry.

Options:
  -h, --help            Show this help message
`,
  decisions: `
Usage:
  codument decisions validate [file|track-id]

Validate decision records in decisions.xnl, or legacy decisions.md.

Options:
  -h, --help            Show this help message
`,
};

function hasHelpFlag(args: string[]): boolean {
  return args.some((arg) => arg === '-h' || arg === '--help');
}

function commandHelpText(command: string): string {
  return COMMAND_HELP[command] ?? helpText();
}

async function main() {
  const args = process.argv.slice(2);

  // Parse global options first
  let workspaceDir: string | undefined;
  const filteredArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-w' || args[i] === '--workspace-dir') {
      workspaceDir = args[i + 1];
      i++; // Skip the value
    } else {
      filteredArgs.push(args[i]);
    }
  }

  // Set workspace directory if provided
  if (workspaceDir) {
    setWorkspaceDir(workspaceDir);
  }

  if (filteredArgs.length === 0 || filteredArgs[0] === '-h' || filteredArgs[0] === '--help') {
    console.log(helpText());
    process.exit(0);
  }

  if (filteredArgs[0] === '-v' || filteredArgs[0] === '--version') {
    console.log(`codument v${VERSION}`);
    process.exit(0);
  }

  const command = filteredArgs[0];
  const commandArgs = filteredArgs.slice(1);

  if (hasHelpFlag(commandArgs)) {
    console.log(commandHelpText(command));
    process.exit(0);
  }

  try {
    switch (command) {
      case 'init':
        await initCommand(commandArgs);
        break;
      case 'list':
        await listCommand(commandArgs);
        break;
      case 'show':
        await showCommand(commandArgs);
        break;
      case 'validate':
        await validateCommand(commandArgs);
        break;
      case 'archive':
        await archiveCommand(commandArgs);
        break;
      case 'status':
        await statusCommand(commandArgs);
        break;
      case 'upgrade-workspace':
        await upgradeWorkspaceCommand(commandArgs);
        break;
      case 'upgrade-track':
        await upgradeTrackCommand(commandArgs);
        break;
      case 'modeling':
        await modelingCommand(commandArgs);
        break;
      case 'engineering':
        await engineeringCommand(commandArgs);
        break;
      case 'decisions':
        await decisionsCommand(commandArgs);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.log(helpText());
        process.exit(1);
    }
    process.exit(0);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
