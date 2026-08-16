import * as fs from 'fs';
import * as path from 'path';
import { type DataElementNode, type XnlNode } from 'xnl-core';
import { parseConfigRoot } from './resource';

export interface RegistrySettingsProjection {
  enabled?: boolean;
  maxLines?: number;
  maxNodes?: number;
  conflicts: Array<{ type: string; resolve: string }>;
}

export function resolveConfigAuthority(preferredPath: string): string | undefined {
  if (fs.existsSync(preferredPath)) return preferredPath;
  if (path.extname(preferredPath).toLowerCase() === '.xnl') {
    const legacy = preferredPath.slice(0, -'.xnl'.length) + '.xml';
    if (fs.existsSync(legacy)) return legacy;
  }
  return undefined;
}

export function loadRegistrySettingsXnl(file: string, expectedTag: string): RegistrySettingsProjection {
  const root = parseConfigRoot(file, expectedTag);
  const lint = child(root, 'Lint');
  const conflicts = child(child(root, 'MergePolicy'), 'Conflicts');
  return {
    enabled: boolean(root.attributes?.enabled),
    maxLines: number(lint?.attributes?.max_lines),
    maxNodes: number(lint?.attributes?.max_nodes),
    conflicts: (conflicts?.body ?? []).filter(isDataElement).map((conflict) => ({
      type: string(conflict.attributes?.type) ?? '',
      resolve: string(conflict.attributes?.resolve) ?? '',
    })),
  };
}

function child(node: DataElementNode | undefined, tag: string): DataElementNode | undefined {
  const value = node?.extend?.children[tag];
  return isDataElement(value) ? value : undefined;
}

function string(value: XnlNode | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function number(value: XnlNode | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function boolean(value: XnlNode | undefined): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function isDataElement(value: XnlNode | undefined): value is DataElementNode {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && 'kind' in value && value.kind === 'DataElement');
}
