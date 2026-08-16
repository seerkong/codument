import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const repoRoot = path.resolve(import.meta.dir, '../../..');
const cli = path.join(repoRoot, 'src/cli/index.ts');

async function lint(root: string) {
  const proc = Bun.spawn(['bun', 'run', cli, 'std', 'lint', root, '--json'], {
    cwd: repoRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return { code: await proc.exited, out: await new Response(proc.stdout).text() };
}

describe('codument std lint', () => {
  it('rejects legacy authoring vocabulary outside compatibility docs', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-std-lint-'));
    fs.mkdirSync(path.join(root, 'operations'), { recursive: true });
    fs.writeFileSync(path.join(root, 'operations', 'bad.md'), [
      'write <cdt:GapLoop child-mode="sequential"> here',
      '<Task id="T1" status="DONE">',
      '任务置为 DONE',
      'use 兼容 fallback',
      'Move an approved track to ../active/id',
      '更新根属性 updated_at',
      '<Hook on> with status-in-XML and <Needs>',
      '回写各 Task status',
      '',
    ].join('\n'));
    const result = await lint(root);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.out).map((finding: { rule: string }) => finding.rule)).toEqual([
      'std.legacy.cdt-authoring',
      'std.legacy.hyphenated-xnl-field',
      'std.legacy.xml-node-authoring',
      'std.manual-lifecycle-write',
      'std.manual-write-fallback',
      'std.manual-authority-move',
      'std.manual-system-field-write',
      'std.legacy.workflow-xnl',
      'std.manual-lifecycle-write',
    ]);
  });

  it('allows historical vocabulary in compatibility docs', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-std-lint-'));
    fs.mkdirSync(path.join(root, 'compat'), { recursive: true });
    fs.writeFileSync(path.join(root, 'compat', 'legacy.md'), 'legacy <cdt:GapLoop>\n');
    const result = await lint(root);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toEqual([]);
  });

  it('recognizes nested compatibility and spec directories when scanning all templates', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-template-lint-'));
    fs.mkdirSync(path.join(root, 'codument', 'std', 'compat'), { recursive: true });
    fs.mkdirSync(path.join(root, 'codument', 'std', 'spec'), { recursive: true });
    fs.writeFileSync(path.join(root, 'codument', 'std', 'compat', 'legacy.md'), 'legacy <cdt:GapLoop child-mode="dag">\n');
    fs.writeFileSync(path.join(root, 'codument', 'std', 'spec', 'xnl.md'), 'current XNL does not use cdt: prefixes\n');
    const result = await lint(root);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toEqual([]);
  });
});
