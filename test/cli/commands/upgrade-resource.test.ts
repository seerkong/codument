import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const CLI = path.join(ROOT, 'src/cli/index.ts');

function workspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-upgrade-resource-'));
  fs.mkdirSync(path.join(root, 'codument'), { recursive: true });
  fs.writeFileSync(path.join(root, 'codument', 'state.json'), '{}\n');
  return root;
}

async function run(root: string, ...args: string[]) {
  const process = Bun.spawn(['bun', 'run', CLI, '--workspace-dir', root, ...args], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: await process.exited,
    stdout: await new Response(process.stdout).text(),
    stderr: await new Response(process.stderr).text(),
  };
}

describe('codument upgrade-resource', () => {
  it('runs the deterministic migration pipeline and reports the target', async () => {
    const root = workspace();
    const source = path.join(root, 'codument', 'tracks', 'active', 'example', 'track.xml');
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, '<Track id="example"><Metadata><Status>new</Status></Metadata></Track>\n');

    const result = await run(root, 'upgrade-resource', source, '--json');
    const receipt = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(receipt).toMatchObject({
      status: 'upgraded',
      detectedKind: 'Track',
      targetKind: 'Track',
      semanticReviewRecommended: true,
    });
    expect(fs.existsSync(source)).toBe(false);
    expect(fs.existsSync(path.join(path.dirname(source), 'track.xnl'))).toBe(true);
  });

  it('identifies legacy Decision Markdown and leaves it for AI review', async () => {
    const root = workspace();
    const source = path.join(root, 'codument', 'tracks', 'active', 'example', 'decisions.md');
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, '# Decisions\n\n## D1\nKeep the evidence.\n');

    const result = await run(root, 'upgrade-resource', source, '--json');
    const receipt = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(2);
    expect(receipt).toMatchObject({
      status: 'review-required',
      detectedFormat: 'markdown',
      detectedKind: 'decision',
      targetKind: 'decision',
    });
    expect(receipt.suggestedTarget).toContain('decisions/<business-domain>/<topic>.xnl');
    expect(receipt.backupPath).toContain('.tmp/codument/migrations/');
    expect(fs.readFileSync(path.join(root, receipt.backupPath), 'utf8')).toContain('Keep the evidence.');
    expect(fs.readFileSync(source, 'utf8')).toContain('Keep the evidence.');
  });

  it('keeps help side-effect free', async () => {
    const root = workspace();
    const marker = path.join(root, 'codument', 'marker.txt');
    fs.writeFileSync(marker, 'unchanged');

    const result = await run(root, 'upgrade-resource', '--help');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('codument upgrade-resource <path>');
    expect(fs.readFileSync(marker, 'utf8')).toBe('unchanged');
  });
});
