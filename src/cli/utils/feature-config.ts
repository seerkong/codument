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

export interface FeatureConfigFile {
  knowledgeSync: {
    enabled: boolean;
  };
  projectMemory: {
    enabled: boolean;
  };
}

export interface AttractorProfile {
  description?: string;
  attractors: string[];
}

export interface AttractorProfilesConfig {
  profiles: Record<string, AttractorProfile>;
}

export interface EnsureFeatureArtifactsResult {
  createdArtifactsConfig: boolean;
  createdOperationHooksConfig: boolean;
  migratedKnowledgeTargets: boolean;
  addedProfiles: string[];
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

export const DEFAULT_FEATURE_CONFIG_FILE: FeatureConfigFile = {
  knowledgeSync: {
    enabled: false,
  },
  projectMemory: {
    enabled: false,
  },
};

export const DEFAULT_ATTRACTOR_PROFILES_CONFIG: AttractorProfilesConfig = {
  profiles: {
    default: {
      description: 'Default project direction check',
      attractors: [
        'codument/attractors/project.md',
        'codument/attractors/product.md',
      ],
    },
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
    && isObject(projectMemory)
    && typeof projectMemory.enabled === 'boolean';
}

function mergeFeatureConfigDefaultsForWrite(input: unknown): JsonObject {
  if (!isObject(input)) {
    return structuredClone(DEFAULT_FEATURE_CONFIG_FILE) as unknown as JsonObject;
  }

  const merged = mergeFeatureConfigDefaults(input);
  const knowledgeSyncRaw = isObject(input.knowledgeSync) ? input.knowledgeSync : {};
  const projectMemoryRaw = isObject(input.projectMemory) ? input.projectMemory : {};
  const knowledgeSyncWrite = {
    ...knowledgeSyncRaw,
    enabled: merged.knowledgeSync.enabled,
  };

  if (!Array.isArray(knowledgeSyncRaw.targets) || knowledgeSyncRaw.targets.length === 0) {
    delete (knowledgeSyncWrite as Record<string, unknown>).targets;
  }

  return {
    ...input,
    knowledgeSync: knowledgeSyncWrite,
    projectMemory: {
      ...projectMemoryRaw,
      enabled: merged.projectMemory.enabled,
    },
  };
}

function shouldRewriteFeatureConfig(input: unknown): boolean {
  if (!hasFeatureConfigDefaults(input)) {
    return true;
  }
  if (!isObject(input)) {
    return true;
  }

  const knowledgeSyncRaw = isObject(input.knowledgeSync) ? input.knowledgeSync : {};
  if (!('targets' in knowledgeSyncRaw)) {
    return false;
  }

  return !Array.isArray(knowledgeSyncRaw.targets) || knowledgeSyncRaw.targets.length === 0;
}

export function featureConfigPath(codumentDir = CODUMENT_DIR): string {
  return path.join(codumentDir, 'config', 'feature.json');
}

export function attractorProfilesPath(codumentDir = CODUMENT_DIR): string {
  return path.join(codumentDir, 'config', 'attractor-profiles.json');
}

export function operationHooksPath(codumentDir = CODUMENT_DIR): string {
  return path.join(codumentDir, 'config', 'operation-hooks.xml');
}

export function artifactsConfigPath(codumentDir = CODUMENT_DIR): string {
  return path.join(codumentDir, 'config', 'artifacts.xml');
}

export function loadFeatureConfig(codumentDir = CODUMENT_DIR): FeatureConfig {
  const configPath = featureConfigPath(codumentDir);
  if (!fs.existsSync(configPath)) {
    return structuredClone(DEFAULT_FEATURE_CONFIG);
  }

  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as unknown;
  return mergeFeatureConfigDefaults(parsed);
}

export function mergeAttractorProfileDefaults(input: unknown): AttractorProfilesConfig {
  if (!isObject(input)) {
    return structuredClone(DEFAULT_ATTRACTOR_PROFILES_CONFIG);
  }

  const profilesRaw = isObject(input.profiles) ? input.profiles : {};
  const profiles: Record<string, AttractorProfile> = {};

  for (const [name, profileRaw] of Object.entries(profilesRaw)) {
    if (!isObject(profileRaw)) {
      continue;
    }
    const attractorsRaw = Array.isArray(profileRaw.attractors) ? profileRaw.attractors : [];
    const attractors = attractorsRaw.filter((value): value is string => typeof value === 'string');
    if (attractors.length === 0) {
      continue;
    }
    profiles[name] = {
      description: typeof profileRaw.description === 'string' ? profileRaw.description : undefined,
      attractors,
    };
  }

  if (!profiles.default) {
    profiles.default = structuredClone(DEFAULT_ATTRACTOR_PROFILES_CONFIG.profiles.default);
  }

  return { profiles };
}

export function loadAttractorProfiles(codumentDir = CODUMENT_DIR): AttractorProfilesConfig {
  const configPath = attractorProfilesPath(codumentDir);
  if (!fs.existsSync(configPath)) {
    return structuredClone(DEFAULT_ATTRACTOR_PROFILES_CONFIG);
  }

  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as unknown;
  return mergeAttractorProfileDefaults(parsed);
}

export function ensureAttractorProfiles(codumentDir = CODUMENT_DIR): AttractorProfilesConfig {
  const configPath = attractorProfilesPath(codumentDir);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, `${JSON.stringify(DEFAULT_ATTRACTOR_PROFILES_CONFIG, null, 2)}\n`, 'utf-8');
    return structuredClone(DEFAULT_ATTRACTOR_PROFILES_CONFIG);
  }

  return loadAttractorProfiles(codumentDir);
}

export function removeDefaultOnlyAttractorProfiles(codumentDir = CODUMENT_DIR): boolean {
  const configPath = attractorProfilesPath(codumentDir);
  if (!fs.existsSync(configPath)) {
    return false;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as unknown;
  } catch {
    return false;
  }

  if (!isObject(parsed) || Object.keys(parsed).some((key) => key !== 'profiles')) {
    return false;
  }

  const profiles = isObject(parsed.profiles) ? parsed.profiles : null;
  if (!profiles || Object.keys(profiles).length !== 1 || !isObject(profiles.default)) {
    return false;
  }

  const defaultProfile = DEFAULT_ATTRACTOR_PROFILES_CONFIG.profiles.default;
  const defaultProfileRaw = profiles.default;
  const allowedKeys = new Set(['description', 'attractors']);
  if (Object.keys(defaultProfileRaw).some((key) => !allowedKeys.has(key))) {
    return false;
  }
  if (
    typeof defaultProfileRaw.description === 'string'
    && defaultProfileRaw.description !== defaultProfile.description
  ) {
    return false;
  }

  const attractors = Array.isArray(profiles.default.attractors)
    ? profiles.default.attractors.filter((value): value is string => typeof value === 'string')
    : [];
  if (
    JSON.stringify(attractors)
    !== JSON.stringify(defaultProfile.attractors)
  ) {
    return false;
  }

  fs.rmSync(configPath, { force: true });
  return true;
}

function writeAttractorProfiles(codumentDir: string, config: AttractorProfilesConfig): void {
  const configPath = attractorProfilesPath(codumentDir);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
}

function safeXmlId(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'target';
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildFeatureArtifactsXml(featureConfig: FeatureConfig): string {
  const resourceLines = [
    '    <agent id="artifact-sync-agent" executor="fresh-subagent" />',
  ];
  const artifactBlocks: string[] = [];

  if (featureConfig.knowledgeSync.enabled) {
    resourceLines.push('    <attractor-profile id="docs-knowledge-profile" name="docs" />');
    const targets: KnowledgeSyncTarget[] = featureConfig.knowledgeSync.targets.length > 0
      ? featureConfig.knowledgeSync.targets
      : [{ name: 'docs', root: 'docs' }];
    const targetLines = targets.map((target) => {
      const id = `knowledge-${safeXmlId(target.name)}`;
      const attractor = target.attractor ? ` attractor="${xmlEscape(target.attractor)}"` : '';
      return `        <target id="${xmlEscape(id)}" kind="local-dir" base-dir="${xmlEscape(target.root)}" relative-dir="."${attractor} />`;
    });

    artifactBlocks.push(`    <artifact id="docs-knowledge-artifact" kind="knowledge-doc" enabled="true" source-kind="archived-track" source-scope="current">
      <uses>
        <use resource="artifact-sync-agent" />
        <use resource="docs-knowledge-profile" />
      </uses>
      <targets>
${targetLines.join('\n')}
      </targets>
      <policy dry-run="first" conflict="diff-confirm" provenance="manifest" />
    </artifact>`);
  }

  if (featureConfig.projectMemory.enabled) {
    resourceLines.push('    <attractor-profile id="project-memory-profile" name="memory" />');
    artifactBlocks.push(`    <artifact id="project-memory-artifact" kind="project-memory" enabled="true" source-kind="project-memory" source-scope="current">
      <uses>
        <use resource="artifact-sync-agent" />
        <use resource="project-memory-profile" />
      </uses>
      <targets>
        <target id="project-memory" kind="local-dir" base-dir="codument/memory" relative-file="summaries/project-memory.md" />
      </targets>
      <policy dry-run="first" conflict="diff-confirm" provenance="manifest" />
    </artifact>`);
  }

  return `<artifact-config version="1">
  <resources>
${resourceLines.join('\n')}
  </resources>
  <artifacts>
${artifactBlocks.join('\n')}
  </artifacts>
</artifact-config>
`;
}

function artifactExists(artifactsXml: string, artifactId: string): boolean {
  return artifactsXml.includes(`id="${artifactId}"`) || artifactsXml.includes(`id='${artifactId}'`);
}

function buildFeatureOperationHooksXml(artifactIds: string[]): string {
  const syncLines = artifactIds.map((artifactId) =>
    `      <artifact-sync artifact="${xmlEscape(artifactId)}" status="TODO" executor="fresh-subagent" />`
  );

  return `<operation-hooks version="1">
  <operation name="archive">
    <hook id="after-archive-artifact-sync" point="after-archive" status="TODO">
${syncLines.join('\n')}
    </hook>
  </operation>
</operation-hooks>
`;
}

export function ensureFeatureArtifactDefaults(
  featureConfig: FeatureConfig,
  codumentDir = CODUMENT_DIR,
): EnsureFeatureArtifactsResult {
  const configDir = path.join(codumentDir, 'config');
  fs.mkdirSync(configDir, { recursive: true });

  const profilesPath = attractorProfilesPath(codumentDir);
  const existingProfiles = fs.existsSync(profilesPath)
    ? loadAttractorProfiles(codumentDir)
    : structuredClone(DEFAULT_ATTRACTOR_PROFILES_CONFIG);
  const profiles = structuredClone(existingProfiles);
  const addedProfiles: string[] = [];

  if (featureConfig.knowledgeSync.enabled && !profiles.profiles.docs) {
    profiles.profiles.docs = {
      description: 'Docs knowledge artifact generation',
      attractors: ['codument/attractors/docs-knowledge.md'],
    };
    addedProfiles.push('docs');
  }
  if (featureConfig.projectMemory.enabled && !profiles.profiles.memory) {
    profiles.profiles.memory = {
      description: 'Project memory artifact generation',
      attractors: ['codument/attractors/project-memory.md'],
    };
    addedProfiles.push('memory');
  }
  if (addedProfiles.length > 0) {
    writeAttractorProfiles(codumentDir, profiles);
  }

  const shouldCreateArtifacts = featureConfig.knowledgeSync.enabled || featureConfig.projectMemory.enabled;
  const artifactsPath = artifactsConfigPath(codumentDir);
  let createdArtifactsConfig = false;
  if (shouldCreateArtifacts && !fs.existsSync(artifactsPath)) {
    fs.writeFileSync(artifactsPath, buildFeatureArtifactsXml(featureConfig), 'utf-8');
    createdArtifactsConfig = true;
  }

  const operationHooksPathValue = operationHooksPath(codumentDir);
  let createdOperationHooksConfig = false;
  if (shouldCreateArtifacts && !fs.existsSync(operationHooksPathValue) && fs.existsSync(artifactsPath)) {
    const artifactsXml = fs.readFileSync(artifactsPath, 'utf-8');
    const artifactIds = [
      featureConfig.knowledgeSync.enabled && artifactExists(artifactsXml, 'docs-knowledge-artifact')
        ? 'docs-knowledge-artifact'
        : null,
      featureConfig.projectMemory.enabled && artifactExists(artifactsXml, 'project-memory-artifact')
        ? 'project-memory-artifact'
        : null,
    ].filter((value): value is string => typeof value === 'string');

    if (artifactIds.length > 0) {
      fs.writeFileSync(operationHooksPathValue, buildFeatureOperationHooksXml(artifactIds), 'utf-8');
      createdOperationHooksConfig = true;
    }
  }

  const featurePath = featureConfigPath(codumentDir);
  let migratedKnowledgeTargets = false;
  if (createdArtifactsConfig && featureConfig.knowledgeSync.targets.length > 0 && fs.existsSync(featurePath)) {
    const raw = JSON.parse(fs.readFileSync(featurePath, 'utf-8')) as unknown;
    if (isObject(raw)) {
      const knowledgeSyncRaw = isObject(raw.knowledgeSync) ? raw.knowledgeSync : {};
      const writeValue = {
        ...raw,
        knowledgeSync: {
          ...Object.fromEntries(
            Object.entries(knowledgeSyncRaw).filter(([key]) => key !== 'targets')
          ),
          enabled: featureConfig.knowledgeSync.enabled,
        },
      };
      fs.writeFileSync(featurePath, `${JSON.stringify(writeValue, null, 2)}\n`, 'utf-8');
      migratedKnowledgeTargets = true;
    }
  }

  return {
    createdArtifactsConfig,
    createdOperationHooksConfig,
    migratedKnowledgeTargets,
    addedProfiles,
  };
}

export function resolveAttractorProfile(
  profileName = 'default',
  codumentDir = CODUMENT_DIR,
  workspaceDir = process.cwd(),
): { profile: AttractorProfile; missingFiles: string[] } | null {
  const profiles = loadAttractorProfiles(codumentDir);
  const profile = profiles.profiles[profileName];
  if (!profile) {
    return null;
  }

  const missingFiles = profile.attractors.filter((attractorPath) => {
    const absolutePath = path.isAbsolute(attractorPath)
      ? attractorPath
      : path.resolve(workspaceDir, attractorPath);
    return !fs.existsSync(absolutePath);
  });

  return { profile, missingFiles };
}

export function ensureFeatureConfig(codumentDir = CODUMENT_DIR): FeatureConfig {
  const configPath = featureConfigPath(codumentDir);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, `${JSON.stringify(DEFAULT_FEATURE_CONFIG_FILE, null, 2)}\n`, 'utf-8');
    return structuredClone(DEFAULT_FEATURE_CONFIG);
  }

  const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as unknown;
  const merged = mergeFeatureConfigDefaults(raw);
  if (shouldRewriteFeatureConfig(raw)) {
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
