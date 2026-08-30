import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const repoRoot = path.resolve(import.meta.dir, '../../..');
const cli = path.join(repoRoot, 'src/cli/index.ts');

function temporaryDirectory(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function linkDirectory(target: string, link: string): void {
  fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
}

function linkedWorkspace(target: string): string {
  const workspace = temporaryDirectory('codument-linked-workspace-');
  linkDirectory(target, path.join(workspace, 'codument'));
  return workspace;
}

async function run(workspace: string, args: string[]): Promise<{ code: number; out: string; err: string }> {
  const proc = Bun.spawn(['bun', 'run', cli, '--workspace-dir', workspace, ...args], {
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

describe('Codument directory links', () => {
  it('keeps regular-directory initialization as the default', async () => {
    const workspace = temporaryDirectory('codument-regular-workspace-');
    const result = await run(workspace, ['init', '--skills-dir', path.join(workspace, '.skills')]);

    expect(result.code).toBe(0);
    expect(result.err).toBe('');
    const stat = fs.lstatSync(path.join(workspace, 'codument'));
    expect(stat.isDirectory()).toBe(true);
    expect(stat.isSymbolicLink()).toBe(false);
  });

  it('initializes and upgrades through an existing directory link without replacing it', async () => {
    const sharedRoot = temporaryDirectory('codument-shared-root-');
    const workspace = linkedWorkspace(sharedRoot);
    const skills = path.join(workspace, '.skills');

    const initialized = await run(workspace, ['init', '--skills-dir', skills]);
    expect(initialized.code).toBe(0);
    expect(initialized.err).toBe('');
    expect(fs.lstatSync(path.join(workspace, 'codument')).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(path.join(sharedRoot, 'manifest.xnl'))).toBe(true);

    const workflow = path.join(sharedRoot, 'std', 'methods', 'workflow.md');
    fs.writeFileSync(workflow, '# stale workflow\n');
    const upgraded = await run(workspace, ['upgrade-workspace', '--skills-dir', skills]);

    expect(upgraded.code).toBe(0);
    expect(upgraded.err).toBe('');
    expect(fs.lstatSync(path.join(workspace, 'codument')).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(workflow, 'utf8')).toContain('Workspace 根');

    const backupNames = fs.readdirSync(path.join(workspace, '.tmp', 'codument'));
    expect(backupNames).toHaveLength(1);
    const backupWorkflow = path.join(
      workspace,
      '.tmp',
      'codument',
      backupNames[0],
      'codument',
      'std',
      'methods',
      'workflow.md',
    );
    expect(fs.readFileSync(backupWorkflow, 'utf8')).toBe('# stale workflow\n');
    expect(fs.existsSync(path.join(sharedRoot, '.tmp'))).toBe(false);
  });

  it('shares bindings and resource mutations between workspaces linked to the same target', async () => {
    const sharedRoot = temporaryDirectory('codument-shared-root-');
    const firstWorkspace = linkedWorkspace(sharedRoot);
    const secondWorkspace = linkedWorkspace(sharedRoot);
    expect((await run(firstWorkspace, ['init', '--skills-dir', path.join(firstWorkspace, '.skills')])).code).toBe(0);

    const boundPath = temporaryDirectory('codument-bound-project-');
    const bound = await run(firstWorkspace, ['project', 'bind', 'shared-project', boundPath]);
    expect(bound.code).toBe(0);
    const bindings = await run(secondWorkspace, ['project', 'bindings']);
    expect(bindings.code).toBe(0);
    expect(bindings.out).toContain(`shared-project\t${path.resolve(boundPath)}`);

    const created = await run(secondWorkspace, ['track', 'create', 'shared-link-track', '--stage', 'pending']);
    expect(created.code).toBe(0);
    const activated = await run(firstWorkspace, ['track', 'transition', 'shared-link-track', 'in_progress']);
    expect(activated.code).toBe(0);
    expect(fs.existsSync(path.join(sharedRoot, 'tracks', 'pending', 'shared-link-track'))).toBe(false);
    expect(fs.existsSync(path.join(sharedRoot, 'tracks', 'active', 'shared-link-track', 'track.xnl'))).toBe(true);

    const modelingConfig = path.join(sharedRoot, 'config', 'modeling.xnl');
    fs.writeFileSync(modelingConfig, '<Modeling #codument.config.modeling { enabled = true }>\n');
    const upgraded = await run(secondWorkspace, ['upgrade-resource', 'codument/config/modeling.xnl']);
    expect(upgraded.code).toBe(0);
    expect(fs.readFileSync(modelingConfig, 'utf8')).toContain('apiVersion="codument.tech/v1alpha1"');
    expect(fs.lstatSync(path.join(firstWorkspace, 'codument')).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(path.join(secondWorkspace, 'codument')).isSymbolicLink()).toBe(true);
  });

  it('rejects broken links and non-directory roots before initialization writes', async () => {
    const brokenWorkspace = temporaryDirectory('codument-broken-workspace-');
    linkDirectory(path.join(brokenWorkspace, 'missing-target'), path.join(brokenWorkspace, 'codument'));
    const broken = await run(brokenWorkspace, ['init', '--skills-dir', path.join(brokenWorkspace, '.skills')]);
    expect(broken.code).toBe(1);
    expect(broken.err).toContain('broken directory link');
    expect(fs.lstatSync(path.join(brokenWorkspace, 'codument')).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(path.join(brokenWorkspace, 'AGENTS.md'))).toBe(false);

    const fileTargetWorkspace = temporaryDirectory('codument-file-link-workspace-');
    const targetFile = path.join(fileTargetWorkspace, 'target.txt');
    fs.writeFileSync(targetFile, 'not a directory');
    fs.symlinkSync(targetFile, path.join(fileTargetWorkspace, 'codument'), 'file');
    const fileTarget = await run(fileTargetWorkspace, ['init', '--skills-dir', path.join(fileTargetWorkspace, '.skills')]);
    expect(fileTarget.code).toBe(1);
    expect(fileTarget.err).toContain('target is not a directory');

    const fileWorkspace = temporaryDirectory('codument-file-workspace-');
    fs.writeFileSync(path.join(fileWorkspace, 'codument'), 'not a directory');
    const fileRoot = await run(fileWorkspace, ['init', '--skills-dir', path.join(fileWorkspace, '.skills')]);
    expect(fileRoot.code).toBe(1);
    expect(fileRoot.err).toContain('must be a directory or directory link');
  });
});
