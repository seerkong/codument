import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const repoRoot = path.resolve(import.meta.dir, '../../..');
const cli = path.join(repoRoot, 'src/cli/index.ts');

function workspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-scaffold-'));
  fs.mkdirSync(path.join(root, 'codument'), { recursive: true });
  return root;
}

async function run(ws: string, args: string[]): Promise<{ code: number; out: string; err: string }> {
  const proc = Bun.spawn(['bun', 'run', cli, '--workspace-dir', ws, ...args], {
    cwd: repoRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    code: await proc.exited,
    out: await new Response(proc.stdout).text(),
    err: await new Response(proc.stderr).text(),
  };
}

describe('versioned Kind scaffolding', () => {
  it('records the host Git HEAD as modeling and engineering merge baselines', async () => {
    const ws = workspace();
    Bun.spawnSync(['git', 'init'], { cwd: ws });
    Bun.spawnSync(['git', 'config', 'user.name', 'Codument Test'], { cwd: ws });
    Bun.spawnSync(['git', 'config', 'user.email', 'codument@example.invalid'], { cwd: ws });
    fs.writeFileSync(path.join(ws, 'README.md'), '# fixture\n');
    Bun.spawnSync(['git', 'add', 'README.md'], { cwd: ws });
    Bun.spawnSync(['git', 'commit', '-m', 'fixture'], { cwd: ws });
    const head = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: ws }).stdout.toString().trim();

    expect((await run(ws, ['track', 'create', 'capture-registry-base', '--stage', 'pending'])).code).toBe(0);
    const xnl = fs.readFileSync(path.join(ws, 'codument', 'tracks', 'pending', 'capture-registry-base', 'track.xnl'), 'utf8');
    expect(xnl).toContain(`modeling_base_commit = "${head}"`);
    expect(xnl).toContain(`engineering_base_commit = "${head}"`);
  });

  it('creates a pending Track from only id and stage', async () => {
    const ws = workspace();
    const result = await run(ws, ['track', 'create', 'add-cli-scaffold', '--stage', 'pending']);
    const dir = path.join(ws, 'codument', 'tracks', 'pending', 'add-cli-scaffold');

    expect(result.code).toBe(0);
    expect(result.err).toBe('');
    expect(result.out).toContain('codument.tech/v1alpha1');
    expect(fs.readFileSync(path.join(dir, 'track.xnl'), 'utf8')).toContain('apiVersion="codument.tech/v1alpha1"');
    expect(fs.existsSync(path.join(dir, 'track.xml'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'proposal.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'design.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'decisions.xnl'))).toBe(false);
  });

  it('creates an active Mission with the matching default status', async () => {
    const ws = workspace();
    const result = await run(ws, ['mission', 'create', 'adopt-kind-system', '--stage=active']);
    const file = path.join(ws, 'codument', 'missions', 'active', 'adopt-kind-system', 'mission.xnl');

    expect(result.code).toBe(0);
    const xnl = fs.readFileSync(file, 'utf8');
    expect(xnl).toContain('<Mission #adopt-kind-system apiVersion="codument.tech/v1alpha1"');
    expect(xnl).toContain('status = "active"');
    expect(xnl).toContain('<ActorSets { default = "default-control-loop" } [');
    expect(xnl).not.toContain('<Metadata>');
    expect(fs.existsSync(path.join(path.dirname(file), 'decisions.xnl'))).toBe(false);
  });

  it('creates a versioned BehaviorPatch skeleton from track id and capability', async () => {
    const ws = workspace();
    expect((await run(ws, ['track', 'create', 'add-orders', '--stage', 'active'])).code).toBe(0);
    const result = await run(ws, ['behavior-patch', 'create', 'add-orders', 'provider.deepseek']);
    const file = path.join(ws, 'codument', 'tracks', 'active', 'add-orders', 'behavior_deltas', 'provider.deepseek', 'delta.xnl');

    expect(result.code).toBe(0);
    expect(result.err).toBe('');
    expect(result.out).toContain('codument.tech/v1alpha1');
    expect(fs.readFileSync(file, 'utf8')).toContain('<BehaviorPatch #track.add-orders.behavior_patch.provider.deepseek apiVersion="codument.tech/v1alpha1"');
    expect((await run(ws, ['behavior-patch', 'create', 'add-orders', 'provider.deepseek'])).code).toBe(1);
  });

  it('rejects invalid stages, unsafe ids, and overwrites', async () => {
    const ws = workspace();
    expect((await run(ws, ['track', 'create', 'valid-id', '--stage', 'archived'])).code).toBe(1);
    expect((await run(ws, ['track', 'create', '../escape', '--stage', 'pending'])).code).toBe(1);
    expect((await run(ws, ['track', 'create', 'valid-id', '--stage', 'pending'])).code).toBe(0);
    const duplicate = await run(ws, ['track', 'create', 'valid-id', '--stage', 'pending']);
    expect(duplicate.code).toBe(1);
    expect(duplicate.err).toContain('already exists');
  });
});
