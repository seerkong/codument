import * as fs from 'fs';
import * as path from 'path';
import { CODUMENT_DIR } from '../utils';
import { DEFAULT_THRESHOLDS, type LintThresholds } from './lint';
import { DEFAULT_POLICY, type MergePolicy, type ConflictType, type Resolve } from './merge';

/**
 * codument/config/modeling.xml gate + settings.
 *
 * Default OFF: when the file is absent or `enabled` is not "true", modeling is
 * disabled and all modeling behavior (track delta, archive merge, lint) is skipped.
 * Lightweight regex read (the file is small and flat); no XML dependency.
 */

export interface ModelingConfig {
  enabled: boolean;
  registryDir: string;
  thresholds: LintThresholds;
  mergePolicy: MergePolicy;
}

export function modelingConfigPath(workspaceDir = '.'): string {
  return path.join(workspaceDir, CODUMENT_DIR, 'config', 'modeling.xml');
}

function matchNum(xml: string, re: RegExp): number | undefined {
  const m = re.exec(xml);
  return m ? Number(m[1]) : undefined;
}

const VALID_RESOLVE = new Set<Resolve>(['human', 'ours', 'theirs', 'base']);

export function loadModelingConfig(configPath = modelingConfigPath()): ModelingConfig {
  const def: ModelingConfig = {
    enabled: false,
    registryDir: path.join(CODUMENT_DIR, 'modeling'),
    thresholds: { ...DEFAULT_THRESHOLDS },
    mergePolicy: { ...DEFAULT_POLICY },
  };
  if (!fs.existsSync(configPath)) return def;

  const xml = fs.readFileSync(configPath, 'utf-8');
  const enabled = /<Modeling[^>]*\benabled="true"/.test(xml);
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
