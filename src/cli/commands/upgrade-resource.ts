import { upgradeResource, type ResourceUpgradeResult } from '../migrations';
import { parseOptions } from '../utils';

export function upgradeResourceCommand(args: string[]): void {
  const { positional, options } = parseOptions(args);
  const file = positional[0];
  if (!file || positional.length !== 1) {
    throw new Error('Usage: codument upgrade-resource <path> [--json]');
  }

  const result = upgradeResource(file);
  if (options.json === true) console.log(JSON.stringify(result, null, 2));
  else report(result);

  if (result.status === 'review-required') process.exitCode = 2;
  if (result.status === 'blocked') process.exitCode = 1;
}

function report(result: ResourceUpgradeResult): void {
  console.log(`upgrade-resource: ${result.status} ${result.path}`);
  if (result.detectedKind) console.log(`  detected : ${result.detectedKind}`);
  if (result.targetKind) console.log(`  target   : ${result.targetKind} ${result.targetApiVersion}`);
  if (result.suggestedTarget) console.log(`  suggest  : ${result.suggestedTarget}`);
  if (result.targetPath) console.log(`  written  : ${result.targetPath}`);
  if (result.backupPath) console.log(`  backup   : ${result.backupPath}`);
  if (result.semanticReviewRecommended) console.log('  review   : compare the converted resource with its backup for semantic parity');
  for (const diagnostic of result.diagnostics) console.log(`  - ${diagnostic}`);
}
