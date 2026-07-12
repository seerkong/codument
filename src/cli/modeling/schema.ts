import type { XnlNode, DataElementNode, TextElementNode } from 'xnl-core';
import { isDataElement, readNodeId, type ModelingRegistry } from './registry';

/**
 * Node schema validation for the modeling registry: kind vocabulary, minimal
 * required representations per kind, fact-source attributes, and namespaced ids.
 * See std/spec/modeling-node-schema.md.
 */

export const FACT_GRADES = [
  'authoritative_fact',
  'domain_canonical_event',
  'runtime_control_fact',
  'append_only_journal',
  'checkpoint_snapshot',
  'derived_projection_cache',
  'surface_view',
] as const;

/** Kernel (cross-domain) bare-tag kinds. Shell kinds are namespaced (`plane:kind`). */
export const KERNEL_KINDS = [
  'entity',
  'object',
  'enum',
  'state-machine',
  'module',
  'capsule',
  'component',
  'port',
  'actor',
  'policy',
] as const;

type Element = DataElementNode | TextElementNode;

function isElement(node: XnlNode | undefined): node is Element {
  return Boolean(
    node && typeof node === 'object' &&
      ((node as Element).kind === 'DataElement' || (node as Element).kind === 'TextElement'),
  );
}

function bodyChildren(node: DataElementNode): Element[] {
  return (node.body ?? []).filter(isElement);
}

/** Direct child element tags (Data + Text). */
function childTags(node: DataElementNode): Set<string> {
  return new Set(bodyChildren(node).map((c) => c.tag));
}

/** Whether any descendant element has the given tag. */
function hasChildDeep(node: DataElementNode, tag: string): boolean {
  for (const child of bodyChildren(node)) {
    if (child.tag === tag) return true;
    if (isDataElement(child) && hasChildDeep(child, tag)) return true;
  }
  return false;
}

/**
 * Whether a component declares the given IO slot, accepting either the canonical
 * bare tag (`<runtime>` …) or the role-tagged compat form (`<types { role = "runtime" }>`).
 * Bare tags are spec-recommended; role-tagged is accepted-but-discouraged.
 */
function hasIoSlot(node: DataElementNode, slot: string): boolean {
  for (const child of bodyChildren(node)) {
    if (child.tag === slot) return true;
    if (child.tag === 'types') {
      const role = child.attributes?.['role'] ?? child.metadata?.['role'];
      if (typeof role === 'string' && role === slot) return true;
    }
  }
  return false;
}

function hasProp(node: DataElementNode, key: string): boolean {
  const v = node.attributes?.[key] ?? node.metadata?.[key];
  return v !== undefined && v !== null && v !== '';
}

function propString(node: DataElementNode, key: string): string | undefined {
  const v = node.attributes?.[key] ?? node.metadata?.[key];
  return typeof v === 'string' ? v : undefined;
}

export function nodeKind(node: DataElementNode): string | undefined {
  return propString(node, 'kind');
}

/** Validate one modeling node; returns a list of error messages (empty = ok). */
export function validateModelingNode(node: XnlNode): string[] {
  const errors: string[] = [];
  if (!isDataElement(node)) return errors; // non-element top-level content is ignored
  const id = readNodeId(node);
  const where = id ? `#${id}` : `<${node.tag}>`;

  if (!id) {
    errors.push(`${where}: node has no id (use a namespaced #<context>.<name>)`);
  }

  const kind = nodeKind(node);
  if (!kind) {
    errors.push(`${where}: missing 'kind'`);
    return errors;
  }
  const isShell = kind.includes(':');
  if (!isShell && !(KERNEL_KINDS as readonly string[]).includes(kind)) {
    errors.push(`${where}: unknown kernel kind '${kind}' (use a known kernel kind or a namespaced shell kind)`);
  }

  const tags = childTags(node);
  const req = (cond: boolean, msg: string) => {
    if (!cond) errors.push(`${where} (kind=${kind}): ${msg}`);
  };

  switch (kind) {
    case 'entity':
    case 'object':
      req(tags.has('types'), 'entity requires a <types> representation');
      req(hasProp(node, 'fact_grade'), 'entity requires fact_grade');
      req(hasProp(node, 'single_writer'), 'entity requires single_writer');
      break;
    case 'enum':
      req(tags.has('types'), 'enum requires a <types> representation');
      break;
    case 'state-machine':
      req(hasChildDeep(node, 'mermaid'), 'state-machine requires a <mermaid> diagram');
      break;
    case 'module':
    case 'capsule':
      req(hasProp(node, 'depends_on'), 'module requires depends_on');
      req(tags.has('capsule-tree'), 'module requires a <capsule-tree>');
      break;
    case 'component':
      for (const slot of ['runtime', 'input', 'config', 'output']) {
        req(hasIoSlot(node, slot), `component requires a <${slot}> block`);
      }
      break;
    // port/actor/policy: lenient (kind valid is enough for now)
    default:
      break;
  }

  const fg = propString(node, 'fact_grade');
  if (fg !== undefined && !(FACT_GRADES as readonly string[]).includes(fg)) {
    errors.push(`${where}: invalid fact_grade '${fg}'`);
  }

  return errors;
}

/** Validate every node in a registry. */
export function validateModelingRegistry(registry: ModelingRegistry): string[] {
  const errors: string[] = [];
  for (const nodes of registry.files.values()) {
    for (const node of nodes) errors.push(...validateModelingNode(node));
  }
  return errors;
}
