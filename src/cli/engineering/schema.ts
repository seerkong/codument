import type { XnlNode, DataElementNode } from 'xnl-core';
import { orderedElementChildren } from '../xnl/registry';
import { isDataElement, readNodeId, type EngineeringRegistry } from './registry';

/**
 * Node schema validation for the engineering registry: kind vocabulary and
 * minimal required representations per engineering knowledge kind.
 * See std/spec/engineering-node-schema.md.
 */

export const ENGINEERING_KINDS = [
  'overview',
  'howto',
  'rule',
  'example',
  'reference',
  'troubleshooting',
  'runbook',
  'code-map',
] as const;

function childTags(node: DataElementNode): Set<string> {
  return new Set(orderedElementChildren(node).map((c) => c.tag));
}

function propString(node: DataElementNode, key: string): string | undefined {
  const v = node.attributes?.[key] ?? node.metadata?.[key];
  return typeof v === 'string' ? v : undefined;
}

export function nodeKind(node: DataElementNode): string | undefined {
  return propString(node, 'kind');
}

export function validateEngineeringNode(node: XnlNode): string[] {
  const errors: string[] = [];
  if (!isDataElement(node)) return errors;
  const id = readNodeId(node);
  const where = id ? `#${id}` : `<${node.tag}>`;

  if (!id) {
    errors.push(`${where}: node has no id (use #<plane>.<category>.<topic>.<name>)`);
  }

  const kind = nodeKind(node);
  if (!kind) {
    errors.push(`${where}: missing 'kind'`);
    return errors;
  }

  const isShell = kind.includes(':');
  if (!isShell && !(ENGINEERING_KINDS as readonly string[]).includes(kind)) {
    errors.push(`${where}: unknown engineering kind '${kind}'`);
  }

  const tags = childTags(node);
  const req = (cond: boolean, msg: string) => {
    if (!cond) errors.push(`${where} (kind=${kind}): ${msg}`);
  };

  switch (kind) {
    case 'overview':
      req(tags.has('desc'), 'overview requires a <desc> block');
      req(tags.has('mental-model'), 'overview requires a <mental-model> block');
      break;
    case 'howto':
      req(tags.has('when-to-use'), 'howto requires a <when-to-use> block');
      req(tags.has('steps'), 'howto requires a <steps> block');
      req(tags.has('verification'), 'howto requires a <verification> block');
      break;
    case 'rule':
      req(tags.has('rule'), 'rule requires a <rule> block');
      req(tags.has('rationale'), 'rule requires a <rationale> block');
      req(tags.has('enforcement'), 'rule requires an <enforcement> block');
      break;
    case 'example':
      req(tags.has('scenario'), 'example requires a <scenario> block');
      req(tags.has('walkthrough'), 'example requires a <walkthrough> block');
      break;
    case 'reference':
      req(tags.has('scope'), 'reference requires a <scope> block');
      req(tags.has('source-of-truth'), 'reference requires a <source-of-truth> block');
      req(tags.has('update-procedure'), 'reference requires an <update-procedure> block');
      break;
    case 'troubleshooting':
      req(tags.has('symptoms'), 'troubleshooting requires a <symptoms> block');
      req(tags.has('diagnosis'), 'troubleshooting requires a <diagnosis> block');
      req(tags.has('fix'), 'troubleshooting requires a <fix> block');
      break;
    case 'runbook':
      req(tags.has('preconditions'), 'runbook requires a <preconditions> block');
      req(tags.has('steps'), 'runbook requires a <steps> block');
      req(tags.has('verification'), 'runbook requires a <verification> block');
      req(tags.has('rollback'), 'runbook requires a <rollback> block');
      break;
    case 'code-map':
      req(tags.has('scope'), 'code-map requires a <scope> block');
      req(tags.has('paths'), 'code-map requires a <paths> block');
      req(tags.has('update-procedure'), 'code-map requires an <update-procedure> block');
      break;
    default:
      break;
  }

  return errors;
}

export function validateEngineeringRegistry(registry: EngineeringRegistry): string[] {
  const errors: string[] = [];
  for (const nodes of registry.files.values()) {
    for (const node of nodes) errors.push(...validateEngineeringNode(node));
  }
  return errors;
}
