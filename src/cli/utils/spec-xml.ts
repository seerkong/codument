import * as fs from 'fs';
import * as path from 'path';
import { parseCodumentVfsUri } from './vfs';

export interface SpecXmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: SpecXmlNode[];
  text?: string;
}

export interface SpecXmlStats {
  requirements: number;
  scenarios: number;
}

const SELF_CLOSING = /\/\s*>$/;

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

function selectorPairs(selector: string): { capability: string; pairs: Array<{ tag: string; id: string }> } {
  const parsed = parseCodumentVfsUri(selector);
  if (parsed.scheme !== 'spec') {
    throw new Error(`Spec selector must use spec://: ${selector}`);
  }
  const [capability, ...rest] = parsed.segments;
  if (rest.length % 2 !== 0) {
    throw new Error(`Spec selector must use tag/id pairs: ${selector}`);
  }
  const pairs = [];
  for (let i = 0; i < rest.length; i += 2) {
    pairs.push({ tag: rest[i], id: rest[i + 1] });
  }
  return { capability, pairs };
}

export function getSpecSelectorCapability(selector: string): string {
  return selectorPairs(selector).capability;
}

function findChildIndex(parent: SpecXmlNode, pair: { tag: string; id: string }): number {
  return parent.children.findIndex((child) => child.tag === pair.tag && child.attrs.id === pair.id);
}

function findNode(root: SpecXmlNode, selector: string): { parent: SpecXmlNode | null; node: SpecXmlNode; index: number } {
  const { capability, pairs } = selectorPairs(selector);
  if (root.tag !== 'capability' || root.attrs.id !== capability) {
    throw new Error(`Selector capability does not match root capability: ${selector}`);
  }

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
  if (root.tag !== 'capability' || root.attrs.id !== capability) {
    throw new Error(`Selector capability does not match root capability: ${selector}`);
  }
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

export function applySpecXmlPatchContent(specContent: string, patchContent: string): string {
  const root = parseSpecXmlContent(specContent);
  const patchRoot = parseSpecXmlContent(patchContent);
  if (patchRoot.tag !== 'spec-patch') {
    throw new Error('Patch root must be <spec-patch>.');
  }

  for (const mutation of patchRoot.children) {
    const op = mutation.attrs.op;
    const selector = mutation.attrs.selector;
    if (!op || !selector) {
      continue;
    }

    if (op === 'upsert') {
      const { parent, pair } = findParentForUpsert(root, selector);
      const index = findChildIndex(parent, pair);
      const clean = cleanPatchNode(mutation);
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
      const to = mutation.attrs.to;
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
  if (patchRoot.tag !== 'spec-patch') {
    throw new Error('Patch root must be <spec-patch>.');
  }

  const capabilities = new Set<string>();
  for (const mutation of patchRoot.children) {
    const selector = mutation.attrs.selector;
    if (selector) {
      capabilities.add(getSpecSelectorCapability(selector));
    }
    const to = mutation.attrs.to;
    if (to) {
      capabilities.add(getSpecSelectorCapability(to));
    }
  }
  return [...capabilities];
}

function filterPatchForCapability(patchContent: string, capability: string): string {
  const patchRoot = parseSpecXmlContent(patchContent);
  if (patchRoot.tag !== 'spec-patch') {
    throw new Error('Patch root must be <spec-patch>.');
  }

  const filtered: SpecXmlNode = {
    tag: patchRoot.tag,
    attrs: patchRoot.attrs,
    children: [],
  };

  for (const mutation of patchRoot.children) {
    const selector = mutation.attrs.selector;
    if (!selector) {
      continue;
    }

    const selectorCapability = getSpecSelectorCapability(selector);
    const to = mutation.attrs.to;
    const toCapability = to ? getSpecSelectorCapability(to) : selectorCapability;
    if (selectorCapability !== toCapability) {
      throw new Error(`Cross-capability spec XML mutation is not supported yet: ${selector} -> ${to}`);
    }
    if (selectorCapability === capability) {
      filtered.children.push(mutation);
    }
  }

  return `${serializeSpecXml(filtered)}\n`;
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

function createCapabilityFromPatch(patchContent: string, capability: string): string {
  const patchRoot = parseSpecXmlContent(patchContent);
  const root: SpecXmlNode = {
    tag: 'capability',
    attrs: { id: capability, version: '1' },
    children: [],
  };

  for (const mutation of patchRoot.children) {
    const op = mutation.attrs.op;
    const selector = mutation.attrs.selector;
    if (op !== 'upsert' || !selector || getSpecSelectorCapability(selector) !== capability) {
      continue;
    }

    const pairs = selectorPairs(selector).pairs;
    let parent = root;
    for (const pair of pairs.slice(0, -1)) {
      let child = parent.children.find((candidate) => candidate.tag === pair.tag && candidate.attrs.id === pair.id);
      if (!child) {
        child = { tag: pair.tag, attrs: { id: pair.id }, children: [] };
        parent.children.push(child);
      }
      parent = child;
    }

    const clean = cleanPatchNode(mutation);
    const index = parent.children.findIndex((child) => child.tag === clean.tag && child.attrs.id === clean.attrs.id);
    if (index === -1) {
      parent.children.push(clean);
    } else {
      parent.children[index] = clean;
    }
  }

  return `${serializeSpecXml(root)}\n`;
}

export function applySpecXmlPatchToRegistry(patchContent: string, specsDir: string): string[] {
  const updated: string[] = [];
  for (const capability of getSpecPatchCapabilities(patchContent)) {
    let writePath: string;
    let nextContent: string;
    try {
      const entry = resolveRegistrySpecEntry(specsDir, capability);
      const root = loadSpecXml(entry.loadPath);
      const filteredPatch = filterPatchForCapability(patchContent, capability);
      writePath = entry.writePath;
      nextContent = applySpecXmlPatchContent(serializeSpecXml(root), filteredPatch);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('Spec XML registry entry not found')) {
        throw error;
      }
      if (!fs.existsSync(specsDir)) {
        fs.mkdirSync(specsDir, { recursive: true });
      }
      writePath = path.join(specsDir, `${capability}.xml`);
      nextContent = createCapabilityFromPatch(patchContent, capability);
    }
    fs.writeFileSync(writePath, nextContent, 'utf-8');
    updated.push(capability);
  }
  return updated;
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
