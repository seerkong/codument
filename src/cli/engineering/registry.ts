import * as fs from 'fs';
import * as path from 'path';
import { parseXnl, XnlParseError } from 'xnl-core';
import type { XnlNode, DataElementNode } from 'xnl-core';
import {
  discoverXnlRegistryFiles,
  isDataElement as isGenericDataElement,
  readStableNodeId,
  serializeXnlFile,
} from '../xnl/registry';

/**
 * codument engineering registry adapter.
 *
 * The registry is a plain, host-git-versioned working tree of `.xnl` files under
 * `codument/engineering/<plane>/<category>/...`. We load/save via xnl-core (parse +
 * lineBlock formatter) and index nodes by their namespaced id. No parallel vcs repo
 * is persisted; node-level 3-way merge (see merge.ts) uses xnl-vfs ephemerally.
 */

export interface EngineeringNodeRef {
  /** Namespaced id, e.g. `backend.howto.orders.add_endpoint`. */
  id: string;
  node: DataElementNode;
  /** Path relative to the engineering dir, e.g. `backend/howto/orders.xnl`. */
  file: string;
  /** `engineering://<plane>/<category>/<topic>/<name>` derived from the file path + id. */
  uri: string;
}

export interface EngineeringRegistry {
  dir: string;
  /** relPath -> top-level nodes of that file (preserves order for save). */
  files: Map<string, XnlNode[]>;
  /** namespaced id -> ref. */
  index: Map<string, EngineeringNodeRef>;
}

export function isDataElement(node: XnlNode | undefined): node is DataElementNode {
  return isGenericDataElement(node);
}

/** Read a node's namespaced id from `#word` or `metadata.id`. */
export function readNodeId(node: XnlNode): string | undefined {
  if (!isDataElement(node)) return undefined;
  return readStableNodeId(node);
}

/** Last segment of a namespaced id (`a.b.name` -> `name`). */
export function nodeName(id: string): string {
  const parts = id.split('.');
  return parts[parts.length - 1];
}

/**
 * Namespace prefix of a namespaced id (`a.b.name` -> `a.b`, `name` -> ``).
 * The namespace is the id minus its trailing `name` segment; a bare name yields
 * the empty string. Used by id↔path alignment and engineering-uri derivation.
 */
export function idNamespace(id: string): string {
  const parts = id.split('.');
  return parts.slice(0, -1).join('.');
}

/** Build `engineering://<plane>/<category>/<topic>/<name>` from a file path and node id. */
export function engineeringUri(relFile: string, id: string): string {
  const segs = relFile.split(path.sep).filter(Boolean);
  const plane = segs[0] ?? 'global';
  const category = segs[1] ?? 'overview';
  const topic = (segs[2] ?? 'index').replace(/\.xnl$/i, '');
  return `engineering://${plane}/${category}/${topic}/${nodeName(id)}`;
}

/** Load the engineering registry from a working tree directory. */
export function loadEngineeringRegistry(dir: string): EngineeringRegistry {
  const files = new Map<string, XnlNode[]>();
  const index = new Map<string, EngineeringNodeRef>();
  const relFiles = discoverXnlRegistryFiles(dir);

  for (const relFile of relFiles) {
    const nativeRelFile = relFile.split('/').join(path.sep);
    const content = fs.readFileSync(path.join(dir, ...relFile.split('/')), 'utf-8');
    const nodes = parseXnl(content, { textBlockStyle: true }).nodes;
    files.set(nativeRelFile, nodes);
    for (const node of nodes) {
      const id = readNodeId(node);
      if (!id || !isDataElement(node)) continue;
      if (index.has(id)) {
        throw new Error(
          `Duplicate engineering node id '${id}' in '${nativeRelFile}' and '${index.get(id)!.file}'`,
        );
      }
      index.set(id, { id, node, file: nativeRelFile, uri: engineeringUri(nativeRelFile, id) });
    }
  }

  return { dir, files, index };
}

/**
 * A non-fatal load issue collected by {@link loadEngineeringRegistrySafe}: an XNL
 * parse error (`syntax`) or a cross-file duplicate id (`duplicate-id`). The
 * validate engine maps these onto its own finding shape.
 */
export interface LoadIssue {
  kind: 'syntax' | 'duplicate-id';
  /** Path relative to the registry dir. */
  file: string;
  /** 1-based line, when known (parse errors carry one). */
  line?: number;
  message: string;
  /** For duplicate ids: the other file that already defined the id. */
  otherFile?: string;
}

export interface SafeRegistryResult {
  registry: EngineeringRegistry;
  issues: LoadIssue[];
}

/**
 * Load the engineering registry without throwing. Files that fail XNL parsing are
 * skipped (their error is collected as a `syntax` issue); duplicate ids are
 * collected as `duplicate-id` issues (first definition wins in the index)
 * instead of aborting the load. The non-safe {@link loadEngineeringRegistry}
 * keeps its throwing contract for existing callers (lint, merge, archive).
 */
export function loadEngineeringRegistrySafe(dir: string): SafeRegistryResult {
  const files = new Map<string, XnlNode[]>();
  const index = new Map<string, EngineeringNodeRef>();
  const issues: LoadIssue[] = [];
  const relFiles = discoverXnlRegistryFiles(dir);

  for (const relFile of relFiles) {
    const nativeRelFile = relFile.split('/').join(path.sep);
    const content = fs.readFileSync(path.join(dir, ...relFile.split('/')), 'utf-8');
    let nodes: XnlNode[];
    try {
      nodes = parseXnl(content, { textBlockStyle: true }).nodes;
    } catch (err) {
      if (err instanceof XnlParseError) {
        issues.push({ kind: 'syntax', file: nativeRelFile, line: err.line, message: err.message });
        continue;
      }
      throw err;
    }
    files.set(nativeRelFile, nodes);
    for (const node of nodes) {
      const id = readNodeId(node);
      if (!id || !isDataElement(node)) continue;
      const existing = index.get(id);
      if (existing) {
        issues.push({
          kind: 'duplicate-id',
          file: nativeRelFile,
          otherFile: existing.file,
          message: `Duplicate engineering node id '${id}' in '${nativeRelFile}' and '${existing.file}'`,
        });
        continue;
      }
      index.set(id, { id, node, file: nativeRelFile, uri: engineeringUri(nativeRelFile, id) });
    }
  }

  return { registry: { dir, files, index }, issues };
}

export interface SerializeOptions {
  /**
   * Marker factory for markerless text blocks. Defaults to xnl-core's ULID factory,
   * which preserves XNL text nodes' escape-free property (a markerless `?>` block
   * gets a stable unique marker on first write, then round-trips unchanged).
   * Tests may inject a deterministic factory; production MUST keep the ULID default.
   */
  textMarkerFactory?: () => string;
  /**
   * Block text style (default true for engineering files): render each text element's
   * content on its own indented line(s) between `<tag ?m>` and `</?m>`, so registry
   * files stay readable and diff-friendly. Paired with `parseXnl(.., {textBlockStyle})`.
   */
  textBlockStyle?: boolean;
}

/** Serialize top-level nodes of a file to XNL (lineBlock pretty, block text style). */
export function serializeEngineeringFile(nodes: XnlNode[], opts: SerializeOptions = {}): string {
  return serializeXnlFile(nodes, opts);
}

/** Write one engineering file back to the working tree. */
export function saveEngineeringFile(
  dir: string,
  relFile: string,
  nodes: XnlNode[],
  opts: SerializeOptions = {},
): void {
  const abs = path.join(dir, relFile);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, serializeEngineeringFile(nodes, opts), 'utf-8');
}

/** Save the whole registry back to its working tree. */
export function saveEngineeringRegistry(
  registry: EngineeringRegistry,
  targetDir = registry.dir,
  opts: SerializeOptions = {},
): void {
  for (const [relFile, nodes] of registry.files) {
    saveEngineeringFile(targetDir, relFile, nodes, opts);
  }
}
