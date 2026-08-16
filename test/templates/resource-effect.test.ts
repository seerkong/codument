import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  EMBEDDED_RESOURCE_PREFIX,
  EmbeddedResourceEffect,
  SourceResourceEffect,
  walkResourceFiles,
  type ResourceEffect,
} from '../../src/cli/effects/resource';
import { FileSystemWorkspaceEffect } from '../../src/cli/effects/workspace';
import * as os from 'node:os';

const templatesRoot = path.resolve(import.meta.dir, '..', '..', 'src', 'templates');
const source = new SourceResourceEffect(templatesRoot);
const decisionMigrationReference = 'skills/codument-migrate/references/decision-migration.md';

async function embeddedFromSource(): Promise<EmbeddedResourceEffect> {
  const files = await walkResourceFiles(source);
  const blobs = await Promise.all(files.map(async (entry) => new File(
    [await source.readText(entry.path) ?? ''],
    `${EMBEDDED_RESOURCE_PREFIX}${entry.path}`,
  )));
  return new EmbeddedResourceEffect(blobs);
}

async function expectResourceContract(effect: ResourceEffect): Promise<void> {
  expect(await effect.stat('codument')).toMatchObject({ kind: 'directory', path: 'codument' });
  expect(await effect.stat('skills')).toMatchObject({ kind: 'directory', path: 'skills' });
  expect(await effect.stat('missing')).toBeUndefined();
  expect(await effect.readDirectory('missing')).toBeUndefined();
  expect(await effect.readText('missing')).toBeUndefined();
  await expect(effect.stat('../outside')).rejects.toThrow('Invalid packaged resource path');
}

describe('packaged ResourceEffect', () => {
  it('ships modeling enabled by default', async () => {
    const modeling = await source.readText('codument/config/modeling.xnl');
    expect(modeling).toContain('<ModelingConfig #codument.config.modeling');
    expect(modeling).toContain('{ enabled = true }');
  });

  it('gives source and embedded adapters identical file paths and content', async () => {
    const embedded = await embeddedFromSource();
    await expectResourceContract(source);
    await expectResourceContract(embedded);

    const sourceFiles = await walkResourceFiles(source);
    const embeddedFiles = await walkResourceFiles(embedded);
    expect(embeddedFiles.map((entry) => entry.path)).toEqual(sourceFiles.map((entry) => entry.path));
    for (const entry of sourceFiles) {
      expect(await embedded.readText(entry.path)).toBe(await source.readText(entry.path));
    }
  });

  it('covers templates, skills, operations, and KindDefinitions', async () => {
    for (const resourcePath of [
      'codument/README.md',
      'skills/codument-impl-track/SKILL.md',
      'codument/std/operations/impl-track.md',
      'codument/std/kinds/KindDefinitions/Track/manifest.xnl',
    ]) {
      expect(await source.stat(resourcePath), resourcePath).toMatchObject({ kind: 'file' });
      expect((await source.readText(resourcePath))?.length, resourcePath).toBeGreaterThan(0);
    }
  });

  it('ships the decision migration reference', async () => {
    const reference = await source.readText(decisionMigrationReference);
    expect(reference).toContain('# Decision review-required 修正协议');
    expect(reference).toContain('codument upgrade-resource <path> --json');
    expect(reference).toContain('全部由 CLI migration pipeline 负责');
  });

  it('does not retain a generated manifest source file', () => {
    expect(fs.existsSync(path.join(templatesRoot, 'manifest.ts'))).toBe(false);
    expect(fs.existsSync(path.resolve(templatesRoot, '..', '..', 'scripts', 'gen-template-manifest.ts'))).toBe(false);
  });

  it('keeps packaged resources read-only and workspace mutation root-scoped', async () => {
    expect('writeText' in source).toBe(false);
    expect('remove' in source).toBe(false);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-workspace-effect-'));
    const workspace = new FileSystemWorkspaceEffect(root);
    await workspace.writeText('nested/value.txt', 'value');
    expect(await workspace.readText('nested/value.txt')).toBe('value');
    await expect(workspace.writeText('../outside.txt', 'no')).rejects.toThrow('escapes root');
    await workspace.remove('nested');
    expect(await workspace.exists('nested/value.txt')).toBe(false);
  });
});
