import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ensureFeatureArtifactDefaults,
  ensureFeatureConfig,
  loadAttractorProfiles,
  loadFeatureConfig,
  removeDefaultOnlyAttractorProfiles,
  resolveAttractorProfile,
  resolveKnowledgeTargetRoot,
} from './feature-config';

function makeTempCodumentDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codument-feature-config-'));
}

describe('feature config', () => {
  it('uses disabled defaults when feature.json is missing', () => {
    const codumentDir = makeTempCodumentDir();
    const config = loadFeatureConfig(codumentDir);

    expect(config.knowledgeSync.enabled).toBe(false);
    expect(config.knowledgeSync.targets).toEqual([]);
    expect(config.projectMemory.enabled).toBe(false);
  });

  it('creates defaults without enabling optional features', () => {
    const codumentDir = makeTempCodumentDir();
    const config = ensureFeatureConfig(codumentDir);
    const raw = JSON.parse(fs.readFileSync(path.join(codumentDir, 'config', 'feature.json'), 'utf-8')) as {
      knowledgeSync: { enabled: boolean; targets?: unknown[] };
      projectMemory: { enabled: boolean };
    };

    expect(config.knowledgeSync.enabled).toBe(false);
    expect(fs.existsSync(path.join(codumentDir, 'config', 'feature.json'))).toBe(true);
    expect(raw.knowledgeSync.targets).toBeUndefined();
  });

  it('preserves explicit absolute knowledge targets', () => {
    const codumentDir = makeTempCodumentDir();
    const externalRoot = path.join(os.tmpdir(), 'external-docs');
    fs.mkdirSync(path.join(codumentDir, 'config'), { recursive: true });
    fs.writeFileSync(path.join(codumentDir, 'config', 'feature.json'), JSON.stringify({
      knowledgeSync: {
        enabled: true,
        targets: [{ name: 'external', root: externalRoot }],
      },
      projectMemory: { enabled: true },
    }));

    const config = loadFeatureConfig(codumentDir);
    expect(config.knowledgeSync.targets[0].root).toBe(externalRoot);
    expect(resolveKnowledgeTargetRoot(config.knowledgeSync.targets[0], '/workspace')).toBe(externalRoot);
  });

  it('adds missing defaults without deleting unknown config keys', () => {
    const codumentDir = makeTempCodumentDir();
    const configPath = path.join(codumentDir, 'config', 'feature.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({
      knowledgeSync: {
        enabled: true,
        customMode: 'manual-review',
      },
      experimental: {
        keep: true,
      },
    }, null, 2));

    const config = ensureFeatureConfig(codumentDir);
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
      knowledgeSync: { enabled: boolean; targets?: unknown[]; customMode: string };
      projectMemory: { enabled: boolean };
      experimental: { keep: boolean };
    };

    expect(config.knowledgeSync.enabled).toBe(true);
    expect(config.knowledgeSync.targets).toEqual([]);
    expect(config.projectMemory.enabled).toBe(false);
    expect(raw.knowledgeSync.customMode).toBe('manual-review');
    expect(raw.knowledgeSync.targets).toBeUndefined();
    expect(raw.experimental.keep).toBe(true);
  });

  it('removes empty legacy knowledge targets when ensuring feature config', () => {
    const codumentDir = makeTempCodumentDir();
    const configPath = path.join(codumentDir, 'config', 'feature.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({
      knowledgeSync: {
        enabled: false,
        targets: [],
      },
      projectMemory: {
        enabled: false,
      },
    }, null, 2));

    const config = ensureFeatureConfig(codumentDir);
    const raw = fs.readFileSync(configPath, 'utf-8');

    expect(config.knowledgeSync.targets).toEqual([]);
    expect(raw).not.toContain('"targets"');
  });

  it('creates explicit artifacts config from enabled feature targets', () => {
    const workspaceDir = makeTempCodumentDir();
    const codumentDir = path.join(workspaceDir, 'codument');
    fs.mkdirSync(path.join(codumentDir, 'config'), { recursive: true });
    fs.mkdirSync(path.join(codumentDir, 'attractors'), { recursive: true });
    fs.writeFileSync(path.join(codumentDir, 'attractors', 'docs-knowledge.md'), '# Docs\n');
    fs.writeFileSync(path.join(codumentDir, 'attractors', 'project-memory.md'), '# Memory\n');
    fs.writeFileSync(path.join(codumentDir, 'config', 'feature.json'), JSON.stringify({
      knowledgeSync: {
        enabled: true,
        targets: [
          { name: 'main-docs', root: '../docs-main', attractor: 'codument/attractors/docs-knowledge.md' },
          { name: 'cli-docs', root: '/tmp/cli-docs' },
        ],
      },
      projectMemory: { enabled: true },
    }, null, 2));

    const featureConfig = loadFeatureConfig(codumentDir);
    const result = ensureFeatureArtifactDefaults(featureConfig, codumentDir);
    const artifacts = fs.readFileSync(path.join(codumentDir, 'config', 'artifacts.xml'), 'utf-8');
    const operationHooks = fs.readFileSync(path.join(codumentDir, 'config', 'operation-hooks.xml'), 'utf-8');
    const featureJson = fs.readFileSync(path.join(codumentDir, 'config', 'feature.json'), 'utf-8');
    const profiles = loadAttractorProfiles(codumentDir);

    expect(result.createdArtifactsConfig).toBe(true);
    expect(result.createdOperationHooksConfig).toBe(true);
    expect(result.migratedKnowledgeTargets).toBe(true);
    expect(artifacts).toContain('<targets>');
    expect(artifacts).toContain('base-dir="../docs-main"');
    expect(artifacts).toContain('base-dir="/tmp/cli-docs"');
    expect(artifacts).toContain('relative-dir="."');
    expect(artifacts).toContain('codument/attractors/docs-knowledge.md');
    expect(artifacts).toContain('project-memory-artifact');
    expect(artifacts).toContain('base-dir="codument/memory"');
    expect(artifacts).toContain('relative-file="summaries/project-memory.md"');
    expect(artifacts).not.toContain('<attractor-profile id="docs-knowledge-profile" name="docs" attractor=');
    expect(artifacts).not.toContain('<attractor-profile id="project-memory-profile" name="memory" attractor=');
    expect(artifacts).not.toContain('attractor="codument/attractors/project-memory.md"');
    expect(featureJson).not.toContain('"targets"');
    expect(operationHooks).toContain('<operation name="archive">');
    expect(operationHooks).toContain('point="after-archive"');
    expect(operationHooks).toContain('artifact="docs-knowledge-artifact"');
    expect(operationHooks).toContain('artifact="project-memory-artifact"');
    expect(profiles.profiles.docs.attractors).toEqual(['codument/attractors/docs-knowledge.md']);
    expect(profiles.profiles.memory.attractors).toEqual(['codument/attractors/project-memory.md']);
  });

  it('puts default docs and memory attractors in profiles instead of generated target hints', () => {
    const workspaceDir = makeTempCodumentDir();
    const codumentDir = path.join(workspaceDir, 'codument');
    fs.mkdirSync(path.join(codumentDir, 'config'), { recursive: true });
    fs.writeFileSync(path.join(codumentDir, 'config', 'feature.json'), JSON.stringify({
      knowledgeSync: { enabled: true, targets: [] },
      projectMemory: { enabled: true },
    }, null, 2));

    const result = ensureFeatureArtifactDefaults(loadFeatureConfig(codumentDir), codumentDir);
    const artifacts = fs.readFileSync(path.join(codumentDir, 'config', 'artifacts.xml'), 'utf-8');
    const profiles = loadAttractorProfiles(codumentDir);

    expect(result.createdArtifactsConfig).toBe(true);
    expect(artifacts).toContain('<attractor-profile id="docs-knowledge-profile" name="docs" />');
    expect(artifacts).toContain('<attractor-profile id="project-memory-profile" name="memory" />');
    expect(artifacts).toContain('base-dir="docs"');
    expect(artifacts).toContain('relative-dir="."');
    expect(artifacts).not.toContain('attractor="codument/attractors/docs-knowledge.md"');
    expect(artifacts).not.toContain('attractor="codument/attractors/project-memory.md"');
    expect(profiles.profiles.docs.attractors).toEqual(['codument/attractors/docs-knowledge.md']);
    expect(profiles.profiles.memory.attractors).toEqual(['codument/attractors/project-memory.md']);
  });

  it('does not remove legacy targets when artifacts config already exists', () => {
    const workspaceDir = makeTempCodumentDir();
    const codumentDir = path.join(workspaceDir, 'codument');
    fs.mkdirSync(path.join(codumentDir, 'config'), { recursive: true });
    fs.writeFileSync(path.join(codumentDir, 'config', 'feature.json'), JSON.stringify({
      knowledgeSync: {
        enabled: true,
        targets: [{ name: 'main-docs', root: '../docs-main' }],
      },
      projectMemory: { enabled: false },
    }, null, 2));
    fs.writeFileSync(path.join(codumentDir, 'config', 'artifacts.xml'), '<artifact-config version="1"><resources /><artifacts /></artifact-config>\n');

    const result = ensureFeatureArtifactDefaults(loadFeatureConfig(codumentDir), codumentDir);
    const featureJson = fs.readFileSync(path.join(codumentDir, 'config', 'feature.json'), 'utf-8');

    expect(result.createdArtifactsConfig).toBe(false);
    expect(result.createdOperationHooksConfig).toBe(false);
    expect(result.migratedKnowledgeTargets).toBe(false);
    expect(featureJson).toContain('../docs-main');
  });
});

describe('attractor profile config', () => {
  it('uses project/product default profile when attractor-profiles.json is missing', () => {
    const codumentDir = makeTempCodumentDir();
    const config = loadAttractorProfiles(codumentDir);

    expect(config.profiles.default.attractors).toEqual([
      'codument/attractors/project.md',
      'codument/attractors/product.md',
    ]);
  });

  it('does not create attractor profile config just to expose defaults', () => {
    const codumentDir = makeTempCodumentDir();
    const config = loadAttractorProfiles(codumentDir);

    expect(config.profiles.default.attractors).toContain('codument/attractors/project.md');
    expect(fs.existsSync(path.join(codumentDir, 'config', 'attractor-profiles.json'))).toBe(false);
  });

  it('preserves configured profiles and adds default when missing', () => {
    const codumentDir = makeTempCodumentDir();
    const configPath = path.join(codumentDir, 'config', 'attractor-profiles.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({
      profiles: {
        docs: {
          description: 'Docs readiness',
          attractors: ['codument/attractors/docs-knowledge.md'],
        },
      },
    }, null, 2));

    const config = loadAttractorProfiles(codumentDir);

    expect(config.profiles.docs.attractors).toEqual(['codument/attractors/docs-knowledge.md']);
    expect(config.profiles.default.attractors).toContain('codument/attractors/project.md');
  });

  it('reports missing attractor files when resolving a profile', () => {
    const workspaceDir = makeTempCodumentDir();
    const codumentDir = path.join(workspaceDir, 'codument');
    fs.mkdirSync(path.join(codumentDir, 'config'), { recursive: true });
    fs.writeFileSync(path.join(codumentDir, 'config', 'attractor-profiles.json'), JSON.stringify({
      profiles: {
        default: {
          attractors: ['codument/attractors/project.md'],
        },
      },
    }, null, 2));

    const resolved = resolveAttractorProfile('default', codumentDir, workspaceDir);

    expect(resolved?.missingFiles).toEqual(['codument/attractors/project.md']);
  });

  it('removes a persisted default-only profile config', () => {
    const codumentDir = makeTempCodumentDir();
    const configPath = path.join(codumentDir, 'config', 'attractor-profiles.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({
      profiles: {
        default: {
          description: 'Default project direction check',
          attractors: [
            'codument/attractors/project.md',
            'codument/attractors/product.md',
          ],
        },
      },
    }, null, 2));

    expect(removeDefaultOnlyAttractorProfiles(codumentDir)).toBe(true);
    expect(fs.existsSync(configPath)).toBe(false);
  });

  it('preserves a customized default profile config', () => {
    const codumentDir = makeTempCodumentDir();
    const configPath = path.join(codumentDir, 'config', 'attractor-profiles.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({
      profiles: {
        default: {
          description: 'Custom default',
          attractors: ['codument/attractors/custom.md'],
        },
      },
    }, null, 2));

    expect(removeDefaultOnlyAttractorProfiles(codumentDir)).toBe(false);
    expect(fs.existsSync(configPath)).toBe(true);
  });
});
