import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureFeatureConfig, loadFeatureConfig, resolveKnowledgeTargetRoot } from './feature-config';

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

    expect(config.knowledgeSync.enabled).toBe(false);
    expect(fs.existsSync(path.join(codumentDir, 'config', 'feature.json'))).toBe(true);
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
      knowledgeSync: { enabled: boolean; targets: unknown[]; customMode: string };
      projectMemory: { enabled: boolean };
      experimental: { keep: boolean };
    };

    expect(config.knowledgeSync.enabled).toBe(true);
    expect(config.knowledgeSync.targets).toEqual([]);
    expect(config.projectMemory.enabled).toBe(false);
    expect(raw.knowledgeSync.customMode).toBe('manual-review');
    expect(raw.knowledgeSync.targets).toEqual([]);
    expect(raw.experimental.keep).toBe(true);
  });
});
