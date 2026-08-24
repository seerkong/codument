import * as path from 'path';
import { parseOptions, resolveLifecycleTrackDir } from '../utils';
import { lintModelingRegistry } from '../modeling/lint';
import { loadModelingConfig, modelingEnabled } from '../modeling/config';
import { validateModelingTree, type ValidateFinding } from '../modeling/validate';
import { scaffoldModelingDelta } from '../modeling/scaffold';

export async function modelingCommand(args: string[]) {
  const sub = args[0];
  const rest = args.slice(1);
  switch (sub) {
    case 'lint':
      return modelingLint(rest);
    case 'validate':
      return modelingValidate(rest);
    case 'scaffold':
      return modelingScaffold(rest);
    default:
      console.error(`Unknown modeling subcommand: ${sub ?? '(none)'}`);
      console.log('Usage: codument modeling lint [dir] [--max-lines N] [--max-nodes N]');
      console.log('       codument modeling validate [dir] [--deltas <track>]');
      console.log('       codument modeling scaffold <kind> <name> --plane <plane> --context <ctx> [--fields a:string,b:int] [--states a,b]');
      process.exit(1);
  }
}

function modelingValidate(args: string[]): void {
  const { positional, options } = parseOptions(args);
  const json = args.includes('--json');
  const deltaTrack = typeof options.deltas === 'string' ? options.deltas : undefined;

  let dir: string;
  let mode: 'registry' | 'deltas';
  // An explicit [dir] positional is a manual request: bypass the enabled gate.
  let explicit = positional.length > 0;

  if (deltaTrack) {
    const trackDir = resolveLifecycleTrackDir(deltaTrack);
    if (!trackDir) {
      console.error(`Track '${deltaTrack}' not found in codument/tracks/{active,pending}.`);
      process.exit(1);
    }
    dir = path.join(trackDir, 'modeling_deltas');
    mode = 'deltas';
    explicit = true;
  } else if (positional[0]) {
    dir = positional[0];
    mode = 'registry';
  } else {
    dir = loadModelingConfig().registryDir;
    mode = 'registry';
  }

  // Default registry mode is gated; explicit dir / --deltas bypass the gate.
  if (!explicit && !modelingEnabled()) {
    console.log('modeling disabled，跳过 (set enabled="true" in codument/config/modeling.xnl)');
    return;
  }

  const findings = validateModelingTree(dir, { mode });
  if (json) {
    console.log(JSON.stringify(findings, null, 2));
    if (findings.some((f) => f.severity === 'error')) process.exit(1);
  } else {
    reportFindings(findings, dir);
  }
}

function reportFindings(findings: ValidateFinding[], dir: string): void {
  if (findings.length === 0) {
    console.log(`✓ modeling validate: no issues in ${dir}`);
    return;
  }

  // Group by file, preserving first-seen order.
  const byFile = new Map<string, ValidateFinding[]>();
  for (const f of findings) {
    const list = byFile.get(f.file);
    if (list) list.push(f);
    else byFile.set(f.file, [f]);
  }

  console.log(`modeling validate: issues in ${dir}:`);
  for (const [file, list] of byFile) {
    console.log(`${file}:`);
    for (const f of list) {
      const where = f.line !== undefined ? ` (line ${f.line})` : '';
      const rule = f.rule ? ` [${f.rule}]` : '';
      console.log(`  [${f.layer}/${f.severity}]${rule} ${f.message}${where}`);
      if (f.fix_hint) {
        console.log(`    fix_hint: ${f.fix_hint}`);
      }
    }
  }

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  console.log(`${errors} error(s), ${warnings} warning(s)`);

  if (errors > 0) process.exit(1);
}

function modelingScaffold(args: string[]): void {
  const { positional, options } = parseOptions(args);
  const [kind, name] = positional;
  const plane = options.plane;
  const context = options.context;
  if (!kind || !name || typeof plane !== 'string' || typeof context !== 'string') {
    throw new Error('Usage: codument modeling scaffold <kind> <name> --plane <plane> --context <ctx> [--track <track>] [--fields a:string,b:int] [--states a,b]');
  }
  const fields = typeof options.fields === 'string' ? options.fields.split(',') : [];
  const states = typeof options.states === 'string' ? options.states.split(',') : [];
  const outDir = resolveModelingScaffoldDir(plane, options.track);
  const file = scaffoldModelingDelta(kind, name, { plane, context, fields, states });
  const absDir = path.join(outDir, `${context}.xnl`);
  const fs = awaitImportFs();
  fs.mkdirSync(path.dirname(absDir), { recursive: true });
  fs.appendFileSync(absDir, file);
  console.log(`modeling scaffold: ${kind} '${name}' appended to ${absDir}`);
}

function resolveModelingScaffoldDir(plane: string, trackOpt: string | boolean | undefined): string {
  // --track <id> writes into that track's modeling_deltas/<plane>/; default (registry mode)
  // writes into codument/modeling/<plane>/<context>/index.xnl.
  if (typeof trackOpt === 'string' && trackOpt) {
    const trackDir = resolveLifecycleTrackDir(trackOpt);
    if (!trackDir) throw new Error(`Track '${trackOpt}' not found`);
    return path.join(trackDir, 'modeling_deltas', plane);
  }
  return path.join(process.cwd(), 'codument', 'modeling', plane);
}

function awaitImportFs(): typeof import('fs') {
  return require('fs') as typeof import('fs');
}

function modelingLint(args: string[]): void {
  const { positional, options } = parseOptions(args);
  const config = loadModelingConfig();
  const dir = positional[0] ?? config.registryDir;
  const thresholds = {
    maxLines: options['max-lines'] ? Number(options['max-lines']) : config.thresholds.maxLines,
    maxNodes: options['max-nodes'] ? Number(options['max-nodes']) : config.thresholds.maxNodes,
  };

  const findings = lintModelingRegistry(dir, thresholds);
  if (findings.length === 0) {
    console.log(`✓ modeling lint: no fractal-split candidates in ${dir}`);
    return;
  }

  console.log(`modeling lint: ${findings.length} fractal-split candidate(s) in ${dir}:`);
  for (const f of findings) {
    console.log(
      `  • ${f.file} — ${f.reasons.join(', ')} → consider splitting into a same-name folder (see folder-manifest.md)`,
    );
  }
}
