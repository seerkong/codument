import {
  MakeWord,
  parseXnl,
  wordToString,
  type DataElementNode,
  type ElementNode,
  type XnlNode,
} from 'xnl-core';
import type { SpecXmlNode } from '../utils/spec-xml';
import { serializeXnlFile } from '../xnl/registry';
import { behaviorNodeFromXnl, behaviorNodeToXnl } from './resource';

const MUTATION_TAGS = new Set(['upsert', 'delete', 'move']);

export function behaviorPatchResourceId(trackId: string, capability: string): string {
  const capabilityParts = capability.split('.').filter(Boolean).map(safeWordSegment);
  return ['track', safeWordSegment(trackId), 'behavior_patch', ...capabilityParts].join('.');
}

export function convertLegacyBehaviorPatchNode(
  root: SpecXmlNode,
  targetApiVersion: string,
  resourceId: string,
): string {
  return serializeBehaviorPatchNode(root, resourceId, targetApiVersion);
}

export function serializeBehaviorPatchNode(
  root: SpecXmlNode,
  resourceId: string,
  apiVersion = 'codument.tech/v1alpha1',
): string {
  if (!['behavior-patch', 'spec-patch'].includes(root.tag)) {
    throw new Error(`BehaviorPatch model root must be <behavior-patch>, received <${root.tag}>`);
  }
  const capability = root.attrs.capability || inferCapability(root);
  if (!capability) throw new Error('BehaviorPatch requires capability identity.');
  const mutations = root.children.filter((child) => MUTATION_TAGS.has(child.tag)).map(toMutationNode);
  const rootNode: DataElementNode = {
    kind: 'DataElement',
    tag: 'BehaviorPatch',
    id: MakeWord(resourceId),
    metadata: { apiVersion, version: root.attrs.version || '1' },
    attributes: { capability },
    extend: {
      order: ['Mutations'],
      children: {
        Mutations: { kind: 'DataElement', tag: 'Mutations', metadata: {}, body: mutations },
      },
    },
  };
  return serializeXnlFile([rootNode]);
}

export function parseBehaviorPatchXnlContent(content: string): SpecXmlNode {
  const parsed = parseXnl(content, { textBlockStyle: true });
  if (parsed.warnings?.length) throw new Error(parsed.warnings.map((warning) => warning.message).join('; '));
  if (parsed.nodes.length !== 1 || !isDataElement(parsed.nodes[0]) || parsed.nodes[0].tag !== 'BehaviorPatch') {
    throw new Error('BehaviorPatch XNL must contain exactly one <BehaviorPatch> root.');
  }
  const node = parsed.nodes[0];
  const capability = scalar(node.attributes?.capability);
  if (!capability) throw new Error('BehaviorPatch XNL requires capability attribute.');
  const mutations = node.extend?.children.Mutations;
  if (!isDataElement(mutations) || mutations.tag !== 'Mutations') {
    throw new Error('BehaviorPatch XNL requires one <Mutations> collection.');
  }
  return {
    tag: 'behavior-patch',
    attrs: {
      capability,
      version: scalar(node.metadata.version) ?? '1',
      apiVersion: scalar(node.metadata.apiVersion) ?? '',
      resourceId: wordToString(node.id) ?? '',
    },
    children: (mutations.body ?? []).filter(isDataElement).map(fromMutationNode),
  };
}

export function behaviorPatchSkeleton(trackId: string, capability: string, apiVersion: string): string {
  return serializeBehaviorPatchNode(
    { tag: 'behavior-patch', attrs: { capability, version: '1' }, children: [] },
    behaviorPatchResourceId(trackId, capability),
    apiVersion,
  );
}

function toMutationNode(node: SpecXmlNode): DataElementNode {
  const tag = node.tag[0].toUpperCase() + node.tag.slice(1);
  const attributes: Record<string, XnlNode> = {};
  if (node.attrs.selector) attributes.selector = node.attrs.selector;
  if (node.attrs.to) attributes.to = node.attrs.to;
  const target = node.tag === 'upsert' ? node.children[0] : undefined;
  if (node.tag === 'upsert' && !target) throw new Error('Upsert operation requires exactly one target node.');
  return {
    kind: 'DataElement', tag, metadata: {}, attributes,
    ...(target ? {
      extend: { order: [behaviorTag(target)], children: { [behaviorTag(target)]: behaviorNodeToXnl(target) } },
    } : {}),
  };
}

function fromMutationNode(node: DataElementNode): SpecXmlNode {
  const tag = node.tag.toLowerCase();
  if (!MUTATION_TAGS.has(tag)) throw new Error(`Unsupported BehaviorPatch mutation: <${node.tag}>`);
  const attrs: Record<string, string> = {};
  const selector = scalar(node.attributes?.selector);
  const to = scalar(node.attributes?.to);
  if (selector) attrs.selector = selector;
  if (to) attrs.to = to;
  const children: SpecXmlNode[] = [];
  if (tag === 'upsert') {
    const targets = (node.extend?.order ?? [])
      .map((key) => node.extend?.children[key])
      .filter(isElement);
    if (targets.length !== 1) throw new Error('BehaviorPatch Upsert requires exactly one target node in its extend block.');
    children.push(behaviorNodeFromXnl(targets[0]));
  }
  return { tag, attrs, children };
}

function inferCapability(root: SpecXmlNode): string | undefined {
  for (const mutation of root.children) {
    for (const value of [mutation.attrs.selector, mutation.attrs.to]) {
      const match = value?.match(/^behavior:\/\/([^/]+)/);
      if (match) return match[1];
    }
  }
  return undefined;
}

function behaviorTag(node: SpecXmlNode): string {
  return node.tag.split(/[-_]/).filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1)).join('');
}

function safeWordSegment(value: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(value)) return value;
  const encoded = [...value].map((character) => /[A-Za-z0-9_-]/.test(character)
    ? character
    : `u${character.codePointAt(0)?.toString(16)}`).join('_');
  return /^[A-Za-z_]/.test(encoded) ? encoded : `r_${encoded}`;
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

function isElement(value: XnlNode | undefined): value is ElementNode {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && 'kind' in value && (value.kind === 'DataElement' || value.kind === 'TextElement'));
}
