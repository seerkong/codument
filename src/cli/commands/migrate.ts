import { parseOptions } from '../utils';
import { applyResourceMigration, inspectResource, planResourceMigration, verifyResource } from '../migrations';

export function migrateCommand(operation: 'inspect' | 'plan' | 'apply' | 'verify', args: string[]): void {
  const { positional, options } = parseOptions(args);
  const file = positional[0];
  if (!file || positional.length !== 1) throw new Error(`Usage: codument migrate ${operation} <path> [--json]`);
  const result = operation === 'inspect' ? inspectResource(file)
    : operation === 'plan' ? planResourceMigration(file)
      : operation === 'apply' ? applyResourceMigration(file)
        : verifyResource(file);
  if (options.json === true) console.log(JSON.stringify(result, null, 2));
  else reportMigration(operation, result as unknown as Record<string, unknown>);
  const status = result as unknown as { status?: string; valid?: boolean };
  if (status.status === 'review-required') process.exitCode = 2;
  if (status.valid === false) process.exitCode = 1;
}

function reportMigration(operation: string, result: Record<string, unknown>): void {
  const status = typeof result.status === 'string' ? result.status : result.valid === true ? 'valid' : result.valid === false ? 'invalid' : 'inspected';
  console.log(`migrate ${operation}: ${status} ${String(result.path ?? '')}`);
  if (result.fingerprint) console.log(`  fingerprint: ${String(result.fingerprint)}`);
  if (result.targetApiVersion) console.log(`  target: ${String(result.targetApiVersion)}`);
  if (result.backupPath) console.log(`  backup: ${String(result.backupPath)}`);
  const diagnostics = Array.isArray(result.diagnostics) ? result.diagnostics : [];
  for (const diagnostic of diagnostics) console.log(`  - ${String(diagnostic)}`);
}
