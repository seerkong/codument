import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const repoRoot = path.resolve(import.meta.dir, '../../..');
const cli = path.join(repoRoot, 'src/cli/index.ts');

const HELP_CASES: string[][] = [
  ['init'],
  ['list'],
  ['show'],
  ['validate'],
  ['archive'],
  ['status'],
  ['upgrade-workspace'],
  ['upgrade-track'],
  ['modeling'],
  ['modeling', 'lint'],
  ['modeling', 'validate'],
  ['engineering'],
  ['engineering', 'lint'],
  ['engineering', 'validate'],
  ['decisions'],
  ['decisions', 'validate'],
];

function tmpWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-help-'));
}

function topLevelSwitchCommands(): string[] {
  const source = fs.readFileSync(cli, 'utf-8');
  return [...source.matchAll(/case '([^']+)':/g)].map((match) => match[1]).sort();
}

describe('codument help', () => {
  it('has help coverage for every top-level command in the dispatcher', () => {
    const covered = [...new Set(HELP_CASES.map((args) => args[0]))].sort();
    expect(covered).toEqual(topLevelSwitchCommands());
  });

  for (const helpFlag of ['--help', '-h']) {
    for (const commandArgs of HELP_CASES) {
      it(`prints help and does not execute side effects for codument ${commandArgs.join(' ')} ${helpFlag}`, async () => {
        const ws = tmpWorkspace();
        const proc = Bun.spawn([
          'bun',
          'run',
          cli,
          '--workspace-dir',
          ws,
          ...commandArgs,
          helpFlag,
        ], {
          cwd: repoRoot,
          stdout: 'pipe',
          stderr: 'pipe',
        });

        const code = await proc.exited;
        const out = await new Response(proc.stdout).text();
        const err = await new Response(proc.stderr).text();

        expect(err).toBe('');
        expect(code).toBe(0);
        expect(out).toContain('Usage:');
        expect(out).toContain('-h, --help');
        expect(out).not.toContain('Codument initialized.');
        expect(out).not.toContain('Codument workspace upgraded.');
        expect(fs.existsSync(path.join(ws, 'codument'))).toBe(false);
        expect(fs.existsSync(path.join(ws, '.tmp', 'codument'))).toBe(false);
      });
    }
  }
});
