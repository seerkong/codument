import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { assertCodumentRootUsable, inspectCodumentRoot } from '../../../src/cli/workspace/root';

function workspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codument-root-'));
}

function linkDirectory(target: string, link: string): void {
  fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
}

describe('Codument workspace root', () => {
  it('distinguishes a missing root from a regular directory', () => {
    const root = workspace();
    expect(inspectCodumentRoot(root)).toMatchObject({ kind: 'missing' });

    fs.mkdirSync(path.join(root, 'codument'));
    const inspection = inspectCodumentRoot(root);
    expect(inspection).toMatchObject({ kind: 'directory' });
    expect(inspection.logicalPath).toBe(path.join(root, 'codument'));
    expect(inspection.realPath).toBe(fs.realpathSync(path.join(root, 'codument')));
  });

  it('accepts an existing directory link and reports its real target', () => {
    const root = workspace();
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-shared-root-'));
    linkDirectory(target, path.join(root, 'codument'));

    const inspection = assertCodumentRootUsable(root);
    expect(inspection).toMatchObject({ kind: 'linked-directory' });
    expect(inspection.realPath).toBe(fs.realpathSync(target));
  });

  it('allows a missing root only when initialization opts in', () => {
    const root = workspace();
    expect(() => assertCodumentRootUsable(root)).toThrow('does not exist');
    expect(assertCodumentRootUsable(root, { allowMissing: true })).toMatchObject({ kind: 'missing' });
  });

  it('rejects broken links and non-directory roots with actionable errors', () => {
    const brokenWorkspace = workspace();
    linkDirectory(path.join(brokenWorkspace, 'missing-target'), path.join(brokenWorkspace, 'codument'));
    expect(() => inspectCodumentRoot(brokenWorkspace)).toThrow('broken directory link');

    const fileTargetWorkspace = workspace();
    const targetFile = path.join(fileTargetWorkspace, 'target.txt');
    fs.writeFileSync(targetFile, 'not a directory');
    fs.symlinkSync(targetFile, path.join(fileTargetWorkspace, 'codument'), 'file');
    expect(() => inspectCodumentRoot(fileTargetWorkspace)).toThrow('target is not a directory');

    const fileWorkspace = workspace();
    fs.writeFileSync(path.join(fileWorkspace, 'codument'), 'not a directory');
    expect(() => inspectCodumentRoot(fileWorkspace)).toThrow('must be a directory or directory link');
  });
});
