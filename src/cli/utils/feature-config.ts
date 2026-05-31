import * as fs from 'fs';
import * as path from 'path';
import { CODUMENT_DIR } from './index';

export interface KnowledgeSyncTarget {
  name: string;
  root: string;
  attractor?: string;
}

export interface FeatureConfig {
  knowledgeSync: {
    enabled: boolean;
    targets: KnowledgeSyncTarget[];
  };
  projectMemory: {
    enabled: boolean;
  };
}

export const DEFAULT_FEATURE_CONFIG: FeatureConfig = {
  knowledgeSync: {
    enabled: false,
    targets: [],
  },
  projectMemory: {
    enabled: false,
  },
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function mergeFeatureConfigDefaults(input: unknown): FeatureConfig {
  if (!isObject(input)) {
    return structuredClone(DEFAULT_FEATURE_CONFIG);
  }

  const knowledgeSyncRaw = isObject(input.knowledgeSync) ? input.knowledgeSync : {};
  const targetsRaw = Array.isArray(knowledgeSyncRaw.targets) ? knowledgeSyncRaw.targets : [];
  const targets = targetsRaw
    .filter(isObject)
    .filter((target) => typeof target.name === 'string' && typeof target.root === 'string')
    .map((target) => ({
      name: String(target.name),
      root: String(target.root),
      attractor: typeof target.attractor === 'string' ? String(target.attractor) : undefined,
    }));

  const projectMemoryRaw = isObject(input.projectMemory) ? input.projectMemory : {};

  return {
    knowledgeSync: {
      enabled: typeof knowledgeSyncRaw.enabled === 'boolean'
        ? knowledgeSyncRaw.enabled
        : DEFAULT_FEATURE_CONFIG.knowledgeSync.enabled,
      targets,
    },
    projectMemory: {
      enabled: typeof projectMemoryRaw.enabled === 'boolean'
        ? projectMemoryRaw.enabled
        : DEFAULT_FEATURE_CONFIG.projectMemory.enabled,
    },
  };
}

function hasFeatureConfigDefaults(input: unknown): boolean {
  if (!isObject(input)) {
    return false;
  }

  const knowledgeSync = input.knowledgeSync;
  const projectMemory = input.projectMemory;
  return isObject(knowledgeSync)
    && typeof knowledgeSync.enabled === 'boolean'
    && Array.isArray(knowledgeSync.targets)
    && isObject(projectMemory)
    && typeof projectMemory.enabled === 'boolean';
}

function mergeFeatureConfigDefaultsForWrite(input: unknown): JsonObject {
  if (!isObject(input)) {
    return structuredClone(DEFAULT_FEATURE_CONFIG) as unknown as JsonObject;
  }

  const merged = mergeFeatureConfigDefaults(input);
  const knowledgeSyncRaw = isObject(input.knowledgeSync) ? input.knowledgeSync : {};
  const projectMemoryRaw = isObject(input.projectMemory) ? input.projectMemory : {};

  return {
    ...input,
    knowledgeSync: {
      ...knowledgeSyncRaw,
      enabled: merged.knowledgeSync.enabled,
      targets: Array.isArray(knowledgeSyncRaw.targets) ? knowledgeSyncRaw.targets : merged.knowledgeSync.targets,
    },
    projectMemory: {
      ...projectMemoryRaw,
      enabled: merged.projectMemory.enabled,
    },
  };
}

export function featureConfigPath(codumentDir = CODUMENT_DIR): string {
  return path.join(codumentDir, 'config', 'feature.json');
}

export function loadFeatureConfig(codumentDir = CODUMENT_DIR): FeatureConfig {
  const configPath = featureConfigPath(codumentDir);
  if (!fs.existsSync(configPath)) {
    return structuredClone(DEFAULT_FEATURE_CONFIG);
  }

  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as unknown;
  return mergeFeatureConfigDefaults(parsed);
}

export function ensureFeatureConfig(codumentDir = CODUMENT_DIR): FeatureConfig {
  const configPath = featureConfigPath(codumentDir);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, `${JSON.stringify(DEFAULT_FEATURE_CONFIG, null, 2)}\n`, 'utf-8');
    return structuredClone(DEFAULT_FEATURE_CONFIG);
  }

  const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as unknown;
  const merged = mergeFeatureConfigDefaults(raw);
  if (!hasFeatureConfigDefaults(raw)) {
    const writeValue = mergeFeatureConfigDefaultsForWrite(raw);
    fs.writeFileSync(configPath, `${JSON.stringify(writeValue, null, 2)}\n`, 'utf-8');
  }
  return merged;
}

export function resolveKnowledgeTargetRoot(target: KnowledgeSyncTarget, workspaceDir = process.cwd()): string {
  return path.isAbsolute(target.root)
    ? target.root
    : path.resolve(workspaceDir, target.root);
}
