import * as fs from 'fs';
import * as path from 'path';
import {
  MakeWord,
  parseXnl,
  wordToString,
  type DataElementNode,
  type ElementNode,
  type TextElementNode,
  type XnlNode,
} from 'xnl-core';
import { serializeXnlFile } from '../xnl/registry';
import { parseSpecXmlContent, type SpecXmlNode } from '../utils/spec-xml';

export type MissionAuthorityFormat = 'xnl' | 'xml';

export interface MissionAuthority {
  format: MissionAuthorityFormat;
  fileName: 'mission.xnl' | 'mission.xml';
  file: string;
}

const ROOT_METADATA_TAGS = new Set([
  'ApiVersion',
  'Status',
  'Goal',
  'Description',
  'QuestionMode',
  'QuestionSeverity',
  'Revision',
  'GapRound',
  'CreatedAt',
  'UpdatedAt',
]);

const COLLECTION_TAGS = new Set([
  'Ports',
  'SubNodes',
  'Schedule',
  'Hooks',
  'Dag',
  'Node',
  'Acceptance',
  'Gate',
  'ProjectRefs',
  'ActorSets',
]);

const CDT_TAGS = new Set([
  'Acceptance',
  'Criterion',
  'AttractorCheck',
  'GapLoop',
  'HumanConfirm',
  'MissionReconcile',
  'TrackLink',
  'ProjectRefs',
  'ProjectRef',
  'ActorSets',
  'ActorSet',
  'Actor',
]);

export function resolveMissionAuthority(missionDir: string): MissionAuthority | undefined {
  const xnl = path.join(missionDir, 'mission.xnl');
  const xml = path.join(missionDir, 'mission.xml');
  const hasXnl = fs.existsSync(xnl);
  const hasXml = fs.existsSync(xml);
  if (hasXnl && hasXml) {
    throw new Error(`Mission directory has multiple Mission authority files: ${xnl} and ${xml}`);
  }
  if (hasXnl) return { format: 'xnl', fileName: 'mission.xnl', file: xnl };
  if (hasXml) return { format: 'xml', fileName: 'mission.xml', file: xml };
  return undefined;
}

export function parseMissionResource(file: string): SpecXmlNode {
  return parseMissionResourceContent(fs.readFileSync(file, 'utf8'), file);
}

export function parseMissionResourceContent(content: string, file = 'mission.xnl'): SpecXmlNode {
  if (path.extname(file).toLowerCase() === '.xml') return parseSpecXmlContent(content);
  const parsed = parseXnl(content, { textBlockStyle: true });
  if (parsed.warnings?.length) {
    throw new Error(parsed.warnings.map((warning) => warning.message).join('; '));
  }
  if (parsed.nodes.length !== 1 || !isDataElement(parsed.nodes[0])) {
    throw new Error('Mission XNL must contain exactly one data-element root.');
  }
  const root = fromXnlElement(parsed.nodes[0]);
  if (root.tag !== 'Mission') throw new Error(`Mission XNL root must be <Mission>, received <${root.tag}>`);

  const metadata: SpecXmlNode = { tag: 'Metadata', attrs: {}, children: [] };
  const apiVersion = scalar(parsed.nodes[0].metadata.apiVersion);
  if (apiVersion !== undefined) metadata.children.push(textNode('ApiVersion', apiVersion));
  for (const [key, value] of Object.entries(parsed.nodes[0].attributes ?? {})) {
    const field = snakeToPascal(key);
    if (ROOT_METADATA_TAGS.has(field)) metadata.children.push(textNode(field, requireScalar(value, `Mission.${key}`)));
  }
  root.children.unshift(metadata);
  root.attrs['xmlns:cdt'] = 'urn:codument:v1';
  return root;
}

export function convertLegacyMissionXml(content: string, targetApiVersion?: string): string {
  const root = parseSpecXmlContent(content);
  if (root.tag !== 'Mission') throw new Error(`Legacy Mission root must be <Mission>, received <${root.tag}>`);
  const converted = toXnlElement(root, true);
  if (targetApiVersion && converted.metadata.apiVersion === undefined) {
    converted.metadata.apiVersion = targetApiVersion;
  }
  return serializeXnlFile([converted]);
}

function toXnlElement(node: SpecXmlNode, root = false): ElementNode {
  const tag = stripCdt(node.tag);
  const id = node.attrs.id;
  const metadata: Record<string, XnlNode> = {};
  const attributes: Record<string, XnlNode> = {};
  const identity = id && (root || isXnlWord(id)) ? MakeWord(id) : undefined;
  if (id && !identity) attributes.id = id;
  const childNodes = root ? node.children.filter((child) => child.tag !== 'Metadata') : node.children;

  if (root) {
    const metadataNode = node.children.find((child) => child.tag === 'Metadata');
    for (const field of metadataNode?.children ?? []) {
      if (!field.text) continue;
      if (field.tag === 'ApiVersion') metadata.apiVersion = field.text;
      else attributes[pascalToSnake(field.tag)] = parseScalar(field.text);
    }
    const version = node.attrs.version;
    if (version) metadata.version = version;
  }

  for (const [key, value] of Object.entries(node.attrs)) {
    if (key === 'id' || key === 'version' || key.startsWith('xmlns')) continue;
    attributes[attrToXnl(key)] = parseScalar(value);
  }

  if (childNodes.length === 0 && node.text !== undefined) {
    const text: TextElementNode = {
      kind: 'TextElement',
      tag,
      ...(identity ? { id: identity } : {}),
      metadata,
      ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
      text: node.text,
    };
    return text;
  }

  const data: DataElementNode = {
    kind: 'DataElement',
    tag,
    ...(identity ? { id: identity } : {}),
    metadata,
    ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
  };
  const children = childNodes.map((child) => toXnlElement(child));
  const forceBody = COLLECTION_TAGS.has(tag);
  const counts = new Map<string, number>();
  for (const child of children) counts.set(child.tag, (counts.get(child.tag) ?? 0) + 1);
  const body = children.filter((child) => forceBody || (counts.get(child.tag) ?? 0) > 1);
  const unique = children.filter((child) => !forceBody && (counts.get(child.tag) ?? 0) === 1);
  if (unique.length > 0) {
    data.extend = {
      order: unique.map((child) => child.tag),
      children: Object.fromEntries(unique.map((child) => [child.tag, child])),
    };
  }
  if (body.length > 0) data.body = body;
  return data;
}

function fromXnlElement(node: DataElementNode | TextElementNode): SpecXmlNode {
  const tag = addCdt(node.tag);
  const attrs: Record<string, string> = {};
  const id = wordToString(node.id);
  if (id) attrs.id = id;
  if (node.tag === 'Mission') {
    const version = scalar(node.metadata.version);
    if (version !== undefined) attrs.version = version;
  }
  for (const [key, value] of Object.entries(node.attributes ?? {})) {
    if (node.tag === 'Mission' && ROOT_METADATA_TAGS.has(snakeToPascal(key))) continue;
    attrs[attrFromXnl(key)] = requireScalar(value, `${node.tag}.${key}`);
  }

  if (node.kind === 'TextElement') {
    return { tag, attrs, children: [], text: node.text ?? '' };
  }

  const children: SpecXmlNode[] = [];
  for (const key of node.extend?.order ?? []) {
    const child = node.extend?.children[key];
    if (child) children.push(fromXnlElement(child));
  }
  for (const child of node.body ?? []) {
    if (!isElement(child)) throw new Error(`${node.tag} body may contain only child elements.`);
    children.push(fromXnlElement(child));
  }
  return { tag, attrs, children };
}

function textNode(tag: string, text: string): SpecXmlNode {
  return { tag, attrs: {}, children: [], text };
}

function parseScalar(value: string): string | number | boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function scalar(value: XnlNode | undefined): string | undefined {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : undefined;
}

function requireScalar(value: XnlNode, location: string): string {
  const normalized = scalar(value);
  if (normalized === undefined) throw new Error(`${location} must be a scalar Mission property.`);
  return normalized;
}

function pascalToSnake(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function snakeToPascal(value: string): string {
  return value.split('_').map((part) => part ? part[0].toUpperCase() + part.slice(1) : '').join('');
}

function attrToXnl(value: string): string {
  return value.replace(/^cdt:/, '').replaceAll('-', '_');
}

function attrFromXnl(value: string): string {
  const kebab = value.replaceAll('_', '-');
  return value === 'child_mode' ? 'cdt:child-mode' : kebab;
}

function stripCdt(tag: string): string {
  return tag.replace(/^cdt:/, '');
}

function addCdt(tag: string): string {
  return CDT_TAGS.has(tag) ? `cdt:${tag}` : tag;
}

function isXnlWord(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*$/.test(value);
}

function isDataElement(value: XnlNode | undefined): value is DataElementNode {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && 'kind' in value && value.kind === 'DataElement');
}

function isElement(value: XnlNode): value is DataElementNode | TextElementNode {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && 'kind' in value
    && (value.kind === 'DataElement' || value.kind === 'TextElement'));
}
