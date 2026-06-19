import * as fs from 'fs';
import * as path from 'path';
import { parseCodumentVfsUri } from './vfs';

export interface SpecXmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: SpecXmlNode[];
  text?: string;
  sourcePath?: string;
}

export interface SpecXmlStats {
  requirements: number;
  scenarios: number;
}

const SELF_CLOSING = /\/\s*>$/;
const PATCH_ROOT_TAGS = new Set(['spec-patch', 'behavior-patch']);
const WRAPPER_OP_TAGS = new Set(['upsert', 'delete', 'move']);

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = attrRegex.exec(raw)) !== null) {
    attrs[match[1]] = decodeXml(match[2]);
  }
  return attrs;
}

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function encodeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function appendText(node: SpecXmlNode, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }
  node.text = node.text ? `${node.text}\n${trimmed}` : trimmed;
}

export function parseSpecXmlContent(content: string): SpecXmlNode {
  const root: SpecXmlNode = { tag: '__root__', attrs: {}, children: [] };
  const stack: SpecXmlNode[] = [root];
  const tokenRegex = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[^>]+>/g;
  let cursor = 0;
  let match;

  while ((match = tokenRegex.exec(content)) !== null) {
    appendText(stack[stack.length - 1], content.slice(cursor, match.index));
    const token = match[0];
    cursor = match.index + token.length;

    if (token.startsWith('<!--') || token.startsWith('<?')) {
      continue;
    }
    if (token.startsWith('<![CDATA[')) {
      appendText(stack[stack.length - 1], token.slice(9, -3));
      continue;
    }
    if (token.startsWith('</')) {
      const tag = token.slice(2, -1).trim();
      const current = stack.pop();
      if (!current || current.tag !== tag) {
        throw new Error(`Mismatched XML closing tag: ${tag}`);
      }
      continue;
    }

    const inner = token.slice(1, SELF_CLOSING.test(token) ? -2 : -1).trim();
    const firstSpace = inner.search(/\s/);
    const tag = firstSpace === -1 ? inner : inner.slice(0, firstSpace);
    const attrsRaw = firstSpace === -1 ? '' : inner.slice(firstSpace + 1);
    const node: SpecXmlNode = { tag, attrs: parseAttrs(attrsRaw), children: [] };
    stack[stack.length - 1].children.push(node);
    if (!SELF_CLOSING.test(token)) {
      stack.push(node);
    }
  }

  appendText(stack[stack.length - 1], content.slice(cursor));
  if (stack.length !== 1) {
    throw new Error(`Unclosed XML tag: ${stack[stack.length - 1].tag}`);
  }
  if (root.children.length !== 1) {
    throw new Error('Spec XML must contain exactly one root node.');
  }
  return root.children[0];
}

function expandIncludes(node: SpecXmlNode, baseDir: string): SpecXmlNode[] {
  if (node.tag === 'include') {
    const href = node.attrs.href;
    if (!href) {
      return [];
    }
    const includePath = path.resolve(baseDir, href);
    const included = parseSpecXmlContent(fs.readFileSync(includePath, 'utf-8'));
    return expandIncludes(included, path.dirname(includePath));
  }

  node.children = node.children.flatMap((child) => expandIncludes(child, baseDir));
  return [node];
}

export function loadSpecXml(specPath: string): SpecXmlNode {
  const entryPath = fs.statSync(specPath).isDirectory()
    ? path.join(specPath, 'index.xml')
    : specPath;
  const root = parseSpecXmlContent(fs.readFileSync(entryPath, 'utf-8'));
  return expandIncludes(root, path.dirname(entryPath))[0];
}

export function getSpecXmlStats(root: SpecXmlNode): SpecXmlStats {
  let requirements = 0;
  let scenarios = 0;
  const visit = (node: SpecXmlNode): void => {
    if (node.tag === 'requirement') {
      requirements++;
    }
    if (node.tag === 'case') {
      scenarios++;
    }
    node.children.forEach(visit);
  };
  visit(root);
  return { requirements, scenarios };
}

function normalizeSelectorTag(tag: string): string {
  if (tag === 'requirements') return 'requirement';
  if (tag === 'suites') return 'suite';
  if (tag === 'cases') return 'case';
  return tag;
}

function selectorPairs(selector: string): { capability: string; pairs: Array<{ tag: string; id: string }> } {
  const parsed = parseCodumentVfsUri(selector);
  if (parsed.scheme !== 'spec' && parsed.scheme !== 'behavior') {
    throw new Error(`Behavior selector must use behavior:// or legacy spec://: ${selector}`);
  }
  const [capability, ...rest] = parsed.segments;
  if (rest.length % 2 !== 0) {
    throw new Error(`Behavior selector must use tag/id pairs: ${selector}`);
  }
  const pairs = [];
  for (let i = 0; i < rest.length; i += 2) {
    pairs.push({ tag: normalizeSelectorTag(rest[i]), id: rest[i + 1] });
  }
  return { capability, pairs };
}

export function getSpecSelectorCapability(selector: string): string {
  return selectorPairs(selector).capability;
}

function findChildIndex(parent: SpecXmlNode, pair: { tag: string; id: string }): number {
  return parent.children.findIndex((child) => child.tag === pair.tag && child.attrs.id === pair.id);
}

/**
 * Read the capability id from a registry root, tolerating both the current
 * `<behaviors capability="X">` standard and the legacy `<capability id="X">` root.
 */
function rootCapability(root: SpecXmlNode): string | undefined {
  if (root.tag === 'behaviors') return root.attrs.capability;
  if (root.tag === 'capability') return root.attrs.id;
  return undefined;
}

function assertRootCapability(root: SpecXmlNode, capability: string, selector: string): void {
  const actual = rootCapability(root);
  if (actual !== capability) {
    throw new Error(
      `Selector capability does not match root capability: ${selector} ` +
        `(root <${root.tag}> resolves to ${actual ?? 'no capability'}, selector expects ${capability})`,
    );
  }
}

function findNode(root: SpecXmlNode, selector: string): { parent: SpecXmlNode | null; node: SpecXmlNode; index: number } {
  const { capability, pairs } = selectorPairs(selector);
  assertRootCapability(root, capability, selector);

  let parent: SpecXmlNode | null = null;
  let node = root;
  let index = -1;
  for (const pair of pairs) {
    parent = node;
    index = findChildIndex(parent, pair);
    if (index === -1) {
      throw new Error(`Selector target not found: ${selector}`);
    }
    node = parent.children[index];
  }
  return { parent, node, index };
}

function findParentForUpsert(root: SpecXmlNode, selector: string): { parent: SpecXmlNode; pair: { tag: string; id: string } } {
  const { capability, pairs } = selectorPairs(selector);
  assertRootCapability(root, capability, selector);
  if (pairs.length === 0) {
    throw new Error('Cannot upsert the capability root.');
  }

  let parent = root;
  for (const pair of pairs.slice(0, -1)) {
    const index = findChildIndex(parent, pair);
    if (index === -1) {
      throw new Error(`Selector parent not found: ${selector}`);
    }
    parent = parent.children[index];
  }

  return { parent, pair: pairs[pairs.length - 1] };
}

function findOrCreateParentForUpsert(root: SpecXmlNode, selector: string): { parent: SpecXmlNode; pair: { tag: string; id: string } } {
  const { capability, pairs } = selectorPairs(selector);
  assertRootCapability(root, capability, selector);
  if (pairs.length === 0) {
    throw new Error('Cannot upsert the capability root.');
  }

  let parent = root;
  for (const pair of pairs.slice(0, -1)) {
    let index = findChildIndex(parent, pair);
    if (index === -1) {
      const child: SpecXmlNode = { tag: pair.tag, attrs: { id: pair.id }, children: [] };
      setSourcePath(child, parent.sourcePath);
      parent.children.push(child);
      index = parent.children.length - 1;
    }
    parent = parent.children[index];
  }

  return { parent, pair: pairs[pairs.length - 1] };
}

function cleanPatchNode(node: SpecXmlNode): SpecXmlNode {
  const attrs = { ...node.attrs };
  delete attrs.op;
  delete attrs.selector;
  delete attrs.to;
  return {
    tag: node.tag,
    attrs,
    text: node.text,
    children: node.children.map(cleanPatchNode),
  };
}

interface PatchMutation {
  op: string;
  selector: string;
  to?: string;
  node: SpecXmlNode;
}

function assertPatchRoot(root: SpecXmlNode): void {
  if (!PATCH_ROOT_TAGS.has(root.tag)) {
    throw new Error('Patch root must be <behavior-patch> or legacy <spec-patch>.');
  }
}

function getPatchMutations(patchRoot: SpecXmlNode): PatchMutation[] {
  const mutations: PatchMutation[] = [];
  for (const child of patchRoot.children) {
    if (WRAPPER_OP_TAGS.has(child.tag)) {
      const selector = child.attrs.selector;
      if (!selector) {
        continue;
      }
      const node = child.tag === 'upsert' ? child.children[0] : child;
      if (!node) {
        throw new Error('Upsert operation requires a child node.');
      }
      mutations.push({ op: child.tag, selector, to: child.attrs.to, node });
      continue;
    }

    const op = child.attrs.op;
    const selector = child.attrs.selector;
    if (op && selector) {
      mutations.push({ op, selector, to: child.attrs.to, node: child });
    }
  }
  return mutations;
}

function setSourcePath(node: SpecXmlNode, sourcePath: string | undefined): void {
  if (sourcePath) {
    node.sourcePath = sourcePath;
  } else {
    delete node.sourcePath;
  }
  for (const child of node.children) {
    setSourcePath(child, sourcePath);
  }
}

export function applySpecXmlPatchContent(specContent: string, patchContent: string): string {
  const root = parseSpecXmlContent(specContent);
  const patchRoot = parseSpecXmlContent(patchContent);
  assertPatchRoot(patchRoot);

  for (const mutation of getPatchMutations(patchRoot)) {
    const { op, selector } = mutation;
    if (op === 'upsert') {
      const { parent, pair } = findParentForUpsert(root, selector);
      const index = findChildIndex(parent, pair);
      const clean = cleanPatchNode(mutation.node);
      if (!clean.attrs.id) {
        clean.attrs.id = pair.id;
      }
      if (index === -1) {
        parent.children.push(clean);
      } else {
        parent.children[index] = clean;
      }
    } else if (op === 'delete') {
      const target = findNode(root, selector);
      if (!target.parent) {
        throw new Error('Cannot delete capability root.');
      }
      target.parent.children.splice(target.index, 1);
    } else if (op === 'move') {
      const to = mutation.to;
      if (!to) {
        throw new Error('Move operation requires a to attribute.');
      }
      const target = findNode(root, selector);
      if (!target.parent) {
        throw new Error('Cannot move capability root.');
      }
      const [removed] = target.parent.children.splice(target.index, 1);
      const { parent, pair } = findParentForUpsert(root, to);
      removed.tag = pair.tag;
      removed.attrs.id = pair.id;
      const existingIndex = findChildIndex(parent, pair);
      if (existingIndex === -1) {
        parent.children.push(removed);
      } else {
        parent.children[existingIndex] = removed;
      }
    } else {
      throw new Error(`Unsupported spec XML patch operation: ${op}`);
    }
  }

  return `${serializeSpecXml(root)}\n`;
}

export function getSpecPatchCapabilities(patchContent: string): string[] {
  const patchRoot = parseSpecXmlContent(patchContent);
  assertPatchRoot(patchRoot);

  const capabilities = new Set<string>();
  for (const mutation of getPatchMutations(patchRoot)) {
    const selector = mutation.selector;
    if (selector) {
      capabilities.add(getSpecSelectorCapability(selector));
    }
    const to = mutation.to;
    if (to) {
      capabilities.add(getSpecSelectorCapability(to));
    }
  }
  return [...capabilities];
}

function resolveRegistrySpecEntry(specsDir: string, capability: string): { loadPath: string; writePath: string } {
  const filePath = path.join(specsDir, `${capability}.xml`);
  if (fs.existsSync(filePath)) {
    return { loadPath: filePath, writePath: filePath };
  }

  const folderPath = path.join(specsDir, capability);
  const indexPath = path.join(folderPath, 'index.xml');
  if (fs.existsSync(indexPath)) {
    return { loadPath: folderPath, writePath: indexPath };
  }

  throw new Error(`Spec XML registry entry not found for capability: ${capability}`);
}

interface RegistryMutationEntry {
  root: SpecXmlNode;
  writePath: string;
  includedRootByPath?: Map<string, SpecXmlNode>;
  includeNodeByPath?: Map<string, SpecXmlNode>;
}

function loadRegistryEntry(specsDir: string, capability: string): RegistryMutationEntry {
  const entry = resolveRegistrySpecEntry(specsDir, capability);
  if (fs.statSync(entry.loadPath).isDirectory()) {
    return loadFolderRegistryEntry(entry.writePath);
  }
  return {
    root: loadSpecXml(entry.loadPath),
    writePath: entry.writePath,
  };
}

function cloneNodeWithoutSource(node: SpecXmlNode): SpecXmlNode {
  return {
    tag: node.tag,
    attrs: { ...node.attrs },
    text: node.text,
    children: node.children.map(cloneNodeWithoutSource),
  };
}

function markSourcePath(node: SpecXmlNode, sourcePath: string): void {
  node.sourcePath = sourcePath;
  for (const child of node.children) {
    markSourcePath(child, sourcePath);
  }
}

function expandRegistryIncludes(
  node: SpecXmlNode,
  baseDir: string,
  includedRootByPath: Map<string, SpecXmlNode>,
  includeNodeByPath: Map<string, SpecXmlNode>,
): SpecXmlNode[] {
  if (node.tag === 'include') {
    const href = node.attrs.href;
    if (!href) {
      return [];
    }
    const includePath = path.resolve(baseDir, href);
    const included = parseSpecXmlContent(fs.readFileSync(includePath, 'utf-8'));
    markSourcePath(included, includePath);
    included.children = included.children.flatMap((child) => expandRegistryIncludes(
      child,
      path.dirname(includePath),
      includedRootByPath,
      includeNodeByPath,
    ));
    includedRootByPath.set(includePath, included);
    includeNodeByPath.set(includePath, cloneNodeWithoutSource(node));
    return [included];
  }

  node.children = node.children.flatMap((child) => expandRegistryIncludes(
    child,
    node.sourcePath ? path.dirname(node.sourcePath) : baseDir,
    includedRootByPath,
    includeNodeByPath,
  ));
  return [node];
}

function loadFolderRegistryEntry(indexPath: string): RegistryMutationEntry {
  const includedRootByPath = new Map<string, SpecXmlNode>();
  const includeNodeByPath = new Map<string, SpecXmlNode>();
  const root = parseSpecXmlContent(fs.readFileSync(indexPath, 'utf-8'));
  expandRegistryIncludes(root, path.dirname(indexPath), includedRootByPath, includeNodeByPath);
  return {
    root,
    writePath: indexPath,
    includedRootByPath,
    includeNodeByPath,
  };
}

function createRegistryEntry(specsDir: string, capability: string): RegistryMutationEntry {
  return {
    root: { tag: 'behaviors', attrs: { capability, version: '1' }, children: [] },
    writePath: path.join(specsDir, `${capability}.xml`),
  };
}

export function applySpecXmlPatchToRegistry(patchContent: string, specsDir: string): string[] {
  const patchRoot = parseSpecXmlContent(patchContent);
  assertPatchRoot(patchRoot);
  if (!fs.existsSync(specsDir)) {
    fs.mkdirSync(specsDir, { recursive: true });
  }

  const entries = new Map<string, RegistryMutationEntry>();
  const updated = new Set<string>();

  const getExistingEntry = (capability: string): RegistryMutationEntry => {
    const existing = entries.get(capability);
    if (existing) {
      return existing;
    }
    const entry = loadRegistryEntry(specsDir, capability);
    entries.set(capability, entry);
    return entry;
  };

  const getOrCreateEntry = (capability: string): RegistryMutationEntry => {
    const existing = entries.get(capability);
    if (existing) {
      return existing;
    }
    try {
      const entry = loadRegistryEntry(specsDir, capability);
      entries.set(capability, entry);
      return entry;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('Spec XML registry entry not found')) {
        throw error;
      }
      const entry = createRegistryEntry(specsDir, capability);
      entries.set(capability, entry);
      return entry;
    }
  };

  const upsertNode = (root: SpecXmlNode, selector: string, node: SpecXmlNode): void => {
    const { parent, pair } = findOrCreateParentForUpsert(root, selector);
    const clean = cleanPatchNode(node);
    if (!clean.attrs.id) {
      clean.attrs.id = pair.id;
    }
    const index = findChildIndex(parent, pair);
    const inheritedSourcePath = index === -1
      ? parent.sourcePath
      : parent.children[index].sourcePath ?? parent.sourcePath;
    setSourcePath(clean, inheritedSourcePath);
    if (index === -1) {
      parent.children.push(clean);
    } else {
      parent.children[index] = clean;
    }
  };

  for (const mutation of getPatchMutations(patchRoot)) {
    const { op, selector } = mutation;
    const sourceCapability = getSpecSelectorCapability(selector);
    if (op === 'upsert') {
      const entry = getOrCreateEntry(sourceCapability);
      upsertNode(entry.root, selector, mutation.node);
      updated.add(sourceCapability);
      continue;
    }

    if (op === 'delete') {
      const entry = getExistingEntry(sourceCapability);
      const target = findNode(entry.root, selector);
      if (!target.parent) {
        throw new Error('Cannot delete capability root.');
      }
      target.parent.children.splice(target.index, 1);
      updated.add(sourceCapability);
      continue;
    }

    if (op === 'move') {
      const to = mutation.to;
      if (!to) {
        throw new Error('Move operation requires a to attribute.');
      }
      const sourceEntry = getExistingEntry(sourceCapability);
      const target = findNode(sourceEntry.root, selector);
      if (!target.parent) {
        throw new Error('Cannot move capability root.');
      }
      const [removed] = target.parent.children.splice(target.index, 1);
      const destinationCapability = getSpecSelectorCapability(to);
      const destinationEntry = getOrCreateEntry(destinationCapability);
      const { parent, pair } = findOrCreateParentForUpsert(destinationEntry.root, to);
      removed.tag = pair.tag;
      removed.attrs.id = pair.id;
      setSourcePath(removed, parent.sourcePath);
      const existingIndex = findChildIndex(parent, pair);
      if (existingIndex === -1) {
        parent.children.push(removed);
      } else {
        parent.children[existingIndex] = removed;
      }
      updated.add(sourceCapability);
      updated.add(destinationCapability);
      continue;
    }

    throw new Error(`Unsupported spec XML patch operation: ${op}`);
  }

  for (const [capability, entry] of [...entries.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (updated.has(capability)) {
      writeRegistryEntry(entry);
    }
  }

  return [...updated];
}

function cloneForIndex(node: SpecXmlNode, entry: RegistryMutationEntry, parentSourcePath?: string): SpecXmlNode {
  const nodeSourcePath = node.sourcePath;
  if (nodeSourcePath && nodeSourcePath !== parentSourcePath) {
    const includeNode = entry.includeNodeByPath?.get(nodeSourcePath);
    if (includeNode) {
      return cloneNodeWithoutSource(includeNode);
    }
  }

  const nextParentSourcePath = nodeSourcePath ?? parentSourcePath;
  return {
    tag: node.tag,
    attrs: { ...node.attrs },
    text: node.text,
    children: node.children.map((child) => cloneForIndex(child, entry, nextParentSourcePath)),
  };
}

function writeRegistryEntry(entry: RegistryMutationEntry): void {
  if (!entry.includedRootByPath || !entry.includeNodeByPath) {
    fs.writeFileSync(entry.writePath, `${serializeSpecXml(entry.root)}\n`, 'utf-8');
    return;
  }

  const reachableSourcePaths = new Set<string>();
  const collect = (node: SpecXmlNode): void => {
    if (node.sourcePath) {
      reachableSourcePaths.add(node.sourcePath);
    }
    node.children.forEach(collect);
  };
  collect(entry.root);

  for (const [sourcePath, sourceRoot] of entry.includedRootByPath.entries()) {
    if (reachableSourcePaths.has(sourcePath)) {
      fs.writeFileSync(sourcePath, `${serializeSpecXml(cloneForIndex(sourceRoot, entry, sourcePath))}\n`, 'utf-8');
    }
  }

  fs.writeFileSync(entry.writePath, `${serializeSpecXml(cloneForIndex(entry.root, entry))}\n`, 'utf-8');
}

export function serializeSpecXml(node: SpecXmlNode, indent = 0): string {
  const pad = '  '.repeat(indent);
  const attrs = Object.entries(node.attrs)
    .map(([key, value]) => ` ${key}="${encodeXml(value)}"`)
    .join('');

  if (node.children.length === 0 && !node.text) {
    return `${pad}<${node.tag}${attrs} />`;
  }

  if (node.children.length === 0 && node.text) {
    return `${pad}<${node.tag}${attrs}>${encodeXml(node.text)}</${node.tag}>`;
  }

  const lines = [`${pad}<${node.tag}${attrs}>`];
  if (node.text) {
    lines.push(`${'  '.repeat(indent + 1)}${encodeXml(node.text)}`);
  }
  for (const child of node.children) {
    lines.push(serializeSpecXml(child, indent + 1));
  }
  lines.push(`${pad}</${node.tag}>`);
  return lines.join('\n');
}
