import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseOptions } from '../utils';

interface ArtifactChange {
  path: string;
  status: 'create' | 'update' | 'unchanged';
}

export function artifactSyncCommand(args: string[]): void {
  const { positional, options } = parseOptions(args);
  if (positional.length > 0) throw new Error('Usage: codument artifact sync --source <dir> --target <dir> [--dry-run] [--force] [--json]');
  const source = requiredPath(options.source, '--source');
  const target = requiredPath(options.target, '--target');
  const dryRun = options['dry-run'] === true;
  const force = options.force === true;
  const json = options.json === true;
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) throw new Error(`Artifact source directory does not exist: ${source}`);
  if (isInside(source, target)) throw new Error('Artifact target must not be inside the source tree.');

  const files = collectFiles(source);
  const changes: ArtifactChange[] = files.map((relative) => {
    const from = path.join(source, relative);
    const to = path.join(target, relative);
    if (!fs.existsSync(to)) return { path: relative, status: 'create' };
    if (!fs.statSync(to).isFile()) return { path: relative, status: 'update' };
    return { path: relative, status: fs.readFileSync(from).equals(fs.readFileSync(to)) ? 'unchanged' : 'update' };
  });
  const conflicts = changes.filter((change) => change.status === 'update');
  if (conflicts.length > 0 && !force && !dryRun) {
    report({ status: 'conflict', source, target, changes }, json);
    process.exitCode = 2;
    return;
  }
  if (dryRun) {
    report({ status: 'dry-run', source, target, changes }, json);
    return;
  }

  const backup = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-artifact-'));
  const created: string[] = [];
  try {
    for (const change of changes) {
      if (change.status === 'unchanged') continue;
      const from = path.join(source, change.path);
      const to = path.join(target, change.path);
      if (fs.existsSync(to)) {
        const saved = path.join(backup, change.path);
        fs.mkdirSync(path.dirname(saved), { recursive: true });
        fs.copyFileSync(to, saved);
      } else {
        created.push(to);
      }
      fs.mkdirSync(path.dirname(to), { recursive: true });
      const temp = `${to}.tmp-${process.pid}`;
      fs.copyFileSync(from, temp);
      fs.renameSync(temp, to);
    }
  } catch (error) {
    for (const file of created) fs.rmSync(file, { force: true });
    for (const relative of collectFiles(backup)) {
      const destination = path.join(target, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(backup, relative), destination);
    }
    throw error;
  } finally {
    fs.rmSync(backup, { recursive: true, force: true });
  }
  report({ status: 'synced', source, target, changes }, json);
}

function requiredPath(value: string | boolean | undefined, option: string): string {
  if (typeof value !== 'string') throw new Error(`${option} requires a directory path.`);
  return path.resolve(value);
}

function collectFiles(root: string): string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const candidate = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(candidate);
      else if (entry.isFile()) out.push(path.relative(root, candidate));
    }
  };
  visit(root);
  return out.sort();
}

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function report(result: unknown, json: boolean): void {
  if (json) console.log(JSON.stringify(result, null, 2));
  else console.log(`artifact sync: ${JSON.stringify(result)}`);
}
