import {
  MakeWord,
  parseXnl,
  wordToString,
  type DataElementNode,
  type ElementNode,
  type TextElementNode,
  type XnlNode,
} from 'xnl-core';
import type { SpecXmlNode } from '../utils/spec-xml';
import { serializeXnlFile } from '../xnl/registry';

const TAG_TO_XNL: Record<string, string> = {
  behaviors: 'Behavior',
  requirement: 'Requirement',
  statement: 'Statement',
  suite: 'Suite',
  case: 'Case',
  given: 'Given',
  when: 'When',
  then: 'Then',
  and: 'And',
  'knowledge-hint': 'KnowledgeHint',
};

const TAG_FROM_XNL = Object.fromEntries(Object.entries(TAG_TO_XNL).map(([xml, xnl]) => [xnl, xml]));

export function convertLegacyBehaviorNode(root: SpecXmlNode, targetApiVersion: string): string {
  if (root.tag !== 'behaviors') throw new Error(`Legacy Behavior root must be <behaviors>, received <${root.tag}>`);
  const metadata = root.children.find((child) => child.tag === 'Metadata');
  const apiVersion = metadata?.children.find((child) => child.tag === 'ApiVersion')?.text?.trim()
    || targetApiVersion;
  return serializeBehaviorNode(root, apiVersion);
}

export function serializeBehaviorNode(root: SpecXmlNode, apiVersion = 'codument.tech/v1alpha1'): string {
  if (root.tag !== 'behaviors') throw new Error(`Behavior model root must be <behaviors>, received <${root.tag}>`);
  const capability = root.attrs.capability;
  if (!capability) throw new Error('Behavior registry requires capability identity.');
  const behavior = makeData('Behavior', capability, {}, [], {
    apiVersion: root.attrs.apiVersion || apiVersion,
    version: root.attrs.version || '1',
  });
  const requirements = root.children.filter((child) => child.tag === 'requirement').map(behaviorNodeToXnl);
  setExtend(behavior, [makeCollection('Requirements', requirements)]);
  return serializeXnlFile([behavior]);
}

export function parseBehaviorXnlContent(content: string): SpecXmlNode {
  const parsed = parseXnl(content, { textBlockStyle: true });
  if (parsed.warnings?.length) throw new Error(parsed.warnings.map((warning) => warning.message).join('; '));
  if (parsed.nodes.length !== 1 || !isDataElement(parsed.nodes[0]) || parsed.nodes[0].tag !== 'Behavior') {
    throw new Error('Behavior XNL must contain exactly one <Behavior> root.');
  }
  const rootNode = parsed.nodes[0];
  const capability = wordToString(rootNode.id);
  if (!capability) throw new Error('Behavior XNL root requires #capability identity.');
  const root: SpecXmlNode = {
    tag: 'behaviors',
    attrs: {
      capability,
      version: scalar(rootNode.metadata.version) ?? '1',
      apiVersion: scalar(rootNode.metadata.apiVersion) ?? '',
    },
    children: [],
  };
  const requirements = dataChild(rootNode, 'Requirements');
  root.children = (requirements?.body ?? []).filter(isElement).map(behaviorNodeFromXnl);
  return root;
}

export function behaviorNodeToXnl(node: SpecXmlNode): ElementNode {
  const tag = TAG_TO_XNL[node.tag] ?? pascal(node.tag);
  const id = node.attrs.id;
  const identity = id && isXnlWord(id) ? id : undefined;
  const nodeAttributes = attrs(node, new Set(identity ? ['id'] : []));
  if (node.children.length === 0 && node.text !== undefined) {
    return makeText(tag, node.text, nodeAttributes, identity);
  }
  const converted = makeData(tag, identity, nodeAttributes, []);
  const ordinary: ElementNode[] = [];
  const suites: ElementNode[] = [];
  const cases: ElementNode[] = [];
  const ands: ElementNode[] = [];
  for (const child of node.children.filter((child) => child.tag !== 'Metadata')) {
    if (child.tag === 'suite') suites.push(behaviorNodeToXnl(child));
    else if (child.tag === 'case') cases.push(behaviorNodeToXnl(child));
    else if (child.tag === 'and') ands.push(behaviorNodeToXnl(child));
    else ordinary.push(behaviorNodeToXnl(child));
  }
  if (suites.length > 0) ordinary.push(makeCollection('Suites', suites));
  if (cases.length > 0) ordinary.push(makeCollection('Cases', cases));
  if (ands.length > 0) ordinary.push(makeCollection('Ands', ands));
  setExtend(converted, ordinary);
  return converted;
}

export function behaviorNodeFromXnl(node: DataElementNode | TextElementNode): SpecXmlNode {
  const attrs: Record<string, string> = {};
  const id = wordToString(node.id);
  if (id) attrs.id = id;
  for (const [key, value] of Object.entries(node.attributes ?? {})) {
    const normalized = scalar(value);
    if (normalized !== undefined) attrs[key.replaceAll('_', '-')] = normalized;
  }
  const result: SpecXmlNode = {
    tag: TAG_FROM_XNL[node.tag] ?? node.tag.toLowerCase(),
    attrs,
    children: [],
    ...(node.kind === 'TextElement' ? { text: node.text ?? '' } : {}),
  };
  if (node.kind === 'TextElement') return result;
  for (const key of node.extend?.order ?? []) {
    const child = node.extend?.children[key];
    if (!isElement(child)) continue;
    if (['Requirements', 'Suites', 'Cases', 'Ands'].includes(child.tag) && child.kind === 'DataElement') {
      result.children.push(...(child.body ?? []).filter(isElement).map(behaviorNodeFromXnl));
    } else {
      result.children.push(behaviorNodeFromXnl(child));
    }
  }
  for (const child of node.body ?? []) {
    if (isElement(child)) result.children.push(behaviorNodeFromXnl(child));
  }
  return result;
}

function makeCollection(tag: string, children: ElementNode[]): DataElementNode {
  return makeData(tag, undefined, {}, children);
}

function makeData(
  tag: string,
  id: string | undefined,
  attributes: Record<string, XnlNode>,
  body: ElementNode[],
  metadata: Record<string, XnlNode> = {},
): DataElementNode {
  return {
    kind: 'DataElement',
    tag,
    ...(id ? { id: MakeWord(id) } : {}),
    metadata,
    ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
    ...(body.length > 0 ? { body } : {}),
  };
}

function makeText(
  tag: string,
  text: string,
  attributes: Record<string, XnlNode>,
  id?: string,
): TextElementNode {
  return {
    kind: 'TextElement', tag, metadata: {}, text,
    ...(id ? { id: MakeWord(id) } : {}),
    ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
  };
}

function setExtend(parent: DataElementNode, children: ElementNode[]): void {
  if (children.length === 0) return;
  const counts = new Map<string, number>();
  for (const child of children) counts.set(child.tag, (counts.get(child.tag) ?? 0) + 1);
  const unique = children.filter((child) => counts.get(child.tag) === 1);
  const repeated = children.filter((child) => (counts.get(child.tag) ?? 0) > 1);
  if (unique.length > 0) {
    parent.extend = {
      order: unique.map((child) => child.tag),
      children: Object.fromEntries(unique.map((child) => [child.tag, child])),
    };
  }
  if (repeated.length > 0) parent.body = repeated;
}

function dataChild(node: DataElementNode, tag: string): DataElementNode | undefined {
  const child = node.extend?.children[tag];
  return isDataElement(child) ? child : undefined;
}

function attrs(node: SpecXmlNode, omitted: Set<string>): Record<string, XnlNode> {
  return Object.fromEntries(Object.entries(node.attrs)
    .filter(([key]) => !omitted.has(key) && !['capability', 'version', 'apiVersion'].includes(key))
    .map(([key, value]) => [key
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replaceAll('-', '_')
      .toLowerCase(), value]));
}

function pascal(value: string): string {
  return value.split(/[-_]/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join('');
}

function isXnlWord(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*$/.test(value);
}

function scalar(value: XnlNode | undefined): string | undefined {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : undefined;
}

function isDataElement(value: XnlNode | undefined): value is DataElementNode {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && 'kind' in value && value.kind === 'DataElement');
}

function isElement(value: XnlNode | undefined): value is DataElementNode | TextElementNode {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && 'kind' in value && (value.kind === 'DataElement' || value.kind === 'TextElement'));
}
