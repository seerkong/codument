import { parseOptions } from '../utils';
import { scaffoldBehaviorPatch, scaffoldKind, type ScaffoldKind, type ScaffoldStage } from '../kinds/registry';

export function scaffoldCommand(kind: ScaffoldKind, args: string[]): void {
  const { positional, options } = parseOptions(args);
  const id = positional[0];
  const stage = options.stage;
  if (!id || positional.length !== 1 || typeof stage !== 'string') {
    throw new Error(`Usage: codument ${kind.toLowerCase()} create <id> --stage pending|active`);
  }
  const result = scaffoldKind(kind, id, stage as ScaffoldStage);
  console.log(`${kind} '${id}' created in ${result.directory}`);
  console.log(`  apiVersion: ${result.apiVersion}`);
  console.log(`  files: ${result.files.join(', ')}`);
}

export function scaffoldBehaviorPatchCommand(args: string[]): void {
  const { positional } = parseOptions(args);
  const [trackId, capability] = positional;
  if (!trackId || !capability || positional.length !== 2) {
    throw new Error('Usage: codument behavior-patch create <track-id> <capability>');
  }
  const result = scaffoldBehaviorPatch(trackId, capability);
  console.log(`BehaviorPatch '${capability}' created for Track '${trackId}' in ${result.directory}`);
  console.log(`  apiVersion: ${result.apiVersion}`);
  console.log(`  files: ${result.files.join(', ')}`);
}
