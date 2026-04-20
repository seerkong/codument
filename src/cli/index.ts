#!/usr/bin/env bun
import { listCommand } from './commands/list';
import { showCommand } from './commands/show';
import { validateCommand } from './commands/validate';
import { statusCommand } from './commands/status';
import { initCommand } from './commands/init';
import { archiveCommand } from './commands/archive';
import { upgradeWorkspaceCommand } from './commands/upgrade-workspace';
import { upgradeTrackCommand } from './commands/upgrade-track';
import { setWorkspaceDir } from './utils';
import { VERSION } from '../version';

const HELP = `
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

Options:
  -h, --help              Show this help message
  -v, --version           Show version number
  -w, --workspace-dir     Set workspace directory (default: current directory)

Examples:
  codument init                          # Initialize Codument with CLI tool selection
  codument init --agent=claude,codex    # Initialize without target prompts
  codument upgrade-workspace             # Upgrade codument/std + assistant commands
  codument upgrade-track add-user-auth    # Upgrade a track to wave-capable format
  codument list                          # List active tracks
  codument list --specs                  # List specifications
  codument show add-user-auth            # Show track details
  codument validate --strict             # Validate all with strict mode
  codument status                         # Show project status
  codument status -w /path/to/project    # Show status for specific project
`;

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
    console.log(HELP);
    process.exit(0);
  }

  if (filteredArgs[0] === '-v' || filteredArgs[0] === '--version') {
    console.log(`codument v${VERSION}`);
    process.exit(0);
  }

  const command = filteredArgs[0];
  const commandArgs = filteredArgs.slice(1);

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
      default:
        console.error(`Unknown command: ${command}`);
        console.log(HELP);
        process.exit(1);
    }
    process.exit(0);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
