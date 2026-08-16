import * as fs from 'fs';
import * as path from 'path';
import {
  MakeWord,
  parseXnl,
  type DataElementNode,
  type ElementNode,
  type TextElementNode,
  type XnlNode,
} from 'xnl-core';
import { parseSpecXmlContent, type SpecXmlNode } from '../utils/spec-xml';
import { serializeXnlFile } from '../xnl/registry';

export const CONFIG_RESOURCE_FILES = Object.freeze({
  OperationHooks: 'operation-hooks.xnl',
  AttractorProfiles: 'attractor-profiles.xnl',
  Modeling: 'modeling.xnl',
  Engineering: 'engineering.xnl',
} as const);

const ROOT_CONTRACT = Object.freeze({
  OperationHooks: { tag: 'OperationHooks', id: 'codument.config.operation_hooks' },
  AttractorProfiles: { tag: 'AttractorProfiles', id: 'codument.config.attractor_profiles' },
  Modeling: { tag: 'ModelingConfig', id: 'codument.config.modeling' },
  Engineering: { tag: 'EngineeringConfig', id: 'codument.config.engineering' },
} as const);

export function configTargetPath(xmlFile: string): string | undefined {
  const target = CONFIG_RESOURCE_FILES[['action-hooks', 'operation-hooks'].includes(path.basename(xmlFile, '.xml'))
    ? 'OperationHooks'
    : path.basename(xmlFile, '.xml') === 'attractor-profiles'
      ? 'AttractorProfiles'
      : path.basename(xmlFile, '.xml') === 'modeling'
        ? 'Modeling'
        : path.basename(xmlFile, '.xml') === 'engineering'
          ? 'Engineering'
          : '' as never];
  return target ? path.join(path.dirname(xmlFile), target) : undefined;
}

export function convertLegacyConfigXml(content: string, targetApiVersion: string): string {
  const xml = parseSpecXmlContent(content);
  const sourceTag = xml.tag === 'ActionHooks' ? 'OperationHooks' : xml.tag;
  const contract = ROOT_CONTRACT[sourceTag as keyof typeof ROOT_CONTRACT];
  if (!contract) throw new Error(`Unsupported Codument config root <${xml.tag}>`);
  const metadata = xml.children.find((child) => child.tag === 'Metadata');
  const apiVersion = metadata?.children.find((child) => child.tag === 'ApiVersion')?.text?.trim()
    || targetApiVersion;
  const root = makeData(contract.tag, contract.id, attrs(xml, new Set(['version', 'xmlns:cdt'])), [], {
    apiVersion,
    version: xml.attrs.version ?? '1',
  });

  if (xml.tag === 'ActionHooks' || xml.tag === 'OperationHooks') {
    setExtend(root, [makeCollection('Operations', xml.children
      .filter((child) => child.tag === 'Action' || child.tag === 'Operation')
      .map(convertOperation))]);
  } else if (xml.tag === 'AttractorProfiles') {
    setExtend(root, [makeCollection('Profiles', xml.children.filter((child) => child.tag === 'Profile').map(convertProfile))]);
  } else {
    const children = xml.children.filter((child) => child.tag !== 'Metadata').map((child) => (
      child.tag === 'MergePolicy' ? convertMergePolicy(child) : convertGeneric(child)
    ));
    setExtend(root, children);
  }
  return serializeXnlFile([root]);
}

export function parseConfigRoot(file: string, expectedTag?: string): DataElementNode {
  const parsed = parseXnl(fs.readFileSync(file, 'utf8'), { textBlockStyle: true });
  if (parsed.warnings?.length) throw new Error(parsed.warnings.map((warning) => warning.message).join('; '));
  if (parsed.nodes.length !== 1 || !isDataElement(parsed.nodes[0])) {
    throw new Error('Config XNL must contain exactly one data-element root.');
  }
  if (expectedTag && parsed.nodes[0].tag !== expectedTag) {
    throw new Error(`Config XNL root must be <${expectedTag}>, received <${parsed.nodes[0].tag}>`);
  }
  return parsed.nodes[0];
}

function convertOperation(node: SpecXmlNode): DataElementNode {
  const converted = makeData('Operation', node.attrs.name, attrs(node, new Set(['name'])), []);
  const children = node.children.map((child) => child.tag === 'Hooks'
    ? makeCollection('Hooks', child.children.map(convertGeneric))
    : convertGeneric(child));
  setExtend(converted, children);
  return converted;
}

function convertProfile(node: SpecXmlNode): DataElementNode {
  const converted = makeData('Profile', node.attrs.name, attrs(node, new Set(['name'])), []);
  const children: ElementNode[] = [];
  const description = node.children.find((child) => child.tag === 'Description');
  if (description) children.push(makeText('Description', description.text ?? ''));
  const attractors = node.children.filter((child) => child.tag === 'Attractor').map(convertGeneric);
  if (attractors.length > 0) children.push(makeCollection('Attractors', attractors));
  setExtend(converted, children);
  return converted;
}

function convertMergePolicy(node: SpecXmlNode): DataElementNode {
  const converted = makeData('MergePolicy', undefined, attrs(node), []);
  setExtend(converted, [makeCollection('Conflicts', node.children.filter((child) => child.tag === 'Conflict').map(convertGeneric))]);
  return converted;
}

function convertGeneric(node: SpecXmlNode): ElementNode {
  const tag = node.tag.replace(/^cdt:/, '');
  if (node.text !== undefined && node.children.length === 0) return makeText(tag, node.text);
  const converted = makeData(tag, node.attrs.id, attrs(node, new Set(['id'])), []);
  const children = node.children.map(convertGeneric);
  if (children.length > 0) setExtend(converted, children);
  return converted;
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

function makeText(tag: string, text: string): TextElementNode {
  return { kind: 'TextElement', tag, metadata: {}, text };
}

function setExtend(parent: DataElementNode, children: ElementNode[]): void {
  if (children.length === 0) return;
  parent.extend = {
    order: children.map((child) => child.tag),
    children: Object.fromEntries(children.map((child) => [child.tag, child])),
  };
}

function attrs(node: SpecXmlNode, omitted = new Set<string>()): Record<string, XnlNode> {
  return Object.fromEntries(Object.entries(node.attrs)
    .filter(([key]) => !omitted.has(key) && !key.startsWith('xmlns'))
    .map(([key, value]) => [key
      .replace(/^cdt:/, '')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replaceAll('-', '_')
      .toLowerCase(), scalar(value)]));
}

function scalar(value: string): string | number | boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function isDataElement(value: XnlNode | undefined): value is DataElementNode {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && 'kind' in value && value.kind === 'DataElement');
}
