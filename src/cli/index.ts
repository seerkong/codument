#!/usr/bin/env bun
import { commandHelp, dispatchCommand, resolveCommandPath, rootHelp } from './command-registry';
import { setWorkspaceDir } from './utils';
import { VERSION } from '../version';

interface GlobalArgs {
  commandArgs: string[];
  workspaceDir?: string;
}

function parseGlobalArgs(args: string[]): GlobalArgs {
  const commandArgs: string[] = [];
  let workspaceDir: string | undefined;
  let passthrough = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (passthrough) {
      commandArgs.push(arg);
    } else if (arg === '--') {
      passthrough = true;
      commandArgs.push(arg);
    } else if (arg === '-w' || arg === '--workspace-dir') {
      workspaceDir = args[index + 1];
      if (!workspaceDir) throw new Error(`${arg} requires a directory`);
      index++;
    } else if (arg.startsWith('--workspace-dir=')) {
      workspaceDir = arg.slice('--workspace-dir='.length);
    } else {
      commandArgs.push(arg);
    }
  }
  return { commandArgs, workspaceDir };
}

async function main(): Promise<void> {
  const { commandArgs, workspaceDir } = parseGlobalArgs(process.argv.slice(2));
  if (workspaceDir) setWorkspaceDir(workspaceDir);
  if (commandArgs.length === 0 || commandArgs[0] === '-h' || commandArgs[0] === '--help') {
    console.log(rootHelp());
    return;
  }
  if (commandArgs[0] === '-v' || commandArgs[0] === '--version') {
    console.log(`codument v${VERSION}`);
    return;
  }
  const separator = commandArgs.indexOf('--');
  const codumentArgs = separator < 0 ? commandArgs : commandArgs.slice(0, separator);
  if (codumentArgs.some((arg) => arg === '-h' || arg === '--help')) {
    console.log(commandHelp(resolveCommandPath(commandArgs)));
    return;
  }
  await dispatchCommand(commandArgs);
}

main().catch((error) => {
  console.error('Error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
