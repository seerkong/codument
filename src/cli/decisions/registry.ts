import * as fs from 'fs';
import * as path from 'path';
import type { DataElementNode, XnlNode } from 'xnl-core';
import { parseXnl } from 'xnl-core';
import {
  discoverXnlRegistryFiles,
  isDataElement,
  loadXnlRegistrySafe,
  readStableNodeId,
  serializeXnlFile,
  type SafeXnlRegistryResult,
  type XnlRegistryNodeRef,
} from '../xnl/registry';
import { parseCodumentVfsUri } from '../utils/vfs';
import { validateDecisionsFile } from '../commands/decisions';

export interface DecisionSourceFile {
  source: string;
  ownerFile: string;
  nodes: XnlNode[];
}

const DECISION_REGISTRY_OPTIONS = {
  registryName: 'decision',
  shouldIndex: (node: DataElementNode) => node.tag === 'decision',
  uriFor: (_file: string, id: string) => `decision://${id}`,
};

/** Load the recursive durable decision registry and build its global stable-id index. */
export function loadDecisionRegistrySafe(dir: string): SafeXnlRegistryResult {
  return loadXnlRegistrySafe(dir, DECISION_REGISTRY_OPTIONS);
}

/** Extract a stable decision id from either a bare id or `decision://<id>`. */
export function decisionIdFromReference(reference: string): string {
  if (!reference.includes('://')) return reference;
  const parsed = parseCodumentVfsUri(reference);
  if (parsed.scheme !== 'decision') {
    throw new Error(`Expected a decision URI, received '${reference}'`);
  }
  return parsed.segments.join('/');
}

/**
 * Resolve a logical decision reference without coupling identity to the owner
 * file. Any registry issue makes resolution fail closed.
 */
export function resolveDecisionRegistryReference(
  dir: string,
  reference: string,
): XnlRegistryNodeRef {
  const id = decisionIdFromReference(reference);
  const loaded = loadDecisionRegistrySafe(dir);
  if (loaded.issues.length > 0) {
    throw new Error(loaded.issues.map((issue) => issue.message).join('\n'));
  }
  const resolved = loaded.registry.index.get(id);
  if (!resolved) {
    throw new Error(`Decision not found: ${id}`);
  }
  return resolved;
}

function decisionProperty(node: DataElementNode, key: string): unknown {
  return node.attributes?.[key] ?? node.metadata?.[key];
}

function isDurableResolvedDecision(node: DataElementNode): boolean {
  if (node.tag !== 'decision') return false;
  const durable = decisionProperty(node, 'durable_candidate')
    ?? decisionProperty(node, 'durable-candidate');
  const status = String(decisionProperty(node, 'status') ?? '').toLowerCase();
  return (durable === true || String(durable).toLowerCase() === 'true')
    && (status === 'accepted' || status === 'resolved');
}

function containsDurableDecision(node: XnlNode): boolean {
  if (!isDataElement(node)) return false;
  if (isDurableResolvedDecision(node)) return true;
  return (node.body ?? []).some(containsDurableDecision);
}

function selectedRoots(nodes: XnlNode[]): XnlNode[] {
  return nodes.filter(containsDurableDecision);
}

export function collectDecisionSourceFiles(trackDir: string): DecisionSourceFile[] {
  const sources: DecisionSourceFile[] = [];
  const root = path.join(trackDir, 'decisions.xnl');
  if (fs.existsSync(root)) {
    const parsed = parseXnl(fs.readFileSync(root, 'utf-8'), { textBlockStyle: true }).nodes;
    const selected = selectedRoots(parsed);
    if (selected.length > 0) {
      sources.push({ source: root, ownerFile: 'registry.xnl', nodes: selected });
    }
  }

  const nestedRoot = path.join(trackDir, 'decisions');
  for (const relFile of discoverXnlRegistryFiles(nestedRoot)) {
    const source = path.join(nestedRoot, ...relFile.split('/'));
    const parsed = parseXnl(fs.readFileSync(source, 'utf-8'), { textBlockStyle: true }).nodes;
    const selected = selectedRoots(parsed);
    if (selected.length > 0) {
      sources.push({ source, ownerFile: relFile, nodes: selected });
    }
  }
  return sources;
}

function visitDecisions(node: XnlNode, visit: (id: string, node: DataElementNode) => void): void {
  if (!isDataElement(node)) return;
  if (node.tag === 'decision') {
    const id = readStableNodeId(node);
    if (!id) throw new Error('Decision registry node is missing a stable id');
    visit(id, node);
  }
  for (const child of node.body ?? []) visitDecisions(child, visit);
}

function semanticValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semanticValue);
  if (!value || typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .filter((key) => !(record.kind === 'TextElement' && key === 'textMarker'))
      .sort()
      .map((key) => [key, semanticValue(record[key])]),
  );
}

function nodeEqual(left: XnlNode, right: XnlNode): boolean {
  return JSON.stringify(semanticValue(left)) === JSON.stringify(semanticValue(right));
}

interface SourceDecisionRef {
  node: DataElementNode;
  source: string;
}

function decisionRefs(node: XnlNode): Array<{ id: string; node: DataElementNode }> {
  const refs: Array<{ id: string; node: DataElementNode }> = [];
  visitDecisions(node, (id, decision) => refs.push({ id, node: decision }));
  return refs;
}

function stagedDecisionValidationErrors(stagedDir: string): string[] {
  return validateDecisionsFile(stagedDir)
    .filter((finding) => finding.severity === 'error')
    .map((finding) => {
      const context = finding.layer
        ? `${finding.layer}; ${finding.file}`
        : finding.file;
      return `${finding.decision}: ${finding.message} [${context}]`;
    });
}

export function applyDecisionSources(
  stagedDir: string,
  trackDir: string,
  preparedSources?: DecisionSourceFile[],
): string[] {
  const sources = preparedSources ?? collectDecisionSourceFiles(trackDir);
  if (sources.length === 0) return [];

  const loaded = loadDecisionRegistrySafe(stagedDir);
  if (loaded.issues.length > 0) {
    throw new Error(loaded.issues.map((issue) => issue.message).join('\n'));
  }

  const sourceIndex = new Map<string, SourceDecisionRef>();
  for (const source of sources) {
    for (const root of source.nodes) {
      visitDecisions(root, (id, node) => {
        const previous = sourceIndex.get(id);
        if (previous) {
          if (previous.source === source.source) {
            throw new Error(
              `Duplicate decision node id '${id}' in archive source '${source.source}'`,
            );
          }
          if (!nodeEqual(previous.node, node)) {
            throw new Error(`Conflicting decision node id '${id}' across archive sources`);
          }
          return;
        }
        sourceIndex.set(id, { node, source: source.source });
      });
    }
  }

  for (const [id, { node }] of sourceIndex) {
    const existing = loaded.registry.index.get(id);
    if (existing && !nodeEqual(existing.node, node)) {
      throw new Error(
        `Conflicting decision node id '${id}' in source and registry owner '${existing.file}'`,
      );
    }
  }

  const knownRoots = new Map<string, XnlNode>();
  for (const [id, ref] of loaded.registry.index) {
    const ownerNodes = loaded.registry.files.get(ref.owner.file);
    const ownerRoot = ownerNodes?.[ref.owner.topLevelIndex];
    if (ownerRoot) knownRoots.set(id, ownerRoot);
  }

  const additions = new Map<string, XnlNode[]>();
  for (const source of sources) {
    for (const root of source.nodes) {
      const refs = decisionRefs(root);
      const known = refs.filter(({ id }) => knownRoots.has(id));
      if (known.length === refs.length) {
        const equivalentTree = known.every(
          ({ id }) => nodeEqual(knownRoots.get(id)!, root),
        );
        if (!equivalentTree) {
          throw new Error(
            `Decision tree '${source.ownerFile}' changes an existing owner or hierarchy`,
          );
        }
        continue;
      }
      if (known.length > 0) {
        throw new Error(
          `Decision tree '${source.ownerFile}' partially overlaps the existing registry`,
        );
      }

      const ownerAdditions = additions.get(source.ownerFile) ?? [];
      ownerAdditions.push(root);
      additions.set(source.ownerFile, ownerAdditions);
      for (const { id } of refs) knownRoots.set(id, root);
    }
  }

  const changed: string[] = [];
  for (const [ownerFile, addedNodes] of additions) {
    const target = path.join(stagedDir, ...ownerFile.split('/'));
    let nodes = addedNodes;
    if (fs.existsSync(target)) {
      const existing = parseXnl(fs.readFileSync(target, 'utf-8'), { textBlockStyle: true }).nodes;
      nodes = [...existing, ...nodes];
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, serializeXnlFile(nodes), 'utf-8');
    changed.push(ownerFile);
  }

  const validated = loadDecisionRegistrySafe(stagedDir);
  if (validated.issues.length > 0) {
    throw new Error(validated.issues.map((issue) => issue.message).join('\n'));
  }
  const validationErrors = stagedDecisionValidationErrors(stagedDir);
  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join('\n'));
  }
  return changed.sort();
}
