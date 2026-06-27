import * as path from 'path';
import { parseOptions, CODUMENT_DIR } from '../utils';
import { lintEngineeringRegistry } from '../engineering/lint';
import { loadEngineeringConfig, engineeringEnabled } from '../engineering/config';
import { validateEngineeringTree, type ValidateFinding } from '../engineering/validate';

export async function engineeringCommand(args: string[]) {
  const sub = args[0];
  const rest = args.slice(1);
  switch (sub) {
    case 'lint':
      return engineeringLint(rest);
    case 'validate':
      return engineeringValidate(rest);
    default:
      console.error(`Unknown engineering subcommand: ${sub ?? '(none)'}`);
      console.log('Usage: codument engineering lint [dir] [--max-lines N] [--max-nodes N]');
      console.log('       codument engineering validate [dir] [--deltas <track>]');
      process.exit(1);
  }
}

function engineeringValidate(args: string[]): void {
  const { positional, options } = parseOptions(args);
  const deltaTrack = typeof options.deltas === 'string' ? options.deltas : undefined;

  let dir: string;
  let mode: 'registry' | 'deltas';
  // An explicit [dir] positional is a manual request: bypass the enabled gate.
  let explicit = positional.length > 0;

  if (deltaTrack) {
    dir = path.join(CODUMENT_DIR, 'tracks', deltaTrack, 'engineering_deltas');
    mode = 'deltas';
    explicit = true;
  } else if (positional[0]) {
    dir = positional[0];
    mode = 'registry';
  } else {
    dir = loadEngineeringConfig().registryDir;
    mode = 'registry';
  }

  // Default registry mode is gated; explicit dir / --deltas bypass the gate.
  if (!explicit && !engineeringEnabled()) {
    console.log('engineering disabled，跳过 (set enabled="true" in codument/config/engineering.xml)');
    return;
  }

  const findings = validateEngineeringTree(dir, { mode });
  reportFindings(findings, dir);
}

function reportFindings(findings: ValidateFinding[], dir: string): void {
  if (findings.length === 0) {
    console.log(`✓ engineering validate: no issues in ${dir}`);
    return;
  }

  // Group by file, preserving first-seen order.
  const byFile = new Map<string, ValidateFinding[]>();
  for (const f of findings) {
    const list = byFile.get(f.file);
    if (list) list.push(f);
    else byFile.set(f.file, [f]);
  }

  console.log(`engineering validate: issues in ${dir}:`);
  for (const [file, list] of byFile) {
    console.log(`${file}:`);
    for (const f of list) {
      const where = f.line !== undefined ? ` (line ${f.line})` : '';
      console.log(`  [${f.layer}/${f.severity}] ${f.message}${where}`);
    }
  }

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  console.log(`${errors} error(s), ${warnings} warning(s)`);

  if (errors > 0) process.exit(1);
}

function engineeringLint(args: string[]): void {
  const { positional, options } = parseOptions(args);
  const config = loadEngineeringConfig();
  const dir = positional[0] ?? config.registryDir;
  const thresholds = {
    maxLines: options['max-lines'] ? Number(options['max-lines']) : config.thresholds.maxLines,
    maxNodes: options['max-nodes'] ? Number(options['max-nodes']) : config.thresholds.maxNodes,
  };

  const findings = lintEngineeringRegistry(dir, thresholds);
  if (findings.length === 0) {
    console.log(`✓ engineering lint: no fractal-split candidates in ${dir}`);
    return;
  }

  console.log(`engineering lint: ${findings.length} fractal-split candidate(s) in ${dir}:`);
  for (const f of findings) {
    console.log(
      `  • ${f.file} — ${f.reasons.join(', ')} → consider splitting into a same-name folder (see folder-manifest.md)`,
    );
  }
}
