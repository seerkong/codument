import { archiveCommand, archiveMissionCommand } from './commands/archive';
import { artifactSyncCommand } from './commands/artifact';
import { decisionsCommand } from './commands/decisions';
import { engineeringCommand } from './commands/engineering';
import { initCommand } from './commands/init';
import { listCommand } from './commands/list';
import { migrateCommand } from './commands/migrate';
import { modelingCommand } from './commands/modeling';
import { scaffoldBehaviorPatchCommand, scaffoldCommand } from './commands/scaffold';
import { showCommand } from './commands/show';
import { statusCommand } from './commands/status';
import { upgradeTrackCommand } from './commands/upgrade-track';
import { upgradeResourceCommand } from './commands/upgrade-resource';
import { upgradeWorkspaceCommand } from './commands/upgrade-workspace';
import { validateCommand } from './commands/validate';
import { bindMissionTrackCommand, gapRoundCommand, taskCompleteCommand, taskTransitionCommand, trackReadyCommand, trackVerifyCommand, transitionCommand } from './commands/lifecycle';
import { stdLintCommand } from './commands/std';
import { VERSION } from '../version';
import {
  createArgvSchema,
  renderCommandResult,
  type CommandDoc,
  type CommandResult,
  type CommandRuntime,
  type CommandSchema,
} from './contracts/command';
import { createCommandRuntime } from './runtime';

export type CommandHandler = (args: string[]) => void | Promise<void>;
export type RuntimeCommandHandler = (args: string[], runtime: CommandRuntime) => void | Promise<void>;
export interface CommandDefinition {
  name: string;
  summary: string;
  usage: string[];
  examples: string[];
  options?: string[];
  children?: CommandDefinition[];
  doc?: CommandDoc;
  schema?: CommandSchema;
  run?: (context: ReturnType<CommandSchema['parse']>) => CommandResult | Promise<CommandResult>;
}

const helpOption = '-h, --help            Show this help message';
function leaf(
  name: string,
  summary: string,
  usage: string,
  examples: string[],
  handler: CommandHandler,
  options: string[] = [],
): CommandDefinition {
  return leafWithRuntime(name, summary, usage, examples, (args) => handler(args), options);
}

function leafWithRuntime(
  name: string,
  summary: string,
  usage: string,
  examples: string[],
  handler: RuntimeCommandHandler,
  options: string[] = [],
): CommandDefinition {
  const doc: CommandDoc = Object.freeze({ summary, usage: [usage], examples, options });
  return {
    name,
    summary,
    usage: [usage],
    examples,
    options,
    doc,
    schema: createArgvSchema(usage, [usage], options),
    run: async (context) => {
      await handler([...context.args], context.runtime);
      return { code: Number(process.exitCode ?? 0) };
    },
  };
}

export const COMMANDS: readonly CommandDefinition[] = Object.freeze([
  leafWithRuntime('init', 'Initialize Codument in the current project.', 'codument init [path] [options]', [
    'codument init --agent=claude,codex,eidolon',
    'codument init ./my-project --agent=codex',
  ], initCommand, ['--agent <names>       Comma-separated target agent skills dirs', '--skills-dir <path>   Explicit skills destination', '--force               Overwrite existing codument/** files']),
  leafWithRuntime('upgrade-workspace', 'Refresh managed Codument workspace files and installed skill shells.', 'codument upgrade-workspace [options]', [
    'codument upgrade-workspace --json',
    'codument upgrade-workspace --agent=claude,codex,eidolon',
  ], upgradeWorkspaceCommand, ['--agent <names>       Comma-separated target agent skills dirs', '--skills-dir <path>   Explicit skills destination', '--json                Print machine-readable migration receipt']),
  leaf('upgrade-resource', 'Upgrade one legacy resource through the deterministic migration pipeline.', 'codument upgrade-resource <path> [--json]', [
    'codument upgrade-resource codument/tracks/active/example/track.xml --json',
  ], upgradeResourceCommand, ['--json                Print machine-readable JSON']),
  leaf('upgrade-track', 'Upgrade a track plan.xml to the current track.xnl format.', 'codument upgrade-track <track-id|archive-id> [options]', [
    'codument upgrade-track add-user-auth --mode wave',
  ], upgradeTrackCommand, ['--mode <mode>         wave|sequential', '--backup-dir <path>   Explicit backup destination', '--no-backup           Do not create a backup']),
  leaf('list', 'List active tracks or behavior registries.', 'codument list [--behaviors] [--json]', [
    'codument list --json',
    'codument list --behaviors',
  ], listCommand, ['--behaviors           List behavior registry capabilities', '--json                Print machine-readable JSON']),
  leaf('show', 'Show details of a track, spec, or decision registry item.', 'codument show [item] [--type track|spec|decision] [--json] [--include-content]', [
    'codument show add-user-auth --type track --json',
  ], showCommand, ['--type <type>         Disambiguate track, spec, or decision', '--json                Print machine-readable JSON', '--include-content     Include Track file contents in JSON']),
  leaf('validate', 'Validate tracks, behavior deltas, missions, or a selected item.', 'codument validate [item] [--strict]', [
    'codument validate add-user-auth --strict',
    'codument validate --strict',
  ], validateCommand, ['--strict              Treat warnings as failures where supported']),
  leaf('archive', 'Archive a completed track.', 'codument archive <track-id> [options]', [
    'codument archive add-user-auth',
  ], archiveCommand, ['--skip-specs         Skip BehaviorPatch application', '--yes, -y             Confirm archiving a non-completed track']),
  leaf('status', 'Show project status overview.', 'codument status', [
    'codument status',
  ], statusCommand),
  { name: 'modeling', summary: 'Inspect and validate the modeling registry.', usage: ['codument modeling <command>'], examples: ['codument modeling validate codument/modeling'], children: [
    leaf('lint', 'Flag oversized modeling XNL files for fractal split.', 'codument modeling lint [dir] [--max-lines N] [--max-nodes N]', [
      'codument modeling lint codument/modeling --max-lines 400 --max-nodes 8',
    ], (args) => modelingCommand(['lint', ...args])),
    leaf('validate', 'Validate modeling XNL syntax, schema, and hierarchy.', 'codument modeling validate [dir] [--deltas <track>]', [
      'codument modeling validate codument/modeling',
      'codument modeling validate --deltas add-user-auth',
    ], (args) => modelingCommand(['validate', ...args])),
    leaf('scaffold', 'Generate a valid modeling XNL node skeleton.', 'codument modeling scaffold <kind> <name> --plane <plane> --context <ctx> [--track <track>] [--fields a:string,b:int] [--states a,b]', [
      'codument modeling scaffold entity user --plane domain --context todo --fields id:string,email:string',
      'codument modeling scaffold entity user --plane domain --context todo --track add-user-auth',
    ], (args) => modelingCommand(['scaffold', ...args]), ['--plane <plane>        Path plane (domain/backend/surface)',
      '--context <ctx>       Path context',
      '--track <id>          Write into this track\'s modeling_deltas',
      '--fields <a:t,b:t>    Entity/object fields',
      '--states <a,b>        State-machine states or enum values']),
  ] },
  { name: 'engineering', summary: 'Inspect and validate the engineering registry.', usage: ['codument engineering <command>'], examples: ['codument engineering validate codument/engineering'], children: [
    leaf('lint', 'Flag oversized engineering XNL files for fractal split.', 'codument engineering lint [dir] [--max-lines N] [--max-nodes N]', [
      'codument engineering lint codument/engineering --max-lines 400 --max-nodes 8',
    ], (args) => engineeringCommand(['lint', ...args])),
    leaf('validate', 'Validate engineering XNL syntax, schema, and hierarchy.', 'codument engineering validate [dir] [--deltas <track>]', [
      'codument engineering validate codument/engineering',
      'codument engineering validate --deltas add-user-auth',
    ], (args) => engineeringCommand(['validate', ...args])),
    leaf('scaffold', 'Generate a valid engineering XNL node skeleton.', 'codument engineering scaffold <kind> <name> --plane <plane> --category <cat> --topic <topic> [--track <track>]', [
      'codument engineering scaffold rule no_illegal_status --plane backend --category rules --topic state_transitions',
      'codument engineering scaffold howto add_endpoint --plane backend --category howto --topic api --track add-user-auth',
    ], (args) => engineeringCommand(['scaffold', ...args]), ['--plane <plane>        Path plane (global/backend/surface)',
      '--category <cat>      Knowledge category (howto/rules/reference/code-map)',
      '--topic <topic>       Path topic',
      '--track <id>          Write into this track\'s engineering_deltas']),
  ] },
  { name: 'decisions', summary: 'Work with Track and Mission decision forests.', usage: ['codument decisions <command>'], examples: ['codument decisions validate add-user-auth'], children: [
    leaf('create', 'Create or append a versioned Decision skeleton.', 'codument decisions create <file> <decision-id> [--parent <decision-id>]', [
      'codument decisions create codument/tracks/active/add-user-auth/decisions.xnl track.add_user_auth.strategy',
      'codument decisions create codument/tracks/active/add-user-auth/decisions.xnl track.add_user_auth.provider --parent track.add_user_auth.strategy',
    ], (args) => decisionsCommand(['create', ...args]), ['--parent <id>         Append as a child Decision']),
    leaf('validate', 'Validate decisions.xnl or legacy decisions.md.', 'codument decisions validate [file|track-id]', [
      'codument decisions validate add-user-auth',
    ], (args) => decisionsCommand(['validate', ...args])),
    leaf('frontier', 'Compute the ready pending Decision frontier.', 'codument decisions frontier [file|track-id] [--json]', [
      'codument decisions frontier add-user-auth --json',
    ], (args) => decisionsCommand(['frontier', ...args]), ['--json                Print machine-readable JSON']),
  ] },
  { name: 'track', summary: 'Create and manage Track resources.', usage: ['codument track <command>'], examples: ['codument track create add-user-auth --stage pending'], children: [
    leaf('create', 'Create a versioned Track skeleton.', 'codument track create <id> --stage pending|active', [
      'codument track create add-user-auth --stage pending',
    ], (args) => scaffoldCommand('Track', args), ['--stage <stage>     pending|active']),
    leaf('transition', 'Apply an atomic Track lifecycle transition.', 'codument track transition <id> <status> [--json]', [
      'codument track transition add-user-auth in_progress --json',
    ], (args) => transitionCommand('track', args), ['--json                Print machine-readable JSON']),
    leaf('gap-round', 'Set the Track gap-loop round atomically.', 'codument track gap-round <id> <round> [--json]', [
      'codument track gap-round add-user-auth 2 --json',
    ], (args) => gapRoundCommand('track', args), ['--json                Print machine-readable JSON']),
    leaf('ready', 'Show compact ready Track tasks and Gate groups.', 'codument track ready <id> [--json]', [
      'codument track ready add-user-auth --json',
    ], trackReadyCommand, ['--json                Print machine-readable JSON']),
    leaf('verify', 'Run or safely reuse a workspace-bound Track verification.', 'codument track verify <id> [--fresh] [--json] -- <verification-command> [args...]', [
      'codument track verify add-user-auth -- bun test test/auth.test.ts',
    ], trackVerifyCommand, ['--fresh               Ignore reusable evidence and run the command', '--json                Print machine-readable JSON', '--                    End Codument options and start the verification command']),
    { name: 'task', summary: 'Update Track TaskSpace state.', usage: ['codument track task <command>'], examples: ['codument track task transition add-user-auth P1-T1 ACTIVE'], children: [
      leaf('transition', 'Apply an atomic Track task transition.', 'codument track task transition <id> <task-id> <status> [--json]', [
        'codument track task transition add-user-auth P1-T1 ACTIVE --json',
      ], (args) => taskTransitionCommand('track', args), ['--json                Print machine-readable JSON']),
      leaf('complete', 'Run or reuse verification and atomically complete a Track task.', 'codument track task complete <id> <task-id> [--fresh] [--json] -- <verification-command> [args...]', [
        'codument track task complete add-user-auth P1-T1 -- bun test test/auth.test.ts',
      ], taskCompleteCommand, ['--fresh               Ignore reusable evidence and run the command', '--json                Print machine-readable JSON', '--                    End Codument options and start the verification command']),
    ] },
  ] },
  { name: 'mission', summary: 'Create and manage Mission resources.', usage: ['codument mission <command>'], examples: ['codument mission create modernize-auth --stage pending'], children: [
    leaf('create', 'Create a versioned Mission skeleton.', 'codument mission create <id> --stage pending|active', [
      'codument mission create modernize-auth --stage pending',
    ], (args) => scaffoldCommand('Mission', args), ['--stage <stage>     pending|active']),
    leaf('transition', 'Apply an atomic Mission lifecycle transition.', 'codument mission transition <id> <status> [--json]', [
      'codument mission transition modernize-auth active --json',
    ], (args) => transitionCommand('mission', args), ['--json                Print machine-readable JSON']),
    leaf('gap-round', 'Set the Mission gap-loop round atomically.', 'codument mission gap-round <id> <round> [--json]', [
      'codument mission gap-round modernize-auth 2 --json',
    ], (args) => gapRoundCommand('mission', args), ['--json                Print machine-readable JSON']),
    leaf('bind-track', 'Bind a Mission task TrackLink to a real Track.', 'codument mission bind-track <mission-id> <task-id> <track-id> [--json]', [
      'codument mission bind-track modernize-auth M1 add-user-auth --json',
    ], bindMissionTrackCommand, ['--json                Print machine-readable JSON']),
    leaf('archive', 'Archive a terminal Mission transactionally.', 'codument mission archive <id> [--yes]', [
      'codument mission archive modernize-auth',
    ], archiveMissionCommand, ['--yes, -y             Confirm non-terminal or unresolved linked Track state']),
    { name: 'task', summary: 'Update Mission TaskSpace state.', usage: ['codument mission task <command>'], examples: ['codument mission task transition modernize-auth M1 ACTIVE'], children: [
      leaf('transition', 'Apply an atomic Mission task transition.', 'codument mission task transition <id> <task-id> <status> [--json]', [
        'codument mission task transition modernize-auth M1 ACTIVE --json',
      ], (args) => taskTransitionCommand('mission', args), ['--json                Print machine-readable JSON']),
    ] },
  ] },
  { name: 'artifact', summary: 'Distribute an AI-authored artifact staging tree.', usage: ['codument artifact <command>'], examples: ['codument artifact sync --source output/docs --target docs --dry-run'], children: [
    leaf('sync', 'Plan or apply a rollback-capable directory sync.', 'codument artifact sync --source <dir> --target <dir> [options]', [
      'codument artifact sync --source output/docs --target docs --dry-run --json',
    ], artifactSyncCommand, ['--dry-run             Report changes without writing', '--force               Replace conflicting target files', '--json                Print machine-readable JSON']),
  ] },
  { name: 'std', summary: 'Check Codument standard prompts and protocols.', usage: ['codument std <command>'], examples: ['codument std lint src/templates'], children: [
    leaf('lint', 'Reject legacy authoring vocabulary in current prompts.', 'codument std lint [dir] [--json]', [
      'codument std lint src/templates --json',
    ], stdLintCommand, ['--json                Print machine-readable JSON']),
  ] },
  { name: 'behavior-patch', summary: 'Create versioned track-local BehaviorPatch resources.', usage: ['codument behavior-patch <command>'], examples: ['codument behavior-patch create add-user-auth auth'], children: [
    leaf('create', 'Create a versioned BehaviorPatch skeleton.', 'codument behavior-patch create <track-id> <capability>', [
      'codument behavior-patch create add-user-auth auth',
    ], scaffoldBehaviorPatchCommand),
  ] },
  { name: 'migrate', summary: 'Inspect, plan, apply, and verify versioned resource migrations.', usage: ['codument migrate <command>'], examples: ['codument migrate inspect codument/tracks/active/example/track.xml --json'], children: [
    leaf('inspect', 'Inspect format, Kind, apiVersion, and structural fingerprint.', 'codument migrate inspect <path> [--json]', [
      'codument migrate inspect codument/tracks/active/example/track.xml --json',
    ], (args) => migrateCommand('inspect', args), ['--json                Print machine-readable JSON']),
    leaf('plan', 'Select a deterministic migration without writing.', 'codument migrate plan <path> [--json]', [
      'codument migrate plan codument/tracks/active/example/track.xml --json',
    ], (args) => migrateCommand('plan', args), ['--json                Print machine-readable JSON']),
    leaf('apply', 'Apply a validated migration with backup.', 'codument migrate apply <path> [--json]', [
      'codument migrate apply codument/tracks/active/example/track.xml --json',
    ], (args) => migrateCommand('apply', args), ['--json                Print machine-readable JSON']),
    leaf('verify', 'Verify a resource against the current Kind version.', 'codument migrate verify <path> [--json]', [
      'codument migrate verify codument/tracks/active/example/track.xnl --json',
    ], (args) => migrateCommand('verify', args), ['--json                Print machine-readable JSON']),
  ] },
]);

export function commandPaths(): string[][] {
  const out: string[][] = [];
  const visit = (definitions: readonly CommandDefinition[], prefix: string[]) => {
    for (const definition of definitions) {
      const path = [...prefix, definition.name];
      out.push(path);
      if (definition.children) visit(definition.children, path);
    }
  };
  visit(COMMANDS, []);
  return out;
}

export function rootHelp(): string {
  const commands = COMMANDS.map((command) => `  ${command.name.padEnd(20)}${definitionDoc(command).summary}`).join('\n');
  const examples = [
    'codument init --agent=claude,codex,eidolon',
    'codument status',
    'codument validate --strict',
  ].map((line) => `  ${line}`).join('\n');
  return `\ncodument v${VERSION} - Spec-driven development tool for AI coding assistants\n\nUsage:\n  codument <command> [options]\n\nCommands:\n${commands}\n\nExamples:\n${examples}\n\nOptions:\n  -h, --help              Show this help message\n  -v, --version           Show version number\n  -w, --workspace-dir     Set workspace directory (default: current directory)\n`;
}

export function commandHelp(path: string[]): string {
  const resolved = resolveDefinition(path);
  if (!resolved) return rootHelp();
  const definition = resolved.definition;
  const doc = definitionDoc(definition);
  const usage = doc.usage.map((line) => `  ${line}`).join('\n');
  const examples = doc.examples.map((line) => `  ${line}`).join('\n');
  const children = definition.children?.map((child) => `  ${child.name.padEnd(18)}${definitionDoc(child).summary}`).join('\n');
  const options = [...doc.options, helpOption].map((line) => `  ${line}`).join('\n');
  return `\nUsage:\n${usage}\n\n${doc.summary}\n${children ? `\nCommands:\n${children}\n` : ''}\nExamples:\n${examples}\n\nOptions:\n${options}\n`;
}

export async function dispatchCommand(
  args: string[],
  runtime: CommandRuntime = createCommandRuntime(),
): Promise<CommandResult> {
  const resolved = resolveDefinition(args);
  if (!resolved) throw new Error(`Unknown command: ${args.join(' ') || '(none)'}`);
  const definition = resolved.definition;
  if (!definition.run || !definition.schema || !definition.doc) {
    throw new Error(`Missing subcommand for ${args.slice(0, resolved.consumed).join(' ')}`);
  }
  const commandPath = args.slice(0, resolved.consumed);
  const context = definition.schema.parse(args.slice(resolved.consumed), commandPath, runtime);
  definition.schema.validate?.(context);
  const result = await definition.run(context);
  renderCommandResult(result);
  return result;
}

export function resolveCommandPath(args: string[]): string[] {
  const filtered = args.filter((arg) => arg !== '-h' && arg !== '--help');
  const resolved = resolveDefinition(filtered);
  return resolved ? filtered.slice(0, resolved.consumed) : [];
}

function resolveDefinition(args: string[]): { definition: CommandDefinition; consumed: number } | undefined {
  let definitions: readonly CommandDefinition[] = COMMANDS;
  let resolved: CommandDefinition | undefined;
  let consumed = 0;
  for (const arg of args) {
    if (arg.startsWith('-')) break;
    const match = definitions.find((definition) => definition.name === arg);
    if (!match) break;
    resolved = match;
    consumed++;
    definitions = match.children ?? [];
  }
  return resolved ? { definition: resolved, consumed } : undefined;
}

function definitionDoc(definition: CommandDefinition): CommandDoc {
  return definition.doc ?? {
    summary: definition.summary,
    usage: definition.usage,
    examples: definition.examples,
    options: definition.options ?? [],
  };
}
