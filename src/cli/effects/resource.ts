import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export type ResourceEntryKind = 'file' | 'directory';

export interface ResourceEntry {
  path: string;
  name: string;
  kind: ResourceEntryKind;
  size?: number;
}

export interface ResourceEffect {
  stat(resourcePath: string): Promise<ResourceEntry | undefined>;
  readDirectory(resourcePath: string): Promise<readonly ResourceEntry[] | undefined>;
  readText(resourcePath: string): Promise<string | undefined>;
}

export const EMBEDDED_RESOURCE_PREFIX = 'codument-resource/';

function logicalPath(value: string): string {
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
  if (normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new Error(`Invalid packaged resource path: ${value}`);
  }
  return normalized === '.' ? '' : normalized;
}

function entryName(value: string): string {
  const parts = value.split('/');
  return parts.at(-1) ?? '';
}

export class SourceResourceEffect implements ResourceEffect {
  constructor(private readonly root: string) {}

  private resolve(resourcePath: string): { logical: string; physical: string } {
    const logical = logicalPath(resourcePath);
    return { logical, physical: path.join(this.root, ...logical.split('/').filter(Boolean)) };
  }

  async stat(resourcePath: string): Promise<ResourceEntry | undefined> {
    const { logical, physical } = this.resolve(resourcePath);
    try {
      const value = await fs.stat(physical);
      return {
        path: logical,
        name: entryName(logical),
        kind: value.isDirectory() ? 'directory' : 'file',
        size: value.isFile() ? value.size : undefined,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }

  async readDirectory(resourcePath: string): Promise<readonly ResourceEntry[] | undefined> {
    const { logical, physical } = this.resolve(resourcePath);
    try {
      const entries = await fs.readdir(physical, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory() || entry.isFile())
        .map((entry) => ({
          path: [logical, entry.name].filter(Boolean).join('/'),
          name: entry.name,
          kind: entry.isDirectory() ? 'directory' as const : 'file' as const,
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ENOTDIR') {
        return undefined;
      }
      throw error;
    }
  }

  async readText(resourcePath: string): Promise<string | undefined> {
    const { physical } = this.resolve(resourcePath);
    try {
      return await fs.readFile(physical, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'EISDIR') {
        return undefined;
      }
      throw error;
    }
  }
}

interface NamedBlob extends Blob {
  name?: string;
}

export class EmbeddedResourceEffect implements ResourceEffect {
  private readonly files = new Map<string, Blob>();
  private readonly directories = new Set<string>(['']);

  constructor(blobs: readonly NamedBlob[], prefix = EMBEDDED_RESOURCE_PREFIX) {
    for (const blob of blobs) {
      const name = blob.name?.replaceAll('\\', '/');
      const prefixIndex = name?.indexOf(prefix) ?? -1;
      if (!name || prefixIndex < 0) continue;
      const resourcePath = logicalPath(name.slice(prefixIndex + prefix.length));
      this.files.set(resourcePath, blob);
      const parts = resourcePath.split('/');
      for (let index = 1; index < parts.length; index++) {
        this.directories.add(parts.slice(0, index).join('/'));
      }
    }
  }

  async stat(resourcePath: string): Promise<ResourceEntry | undefined> {
    const logical = logicalPath(resourcePath);
    const file = this.files.get(logical);
    if (file) return { path: logical, name: entryName(logical), kind: 'file', size: file.size };
    if (this.directories.has(logical)) return { path: logical, name: entryName(logical), kind: 'directory' };
    return undefined;
  }

  async readDirectory(resourcePath: string): Promise<readonly ResourceEntry[] | undefined> {
    const logical = logicalPath(resourcePath);
    if (!this.directories.has(logical)) return undefined;
    const prefix = logical ? `${logical}/` : '';
    const entries = new Map<string, ResourceEntry>();

    for (const directory of this.directories) {
      if (!directory.startsWith(prefix) || directory === logical) continue;
      const remainder = directory.slice(prefix.length);
      if (!remainder || remainder.includes('/')) continue;
      entries.set(remainder, { path: `${prefix}${remainder}`, name: remainder, kind: 'directory' });
    }
    for (const [filePath, file] of this.files) {
      if (!filePath.startsWith(prefix)) continue;
      const remainder = filePath.slice(prefix.length);
      if (!remainder || remainder.includes('/')) continue;
      entries.set(remainder, { path: filePath, name: remainder, kind: 'file', size: file.size });
    }
    return [...entries.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  async readText(resourcePath: string): Promise<string | undefined> {
    return this.files.get(logicalPath(resourcePath))?.text();
  }
}

export function createPackagedResourceEffect(): ResourceEffect {
  const embedded = new EmbeddedResourceEffect(Bun.embeddedFiles as readonly NamedBlob[]);
  return new LazyResourceEffect(embedded);
}

class LazyResourceEffect implements ResourceEffect {
  private selected?: Promise<ResourceEffect>;

  constructor(private readonly embedded: EmbeddedResourceEffect) {}

  private resolve(): Promise<ResourceEffect> {
    this.selected ??= this.embedded.readDirectory('').then((entries) => {
      if (entries && entries.length > 0) return this.embedded;
      return new SourceResourceEffect(path.resolve(import.meta.dir, '..', '..', 'templates'));
    });
    return this.selected;
  }

  async stat(resourcePath: string): Promise<ResourceEntry | undefined> {
    return (await this.resolve()).stat(resourcePath);
  }

  async readDirectory(resourcePath: string): Promise<readonly ResourceEntry[] | undefined> {
    return (await this.resolve()).readDirectory(resourcePath);
  }

  async readText(resourcePath: string): Promise<string | undefined> {
    return (await this.resolve()).readText(resourcePath);
  }
}

export async function walkResourceFiles(effect: ResourceEffect, resourcePath = ''): Promise<readonly ResourceEntry[]> {
  const entries = await effect.readDirectory(resourcePath);
  if (!entries) return [];
  const files: ResourceEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === 'directory') files.push(...await walkResourceFiles(effect, entry.path));
    else files.push(entry);
  }
  return files;
}
