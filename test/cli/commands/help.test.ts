import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { COMMANDS, commandHelp, commandPaths, rootHelp } from '../../../src/cli/command-registry';

const repoRoot = path.resolve(import.meta.dir, '../../..');
const cli = path.join(repoRoot, 'src/cli/index.ts');

const HELP_CASES = commandPaths();

function tmpWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-help-'));
}

describe('codument help', () => {
  it('derives help coverage from the recursive command registry', () => {
    expect(HELP_CASES).toContainEqual(['modeling', 'validate']);
    expect(HELP_CASES).toContainEqual(['track', 'create']);
    expect(HELP_CASES).toContainEqual(['mission', 'create']);
    expect(HELP_CASES).toContainEqual(['behavior-patch', 'create']);
  });

  it('registers examples for every command and subcommand', () => {
    const visit = (definitions: typeof COMMANDS): void => {
      for (const definition of definitions) {
        expect(definition.examples.length).toBeGreaterThan(0);
        expect(definition.examples.every((example) => example.startsWith('codument '))).toBe(true);
        if (definition.children) visit(definition.children);
      }
    };
    visit(COMMANDS);
  });

  it('registers the complete leaf command protocol', () => {
    const visit = (definitions: typeof COMMANDS): void => {
      for (const definition of definitions) {
        if (definition.children) {
          visit(definition.children);
          continue;
        }
        expect(definition.doc, definition.name).toBeDefined();
        expect(definition.schema, definition.name).toBeDefined();
        expect(definition.run, definition.name).toBeFunction();
        expect(definition.schema?.usage).toEqual(definition.doc?.usage);
        expect(definition.schema?.options).toEqual(definition.doc?.options);
        expect('handler' in definition, definition.name).toBe(false);
      }
    };
    visit(COMMANDS);
  });

  it('renders examples in root and command help', () => {
    expect(rootHelp()).toContain('Examples:');
    expect(rootHelp()).toContain('codument init --agent=claude,codex,eidolon');
    expect(commandHelp(['init'])).toContain('codument init --agent=claude,codex,eidolon');
    expect(commandHelp(['upgrade-workspace'])).toContain('codument upgrade-workspace --agent=claude,codex,eidolon');
    for (const commandArgs of HELP_CASES) {
      expect(commandHelp(commandArgs)).toContain('Examples:');
    }
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
        expect(out).toContain('Examples:');
        expect(out).toContain('-h, --help');
        expect(out).not.toContain('Codument initialized.');
        expect(out).not.toContain('Codument workspace upgraded.');
        expect(fs.existsSync(path.join(ws, 'codument'))).toBe(false);
        expect(fs.existsSync(path.join(ws, '.tmp', 'codument'))).toBe(false);
      });
    }
  }
});
