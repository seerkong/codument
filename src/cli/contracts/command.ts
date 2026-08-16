import type { ResourceEffect } from '../effects/resource';
import type { WorkspaceEffect } from '../effects/workspace';

export interface CommandRuntime {
  resources: ResourceEffect;
  workspace(root?: string): WorkspaceEffect;
}

export interface CommandContext {
  path: readonly string[];
  args: readonly string[];
  positional: readonly string[];
  options: Readonly<Record<string, string | boolean>>;
  runtime: CommandRuntime;
}

export interface CommandResult {
  code: number;
  message?: string;
  data?: unknown;
}

export interface CommandSchema {
  readonly name: string;
  readonly usage: readonly string[];
  readonly options: readonly string[];
  parse(args: readonly string[], path: readonly string[], runtime: CommandRuntime): CommandContext;
  validate?(context: CommandContext): void;
}

export interface CommandDoc {
  summary: string;
  usage: readonly string[];
  examples: readonly string[];
  options: readonly string[];
  resource?: string;
}

export type CommandRun = (context: CommandContext) => CommandResult | Promise<CommandResult>;

export const argvSchema: CommandSchema = Object.freeze({
  name: 'argv',
  usage: [],
  options: [],
  parse(args: readonly string[], path: readonly string[], runtime: CommandRuntime): CommandContext {
    const positional: string[] = [];
    const options: Record<string, string | boolean> = {};
    let passthrough = false;

    for (let index = 0; index < args.length; index++) {
      const arg = args[index];
      if (passthrough) {
        positional.push(arg);
        continue;
      }
      if (arg === '--') {
        passthrough = true;
        continue;
      }
      if (arg.startsWith('--')) {
        const equals = arg.indexOf('=');
        if (equals >= 0) {
          options[arg.slice(2, equals)] = arg.slice(equals + 1);
          continue;
        }
        const key = arg.slice(2);
        const next = args[index + 1];
        if (next !== undefined && !next.startsWith('-')) {
          options[key] = next;
          index++;
        } else {
          options[key] = true;
        }
        continue;
      }
      if (arg.startsWith('-')) {
        options[arg.slice(1)] = true;
        continue;
      }
      positional.push(arg);
    }

    return Object.freeze({
      path: Object.freeze([...path]),
      args: Object.freeze([...args]),
      positional: Object.freeze(positional),
      options: Object.freeze(options),
      runtime,
    });
  },
});

export function createArgvSchema(
  name: string,
  usage: readonly string[],
  options: readonly string[],
): CommandSchema {
  return Object.freeze({
    ...argvSchema,
    name,
    usage: Object.freeze([...usage]),
    options: Object.freeze([...options]),
  });
}

export function renderCommandResult(result: CommandResult): void {
  if (result.data !== undefined) {
    console.log(JSON.stringify(result.data, null, 2));
  } else if (result.message !== undefined) {
    console.log(result.message);
  }
  if (result.code !== 0) process.exitCode = result.code;
}
