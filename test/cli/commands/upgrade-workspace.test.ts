import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const repoRoot = path.resolve(import.meta.dir, '../../..');
const cli = path.join(repoRoot, 'src/cli/index.ts');

function tmpWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-upgrade-workspace-'));
}

function writeFile(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf-8');
}

describe('codument upgrade-workspace', () => {
  it('moves standard attractors under std/attractors and preserves project attractors', async () => {
    const ws = tmpWorkspace();
    const skillsDir = path.join(ws, '.skills');

    writeFile(path.join(ws, 'codument', 'std', 'AGENTS.md'), '# old std\n');
    writeFile(path.join(ws, 'codument', 'config', 'cli-tools.json'), JSON.stringify({ tools: ['claude'] }, null, 2));
    writeFile(path.join(ws, 'codument', 'attractors', 'project.md'), '# custom project\n');
    writeFile(path.join(ws, 'codument', 'attractors', 'product.md'), '# custom product\n');
    writeFile(path.join(ws, 'codument', 'attractors', 'knowledge-tiers.md'), '# old knowledge\n');
    writeFile(path.join(ws, 'codument', 'attractors', 'model-driven-docs.md'), '# old docs\n');
    writeFile(path.join(ws, 'codument', 'attractors', 'project-memory.md'), '# old memory\n');
    writeFile(path.join(ws, 'AGENTS.md'), '# Existing project notes\n');

    const proc = Bun.spawn([
      'bun',
      'run',
      cli,
      '--workspace-dir',
      ws,
      'upgrade-workspace',
      '--skills-dir',
      skillsDir,
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
    expect(out).toContain('Codument workspace upgraded.');

    expect(fs.readFileSync(path.join(ws, 'codument', 'attractors', 'project.md'), 'utf-8')).toBe('# custom project\n');
    expect(fs.readFileSync(path.join(ws, 'codument', 'attractors', 'product.md'), 'utf-8')).toBe('# custom product\n');
    expect(fs.existsSync(path.join(ws, 'codument', 'attractors', 'knowledge-tiers.md'))).toBe(false);
    expect(fs.existsSync(path.join(ws, 'codument', 'attractors', 'model-driven-docs.md'))).toBe(false);
    expect(fs.existsSync(path.join(ws, 'codument', 'attractors', 'project-memory.md'))).toBe(false);

    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'attractors', 'knowledge-tiers.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'attractors', 'model-driven-docs.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'attractors', 'project-memory.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'codument', 'std', 'attractors', 'depa-attractor.md'))).toBe(true);

    const agents = fs.readFileSync(path.join(ws, 'AGENTS.md'), 'utf-8');
    expect(agents).toContain('@/codument/std/attractors/knowledge-tiers.md');
    expect(agents).toContain('# Existing project notes');
  });
});
