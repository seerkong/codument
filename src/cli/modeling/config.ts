import * as fs from 'fs';
import * as path from 'path';
import { CODUMENT_DIR } from '../utils';
import { DEFAULT_THRESHOLDS, type LintThresholds } from './lint';
import { DEFAULT_POLICY, type MergePolicy, type ConflictType, type Resolve } from './merge';
import { loadRegistrySettingsXnl, resolveConfigAuthority } from '../config/registry-settings';

/**
 * codument/config/modeling.xnl gate + settings (legacy XML remains readable).
 *
 * Default ON: when the file is absent or omits `enabled`, modeling is enabled.
 * An explicit `enabled="false"` disables modeling behavior for that workspace.
 * Lightweight regex read (the file is small and flat); no XML dependency.
 */

export interface ModelingConfig {
  enabled: boolean;
  registryDir: string;
  thresholds: LintThresholds;
  mergePolicy: MergePolicy;
}

export function modelingConfigPath(workspaceDir = '.'): string {
  return path.join(workspaceDir, CODUMENT_DIR, 'config', 'modeling.xnl');
}

function matchNum(xml: string, re: RegExp): number | undefined {
  const m = re.exec(xml);
  return m ? Number(m[1]) : undefined;
}

const VALID_RESOLVE = new Set<Resolve>(['human', 'ours', 'theirs', 'base']);

export function loadModelingConfig(configPath = modelingConfigPath()): ModelingConfig {
  const def: ModelingConfig = {
    enabled: true,
    registryDir: path.join(CODUMENT_DIR, 'modeling'),
    thresholds: { ...DEFAULT_THRESHOLDS },
    mergePolicy: { ...DEFAULT_POLICY },
  };
  const authority = resolveConfigAuthority(configPath);
  if (!authority) return def;

  if (path.extname(authority).toLowerCase() === '.xnl') {
    const config = loadRegistrySettingsXnl(authority, 'ModelingConfig');
    const mergePolicy: MergePolicy = { ...DEFAULT_POLICY };
    for (const item of config.conflicts) {
      const type = item.type as ConflictType;
      const resolve = item.resolve as Resolve;
      if (type in mergePolicy && VALID_RESOLVE.has(resolve)) mergePolicy[type] = resolve;
    }
    return {
      enabled: config.enabled ?? def.enabled,
      registryDir: def.registryDir,
      thresholds: {
        maxLines: config.maxLines ?? DEFAULT_THRESHOLDS.maxLines,
        maxNodes: config.maxNodes ?? DEFAULT_THRESHOLDS.maxNodes,
      },
      mergePolicy,
    };
  }

  const xml = fs.readFileSync(authority, 'utf-8');
  const enabledAttr = /<Modeling[^>]*\benabled="(true|false)"/.exec(xml)?.[1];
  const enabled = enabledAttr === undefined ? def.enabled : enabledAttr === 'true';
  const maxLines = matchNum(xml, /<Lint[^>]*\bmaxLines="(\d+)"/);
  const maxNodes = matchNum(xml, /<Lint[^>]*\bmaxNodes="(\d+)"/);

  const mergePolicy: MergePolicy = { ...DEFAULT_POLICY };
  for (const m of xml.matchAll(/<Conflict\s+type="([^"]+)"\s+resolve="([^"]+)"/g)) {
    const type = m[1] as ConflictType;
    const resolve = m[2] as Resolve;
    if (type in mergePolicy && VALID_RESOLVE.has(resolve)) mergePolicy[type] = resolve;
  }

  return {
    enabled,
    registryDir: def.registryDir,
    thresholds: {
      maxLines: maxLines ?? DEFAULT_THRESHOLDS.maxLines,
      maxNodes: maxNodes ?? DEFAULT_THRESHOLDS.maxNodes,
    },
    mergePolicy,
  };
}

/** True when modeling is enabled in this workspace. */
export function modelingEnabled(workspaceDir = '.'): boolean {
  return loadModelingConfig(modelingConfigPath(workspaceDir)).enabled;
}
