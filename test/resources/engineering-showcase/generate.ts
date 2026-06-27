import * as fs from 'fs';
import * as path from 'path';
import type { XnlNode } from 'xnl-core';
import { loadEngineeringRegistry, saveEngineeringFile } from '../../../src/cli/engineering/registry';
import { mergeEngineering } from '../../../src/cli/engineering/merge';

const ROOT = path.dirname(new URL(import.meta.url).pathname);

function rm(dir: string): void {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src: string, dst: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function nodes(dir: string): XnlNode[] {
  return [...loadEngineeringRegistry(dir).files.values()].flat();
}

rm(path.join(ROOT, 'ours'));
copyDir(path.join(ROOT, 'base'), path.join(ROOT, 'ours'));
copyDir(path.join(ROOT, 'ours-overlay'), path.join(ROOT, 'ours'));

const base = nodes(path.join(ROOT, 'base'));
const ours = nodes(path.join(ROOT, 'ours'));
const theirs = nodes(path.join(ROOT, 'theirs'));
const { merged, conflicts } = mergeEngineering(base, ours, theirs);
if (conflicts.length > 0) throw new Error(`unexpected conflicts: ${JSON.stringify(conflicts)}`);

rm(path.join(ROOT, 'merged'));
saveEngineeringFile(path.join(ROOT, 'merged'), path.join('global', 'combined', 'index.xnl'), [...merged.values()]);
fs.writeFileSync(
  path.join(ROOT, 'merged', 'CHANGES.md'),
  '# Engineering Merge Result\n\nbase + ours + theirs -> merged, 0 conflicts.\n',
);
