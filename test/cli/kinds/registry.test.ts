import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { loadResourceTree } from 'halfcode-compiler.xnl';
import { GENERATED_KIND_DEFINITIONS } from '../../../src/cli/kinds/generated';
import { getKindDefinition } from '../../../src/cli/kinds/registry';
import { SourceResourceEffect, walkResourceFiles } from '../../../src/cli/effects/resource';

const repoRoot = path.resolve(import.meta.dir, '../../..');
const authorityRoot = path.join(repoRoot, 'src', 'templates', 'codument', 'std', 'kinds');
const packagedResources = new SourceResourceEffect(path.join(repoRoot, 'src', 'templates'));

describe('Halfcode-backed Codument Kind registry', () => {
  it('resolves resource loading from the exact npm distribution root', () => {
    const consumerManifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const dependency = consumerManifest.dependencies?.['halfcode-compiler.xnl'];
    expect(dependency).toMatch(/^\d+\.\d+\.\d+$/);

    const entry = fileURLToPath(import.meta.resolve('halfcode-compiler.xnl'));
    const packageRoot = path.dirname(path.dirname(entry));
    const distributionManifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    const rootExport = distributionManifest.exports?.['.'];

    expect(distributionManifest.name).toBe('halfcode-compiler.xnl');
    expect(distributionManifest.version).toBe(dependency);
    expect(rootExport).toEqual({
      types: './dist/index.d.ts',
      import: './dist/index.js',
    });
    expect(typeof loadResourceTree).toBe('function');
    expect(fs.existsSync(path.join(packageRoot, rootExport.import))).toBe(true);
    expect(fs.existsSync(path.join(packageRoot, rootExport.types))).toBe(true);
  });

  it('keeps the generated CLI projection equal to the validated XNL authority', async () => {
    const tree = await loadResourceTree({ rootDir: authorityRoot });
    const projected = Object.fromEntries(
      [...tree.registry.kindDefinitions.values()]
        .sort((left, right) => left.resourceKind.localeCompare(right.resourceKind))
        .map((definition) => [definition.resourceKind, {
          resourceId: definition.resourceId,
          resourceKind: definition.resourceKind,
          sourceShapes: definition.sourceShapes,
          currentApiVersion: definition.currentApiVersion,
          supportedApiVersions: definition.supportedApiVersions,
          documentCardinality: definition.documentCardinality,
        }]),
    );

    expect(projected).toEqual(GENERATED_KIND_DEFINITIONS);
    expect(getKindDefinition('decision')).toMatchObject({
      sourceShapes: ['single-file'],
      documentCardinality: 'many',
      currentApiVersion: 'codument.tech/v1alpha1',
    });
  });

  it('publishes the complete Kind authority for init and upgrade-workspace', async () => {
    const paths = (await walkResourceFiles(packagedResources))
      .map((file) => file.path)
      .filter((file) => file.startsWith('codument/std/kinds/'))
      .sort();

    expect(paths).toEqual([
      'codument/std/kinds/KindDefinitions/AttractorProfiles/manifest.xnl',
      'codument/std/kinds/KindDefinitions/Behavior/manifest.xnl',
      'codument/std/kinds/KindDefinitions/BehaviorPatch/manifest.xnl',
      'codument/std/kinds/KindDefinitions/Decision/manifest.xnl',
      'codument/std/kinds/KindDefinitions/EngineeringConfig/manifest.xnl',
      'codument/std/kinds/KindDefinitions/Mission/manifest.xnl',
      'codument/std/kinds/KindDefinitions/ModelingConfig/manifest.xnl',
      'codument/std/kinds/KindDefinitions/OperationHooks/manifest.xnl',
      'codument/std/kinds/KindDefinitions/Track/manifest.xnl',
      'codument/std/kinds/manifest.xnl',
    ]);
  });

  it('loads scaffolded Track and Mission resources through the workspace ResourcePackage', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-halfcode-workspace-'));
    const codument = path.join(workspace, 'codument');
    const trackDir = path.join(codument, 'tracks', 'active', 'halfcode-smoke');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.mkdirSync(path.join(codument, 'tracks', 'pending'), { recursive: true });
    fs.mkdirSync(path.join(codument, 'missions', 'pending'), { recursive: true });
    fs.mkdirSync(path.join(codument, 'missions', 'active'), { recursive: true });
    fs.mkdirSync(path.join(codument, 'behaviors'), { recursive: true });
    fs.cpSync(path.join(repoRoot, 'src', 'templates', 'codument', 'manifest.xnl'), path.join(codument, 'manifest.xnl'));
    fs.cpSync(authorityRoot, path.join(codument, 'std', 'kinds'), { recursive: true });
    fs.cpSync(path.join(repoRoot, 'src', 'templates', 'codument', 'config'), path.join(codument, 'config'), { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'track.xnl'), [
      '<Track #halfcode-smoke apiVersion="codument.tech/v1alpha1" version="1" {',
      '  status = "in_progress"',
      '}>',
      '',
    ].join('\n'), 'utf8');
    fs.writeFileSync(path.join(trackDir, 'proposal.md'), '# Proposal\n', 'utf8');
    fs.writeFileSync(path.join(trackDir, 'design.md'), '# Design\n', 'utf8');
    const missionDir = path.join(codument, 'missions', 'active', 'halfcode-mission-smoke');
    fs.mkdirSync(missionDir, { recursive: true });
    fs.writeFileSync(path.join(missionDir, 'mission.xnl'), [
      '<Mission #halfcode-mission-smoke apiVersion="codument.tech/v1alpha1" version="1" {',
      '  status = "active"',
      '}>',
      '',
    ].join('\n'), 'utf8');
    fs.writeFileSync(path.join(missionDir, 'proposal.md'), '# Proposal\n', 'utf8');
    fs.writeFileSync(path.join(missionDir, 'design.md'), '# Design\n', 'utf8');

    const tree = await loadResourceTree({ rootDir: codument });
    const tracks = tree.registry.byKind.get('Track') ?? [];
    const missions = tree.registry.byKind.get('Mission') ?? [];

    expect(tree.diagnostics).toEqual([]);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      resourceId: 'halfcode-smoke',
      logicalPath: 'tracks/active/halfcode-smoke/track.xnl',
      metadata: { apiVersion: 'codument.tech/v1alpha1', version: '1' },
    });
    expect(missions).toHaveLength(1);
    expect(missions[0]).toMatchObject({
      resourceId: 'halfcode-mission-smoke',
      logicalPath: 'missions/active/halfcode-mission-smoke/mission.xnl',
      metadata: { apiVersion: 'codument.tech/v1alpha1', version: '1' },
    });
    for (const kind of ['OperationHooks', 'AttractorProfiles', 'ModelingConfig', 'EngineeringConfig']) {
      expect(tree.registry.byKind.get(kind)).toHaveLength(1);
    }
  });
});
