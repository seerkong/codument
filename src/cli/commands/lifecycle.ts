import { bindMissionTrack, completeTrackTask, readyTrackTasks, setGapRound, transitionResource, transitionTask, type ResourceKind } from '../resources/lifecycle';
import { runTrackVerification } from '../track/verification';
import { parseOptions } from '../utils';

export function transitionCommand(kind: ResourceKind, args: string[]): void {
  const { positional, options } = parseOptions(args);
  const [id, status] = positional;
  if (!id || !status || positional.length !== 2) {
    throw new Error(`Usage: codument ${kind} transition <id> <status> [--json]`);
  }
  report(transitionResource(kind, id, status), options.json === true);
}

export function taskTransitionCommand(kind: ResourceKind, args: string[]): void {
  const { positional, options } = parseOptions(args);
  const [id, taskId, status] = positional;
  if (!id || !taskId || !status || positional.length !== 3) {
    throw new Error(`Usage: codument ${kind} task transition <id> <task-id> <status> [--json]`);
  }
  report(transitionTask(kind, id, taskId, status), options.json === true);
}

export function taskCompleteCommand(args: string[]): void {
  const { before, command } = parseVerificationArgs(args,
    'codument track task complete <id> <task-id> [--fresh] [--json] -- <verification-command> [args...]');
  const { positional, options } = parseOptions(before);
  const [id, taskId] = positional;
  if (!id || !taskId || positional.length !== 2 || command.length === 0) {
    throw new Error('Usage: codument track task complete <id> <task-id> [--fresh] [--json] -- <verification-command> [args...]');
  }

  const json = options.json === true;
  report(completeTrackTask(id, taskId, () => runTrackVerification(id, command, {
    fresh: options.fresh === true,
    captureOutput: json,
  })), json);
}

export function trackVerifyCommand(args: string[]): void {
  const { before, command } = parseVerificationArgs(args,
    'codument track verify <id> [--fresh] [--json] -- <verification-command> [args...]');
  const { positional, options } = parseOptions(before);
  const [id] = positional;
  if (!id || positional.length !== 1 || command.length === 0) {
    throw new Error('Usage: codument track verify <id> [--fresh] [--json] -- <verification-command> [args...]');
  }
  const json = options.json === true;
  report(runTrackVerification(id, command, {
    fresh: options.fresh === true,
    captureOutput: json,
  }), json);
}

function parseVerificationArgs(args: string[], usage: string): { before: string[]; command: string[] } {
  const separator = args.indexOf('--');
  if (separator < 0) throw new Error(`Usage: ${usage}`);
  return { before: args.slice(0, separator), command: args.slice(separator + 1) };
}

export function trackReadyCommand(args: string[]): void {
  const { positional, options } = parseOptions(args);
  const [id] = positional;
  if (!id || positional.length !== 1) throw new Error('Usage: codument track ready <id> [--json]');
  const result = readyTrackTasks(id);
  if (options.json === true) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.ready.length === 0) {
    console.log(`No ready Track tasks for '${id}'.`);
    return;
  }
  for (const task of result.ready) {
    const criteria = task.criteria.total > 0 ? ` criteria=${task.criteria.checked}/${task.criteria.total}` : '';
    console.log(`${task.id}\t${task.kind}\t${task.status}${criteria}\t${task.name ?? ''}`.trimEnd());
  }
}

export function bindMissionTrackCommand(args: string[]): void {
  const { positional, options } = parseOptions(args);
  const [missionId, taskId, trackId] = positional;
  if (!missionId || !taskId || !trackId || positional.length !== 3) {
    throw new Error('Usage: codument mission bind-track <mission-id> <task-id> <track-id> [--json]');
  }
  report(bindMissionTrack(missionId, taskId, trackId), options.json === true);
}

export function gapRoundCommand(kind: ResourceKind, args: string[]): void {
  const { positional, options } = parseOptions(args);
  const [id, rawRound] = positional;
  if (!id || rawRound === undefined || positional.length !== 2) {
    throw new Error(`Usage: codument ${kind} gap-round <id> <round> [--json]`);
  }
  report(setGapRound(kind, id, Number(rawRound)), options.json === true);
}

function report(receipt: unknown, json: boolean): void {
  if (json) console.log(JSON.stringify(receipt, null, 2));
  else console.log(`✓ ${JSON.stringify(receipt)}`);
}
