import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const RECEIPT_VERSION = 1;
const FALLBACK_IGNORED_DIRS = new Set([
  '.git', '.tmp', '.venv', '.e2e-venv', 'node_modules',
  '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache',
]);

export interface VerificationReceipt {
  version: number;
  id: string;
  track: string;
  cwd: string;
  command: string[];
  workspace_fingerprint: string;
  exit_code: 0;
  verified_at: string;
  reused: boolean;
}

export interface VerificationOptions {
  fresh?: boolean;
  captureOutput?: boolean;
}

export function runTrackVerification(
  trackId: string,
  command: string[],
  options: VerificationOptions = {},
): VerificationReceipt {
  if (command.length === 0) throw new Error('Verification command is required.');
  const workspace = process.cwd();
  const trackDir = locateTrackDirectory(trackId);
  const beforeFingerprint = fingerprintWorkspace(workspace, trackDir);
  const beforeId = receiptId(trackId, command, beforeFingerprint);
  const beforePath = receiptPath(trackDir, beforeId);

  if (!options.fresh) {
    const cached = readReceipt(beforePath);
    if (cached && receiptMatches(cached, trackId, command, beforeFingerprint)) {
      return { ...cached, reused: true };
    }
  }

  runVerificationProcess(command, options.captureOutput === true);

  const fingerprint = fingerprintWorkspace(workspace, trackDir);
  const id = receiptId(trackId, command, fingerprint);
  const receipt: VerificationReceipt = {
    version: RECEIPT_VERSION,
    id,
    track: trackId,
    cwd: '.',
    command,
    workspace_fingerprint: fingerprint,
    exit_code: 0,
    verified_at: new Date().toISOString(),
    reused: false,
  };
  const file = receiptPath(trackDir, id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeJsonAtomic(file, receipt);
  return receipt;
}

function runVerificationProcess(command: string[], captureOutput: boolean): void {
  let result: ReturnType<typeof Bun.spawnSync>;
  try {
    result = Bun.spawnSync(command, {
      cwd: process.cwd(),
      stdin: 'inherit',
      stdout: captureOutput ? 'pipe' : 'inherit',
      stderr: captureOutput ? 'pipe' : 'inherit',
    });
  } catch (error) {
    throw new Error(`Verification command could not start: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (captureOutput) {
    if (result.stdout?.length) process.stderr.write(result.stdout);
    if (result.stderr?.length) process.stderr.write(result.stderr);
  }
  if (result.exitCode !== 0) {
    throw new Error(`Verification command failed with exit code ${result.exitCode}; task state was not changed.`);
  }
}

function fingerprintWorkspace(workspace: string, trackDir: string): string {
  const hash = createHash('sha256');
  hash.update('codument-verification-workspace-v1\0');
  const files = gitVisibleFiles(workspace) ?? fallbackFiles(workspace);
  for (const relative of files.sort()) {
    if (isControlPlaneFile(relative, trackDir)) continue;
    const absolute = path.join(workspace, relative);
    hash.update(relative);
    hash.update('\0');
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(absolute);
    } catch {
      hash.update('missing\0');
      continue;
    }
    hash.update(stat.mode & 0o111 ? 'executable\0' : 'regular\0');
    if (stat.isSymbolicLink()) hash.update(fs.readlinkSync(absolute));
    else if (stat.isFile()) hash.update(fs.readFileSync(absolute));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function gitVisibleFiles(workspace: string): string[] | undefined {
  const result = Bun.spawnSync(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: workspace,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (result.exitCode !== 0) return undefined;
  return new TextDecoder().decode(result.stdout)
    .split('\0')
    .filter(Boolean)
    .map(normalizeRelativePath);
}

function fallbackFiles(workspace: string): string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && FALLBACK_IGNORED_DIRS.has(entry.name)) continue;
      const absolute = path.join(dir, entry.name);
      const relative = normalizeRelativePath(path.relative(workspace, absolute));
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() || entry.isSymbolicLink()) out.push(relative);
    }
  };
  visit(workspace);
  return out;
}

function isControlPlaneFile(relative: string, trackDir: string): boolean {
  const normalizedTrack = normalizeRelativePath(trackDir).replace(/\/$/, '');
  if (relative === `${normalizedTrack}/track.xnl`) return true;
  return relative.startsWith(`${normalizedTrack}/analysis/`)
    || relative.startsWith(`${normalizedTrack}/reports/`);
}

function receiptId(trackId: string, command: string[], fingerprint: string): string {
  return `vr-${createHash('sha256')
    .update(JSON.stringify({ version: RECEIPT_VERSION, track: trackId, cwd: '.', command, fingerprint }))
    .digest('hex')
    .slice(0, 20)}`;
}

function receiptPath(trackDir: string, id: string): string {
  return path.join(trackDir, 'reports', 'verification', `${id}.json`);
}

function readReceipt(file: string): VerificationReceipt | undefined {
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as VerificationReceipt;
  } catch {
    return undefined;
  }
}

function receiptMatches(
  receipt: VerificationReceipt,
  trackId: string,
  command: string[],
  fingerprint: string,
): boolean {
  return receipt.version === RECEIPT_VERSION
    && receipt.track === trackId
    && receipt.cwd === '.'
    && receipt.workspace_fingerprint === fingerprint
    && receipt.exit_code === 0
    && JSON.stringify(receipt.command) === JSON.stringify(command);
}

function writeJsonAtomic(file: string, value: unknown): void {
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try {
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

function locateTrackDirectory(trackId: string): string {
  for (const stage of ['active', 'pending']) {
    const dir = path.join('codument', 'tracks', stage, trackId);
    if (fs.existsSync(path.join(dir, 'track.xnl'))) return dir;
  }
  throw new Error(`track '${trackId}' was not found in pending or active lifecycle directories.`);
}

function normalizeRelativePath(value: string): string {
  return value.split(path.sep).join('/').replace(/^\.\//, '');
}
