import * as fs from 'fs';
import * as path from 'path';
import {
  parseXnl,
  stringifyLineBlock,
  wordToString,
  XnlParseError,
} from 'xnl-core';
import type { DataElementNode, ElementNode, XnlNode, XnlWord } from 'xnl-core';

/**
 * Domain-neutral loader/index for recursive XNL registries.
 *
 * Domain adapters decide which data elements are registry identities through
 * `shouldIndex`; the loader owns deterministic file discovery, parsing,
 * recursive traversal, stable-id indexing, and non-fatal issue collection.
 */

export type RegistryNodePathSegment =
  | { kind: 'root'; index: number }
  | { kind: 'body'; index: number }
  | { kind: 'extend'; key: string }
  | { kind: 'attributes'; key: string }
  | { kind: 'metadata'; key: string }
  | { kind: 'array'; index: number }
  | { kind: 'object'; key: string };

export interface XnlRegistryAncestor {
  tag: string;
  id?: string;
  node: DataElementNode;
}

export interface XnlRegistryOwner {
  /** Portable path relative to the registry root. */
  file: string;
  /** Position in the parsed file's top-level node array. */
  topLevelIndex: number;
}

export interface XnlRegistryNodeRef {
  id: string;
  node: DataElementNode;
  /** Portable path relative to the registry root. */
  file: string;
  owner: XnlRegistryOwner;
  /** All containing data elements, nearest ancestor last. */
  ancestors: XnlRegistryAncestor[];
  /** Direct containing data element, when present. */
  parent?: Pick<XnlRegistryAncestor, 'tag' | 'id'>;
  /** Structural location inside the owner file. */
  path: RegistryNodePathSegment[];
  /** Optional domain URI supplied by an adapter. */
  uri?: string;
}

export interface XnlRegistry {
  dir: string;
  /** Portable relPath -> parsed top-level nodes, in deterministic file order. */
  files: Map<string, XnlNode[]>;
  /** Stable node id -> first unique definition. */
  index: Map<string, XnlRegistryNodeRef>;
}

export interface RegistryTraversalContext {
  file: string;
  owner: XnlRegistryOwner;
  ancestors: XnlRegistryAncestor[];
  path: RegistryNodePathSegment[];
}

export interface LoadXnlRegistryOptions {
  /** Human-readable domain name used in diagnostics, e.g. "decision". */
  registryName?: string;
  /**
   * Select identities owned by this registry. The default selects every data
   * element that already has a stable id, avoiding missing-id findings for
   * ordinary structural/text wrapper nodes.
   */
  shouldIndex?: (node: DataElementNode, context: RegistryTraversalContext) => boolean;
  /** Override stable-id extraction for a domain-specific identity scheme. */
  readId?: (node: DataElementNode) => string | undefined;
  /** Optionally derive a logical URI without coupling identity to file layout. */
  uriFor?: (file: string, id: string, node: DataElementNode) => string;
}

export type XnlRegistryLoadIssueKind = 'syntax' | 'duplicate-id' | 'missing-id';

export interface XnlRegistryLoadIssue {
  kind: XnlRegistryLoadIssueKind;
  file: string;
  line?: number;
  message: string;
  id?: string;
  otherFile?: string;
  nodeTag?: string;
  path?: RegistryNodePathSegment[];
}

export interface SafeXnlRegistryResult {
  registry: XnlRegistry;
  issues: XnlRegistryLoadIssue[];
}

export interface SerializeXnlOptions {
  /**
   * Marker factory for markerless text elements. Production callers normally
   * use xnl-core's default ULID factory; tests may inject deterministic values.
   */
  textMarkerFactory?: () => string;
  /**
   * Render text elements in block form by default so parsing with
   * `{ textBlockStyle: true }` is a semantic inverse.
   */
  textBlockStyle?: boolean;
  /** Number of spaces or literal indentation string used by xnl-core. */
  indent?: number | string;
}

/**
 * Serialize complete XNL nodes without projecting through a domain DTO.
 *
 * Arbitrary attributes, metadata, extension slots, nested elements, objects,
 * arrays, comments, and text nodes are passed directly to xnl-core.
 */
export function serializeXnlFile(
  nodes: XnlNode[],
  options: SerializeXnlOptions = {},
): string {
  return nodes
    .map((node) => stringifyLineBlock(node, { textBlockStyle: true, ...options }))
    .join('\n\n') + '\n';
}

function portableRelative(base: string, file: string): string {
  return path.relative(base, file).split(path.sep).join('/');
}

function comparePortablePaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function walkXnlFiles(dir: string, base: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkXnlFiles(absolute, base, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.xnl')) {
      out.push(portableRelative(base, absolute));
    }
  }
}

/** Discover non-hidden `.xnl` files recursively using portable stable ordering. */
export function discoverXnlRegistryFiles(dir: string): string[] {
  const files: string[] = [];
  walkXnlFiles(dir, dir, files);
  files.sort(comparePortablePaths);
  return files;
}

export function isDataElement(node: XnlNode | undefined): node is DataElementNode {
  return Boolean(
    node
    && typeof node === 'object'
    && !Array.isArray(node)
    && (node as DataElementNode).kind === 'DataElement',
  );
}

function valueAsStableId(value: XnlNode | undefined): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as XnlWord).kind === 'Word'
  ) {
    return wordToString(value as XnlWord);
  }
  return undefined;
}

/** Read stable identity from `#word`, `attributes.id`, or `metadata.id`. */
export function readStableNodeId(node: DataElementNode): string | undefined {
  return wordToString(node.id)
    ?? valueAsStableId(node.attributes?.id)
    ?? valueAsStableId(node.metadata?.id);
}

class RegistryLoadError extends Error {
  constructor(readonly issue: XnlRegistryLoadIssue) {
    super(issue.message);
    this.name = 'RegistryLoadError';
  }
}

interface MutableLoadState {
  registry: XnlRegistry;
  issues: XnlRegistryLoadIssue[];
  safe: boolean;
  options: Required<Pick<LoadXnlRegistryOptions, 'registryName' | 'readId'>> & LoadXnlRegistryOptions;
}

function reportIssue(state: MutableLoadState, issue: XnlRegistryLoadIssue): void {
  if (state.safe) {
    state.issues.push(issue);
    return;
  }
  throw new RegistryLoadError(issue);
}

function orderedExtendKeys(node: DataElementNode): string[] {
  if (!node.extend) return [];
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const key of node.extend.order ?? []) {
    if (node.extend.children[key] && !seen.has(key)) {
      keys.push(key);
      seen.add(key);
    }
  }
  const remaining = Object.keys(node.extend.children)
    .filter((key) => !seen.has(key))
    .sort(comparePortablePaths);
  return [...keys, ...remaining];
}

/**
 * Return direct element children in XNL structural order: singleton slots from
 * `()` first, followed by collection/legacy children from `[]`.
 */
export function orderedElementChildren(node: DataElementNode): ElementNode[] {
  const children = orderedExtendKeys(node)
    .map((key) => node.extend?.children[key])
    .filter((child): child is ElementNode => child !== undefined);
  for (const child of node.body ?? []) {
    if (
      child
      && typeof child === 'object'
      && !Array.isArray(child)
      && ((child as ElementNode).kind === 'DataElement' || (child as ElementNode).kind === 'TextElement')
    ) {
      children.push(child as ElementNode);
    }
  }
  return children;
}

function childContext(
  context: RegistryTraversalContext,
  node: DataElementNode,
  segment: RegistryNodePathSegment,
): RegistryTraversalContext {
  return {
    ...context,
    ancestors: [
      ...context.ancestors,
      { tag: node.tag, id: readStableNodeId(node), node },
    ],
    path: [...context.path, segment],
  };
}

function visitValue(
  value: XnlNode,
  context: RegistryTraversalContext,
  state: MutableLoadState,
): void {
  if (isDataElement(value)) {
    const id = state.options.readId(value);
    const selected = state.options.shouldIndex
      ? state.options.shouldIndex(value, context)
      : Boolean(id);

    if (selected && !id) {
      reportIssue(state, {
        kind: 'missing-id',
        file: context.file,
        nodeTag: value.tag,
        path: context.path,
        message: `Missing ${state.options.registryName} node id for <${value.tag}> in '${context.file}'`,
      });
    } else if (selected && id) {
      const existing = state.registry.index.get(id);
      if (existing) {
        reportIssue(state, {
          kind: 'duplicate-id',
          file: context.file,
          otherFile: existing.file,
          id,
          nodeTag: value.tag,
          path: context.path,
          message:
            `Duplicate ${state.options.registryName} node id '${id}'`
            + ` in '${context.file}' and '${existing.file}'`,
        });
      } else {
        const parent = context.ancestors.at(-1);
        state.registry.index.set(id, {
          id,
          node: value,
          file: context.file,
          owner: context.owner,
          ancestors: context.ancestors,
          parent: parent ? { tag: parent.tag, id: parent.id } : undefined,
          path: context.path,
          uri: state.options.uriFor?.(context.file, id, value),
        });
      }
    }

    for (let index = 0; index < (value.body?.length ?? 0); index += 1) {
      visitValue(
        value.body![index],
        childContext(context, value, { kind: 'body', index }),
        state,
      );
    }
    for (const key of orderedExtendKeys(value)) {
      visitValue(
        value.extend!.children[key],
        childContext(context, value, { kind: 'extend', key }),
        state,
      );
    }
    for (const key of Object.keys(value.attributes ?? {}).sort(comparePortablePaths)) {
      visitValue(
        value.attributes![key],
        childContext(context, value, { kind: 'attributes', key }),
        state,
      );
    }
    for (const key of Object.keys(value.metadata ?? {}).sort(comparePortablePaths)) {
      visitValue(
        value.metadata[key],
        childContext(context, value, { kind: 'metadata', key }),
        state,
      );
    }
    return;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      visitValue(value[index], { ...context, path: [...context.path, { kind: 'array', index }] }, state);
    }
    return;
  }

  if (value && typeof value === 'object') {
    for (const key of Object.keys(value).sort(comparePortablePaths)) {
      visitValue(
        (value as Record<string, XnlNode>)[key],
        { ...context, path: [...context.path, { kind: 'object', key }] },
        state,
      );
    }
  }
}

function loadXnlRegistryInternal(
  dir: string,
  options: LoadXnlRegistryOptions,
  safe: boolean,
): SafeXnlRegistryResult {
  const registry: XnlRegistry = {
    dir,
    files: new Map<string, XnlNode[]>(),
    index: new Map<string, XnlRegistryNodeRef>(),
  };
  const state: MutableLoadState = {
    registry,
    issues: [],
    safe,
    options: {
      ...options,
      registryName: options.registryName ?? 'XNL registry',
      readId: options.readId ?? readStableNodeId,
    },
  };

  for (const relFile of discoverXnlRegistryFiles(dir)) {
    const absolute = path.join(dir, ...relFile.split('/'));
    let nodes: XnlNode[];
    try {
      nodes = parseXnl(fs.readFileSync(absolute, 'utf-8'), { textBlockStyle: true }).nodes;
    } catch (error) {
      if (safe && error instanceof XnlParseError) {
        state.issues.push({
          kind: 'syntax',
          file: relFile,
          line: error.line,
          message: error.message,
        });
        continue;
      }
      throw error;
    }

    registry.files.set(relFile, nodes);
    for (let topLevelIndex = 0; topLevelIndex < nodes.length; topLevelIndex += 1) {
      const owner = { file: relFile, topLevelIndex };
      visitValue(
        nodes[topLevelIndex],
        {
          file: relFile,
          owner,
          ancestors: [],
          path: [{ kind: 'root', index: topLevelIndex }],
        },
        state,
      );
    }
  }

  return { registry, issues: state.issues };
}

/** Load a registry, throwing on syntax, missing selected ids, or duplicate ids. */
export function loadXnlRegistry(
  dir: string,
  options: LoadXnlRegistryOptions = {},
): XnlRegistry {
  return loadXnlRegistryInternal(dir, options, false).registry;
}

/**
 * Load all parseable files, collecting syntax/identity issues. For duplicate
 * ids the first definition in portable file/traversal order remains indexed.
 */
export function loadXnlRegistrySafe(
  dir: string,
  options: LoadXnlRegistryOptions = {},
): SafeXnlRegistryResult {
  return loadXnlRegistryInternal(dir, options, true);
}
