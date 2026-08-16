import * as path from 'path';
import type { DataElementNode, AttributeMap } from 'xnl-core';
import {
  loadEngineeringRegistrySafe,
  isDataElement,
  readNodeId,
  nodeName,
} from './registry';
import { validateEngineeringNode } from './schema';

/**
 * Engineering validation engine. Checks every engineering `.xnl` file across
 * XNL syntax, node-schema semantics, hierarchy, and URI reference shape.
 */

export type ValidateLayer = 'syntax' | 'schema' | 'hierarchy';
export type ValidateSeverity = 'error' | 'warning';

export interface ValidateFinding {
  file: string;
  line?: number;
  layer: ValidateLayer;
  severity: ValidateSeverity;
  /** Stable rule id for machine-readable findings (when available). */
  rule?: string;
  message: string;
  /** Optional minimal fix hint for authoring errors. */
  fix_hint?: string;
}

export type ValidateMode = 'registry' | 'deltas';

export interface ValidateOptions {
  /**
   * registry: `<plane>/<category>/<topic>.xnl` or `<plane>/<category>/<topic>/index.xnl`.
   * deltas: same layout under a track's `engineering_deltas/`.
   */
  mode?: ValidateMode;
}

const KNOWN_PLANES = new Set([
  'global',
  'backend',
  'surface',
  'runtime',
  'storage',
  'pipelines',
  'agents',
  'operations',
  'cli',
]);

const KNOWN_CATEGORIES = new Set([
  'overview',
  'howto',
  'rules',
  'examples',
  'reference',
  'troubleshooting',
  'runbooks',
  'code-map',
]);

const ENGINEERING_SCHEME = 'engineering://';
const MODELING_SCHEME = 'modeling://';
const BEHAVIOR_SCHEME = 'behavior://';
const DECISION_SCHEME = 'decision://';

const RULE_FIX_HINTS: Record<string, string> = {
  'engineering.id-plane-mismatch': '将节点 id 的 plane 改为与路径 plane 一致',
  'engineering.id-category-mismatch': '将节点 id 的 category 改为与路径 category 一致',
  'engineering.id-topic-mismatch': '将节点 id 的 topic 改为与路径 topic 一致（不含 .xnl 后缀）',
  'engineering.dangling-reference': '检查 engineering:// 引用路径是否存在于 registry',
  'engineering.malformed-reference': '检查引用格式；确保路径段数符合 scheme 要求',
  'engineering.path-format': '文件路径必须为 <plane>/<category>/<topic>.xnl，例如 backend/rules/state_transitions.xnl',
  'engineering.missing-global-plane': '如无跨 plane 知识，可忽略此 warning',
  'engineering.unknown-category': '如为有意使用的自定义 category，可忽略；否则改为已知 category（howto/rules/reference/code-map）',
  'engineering.unknown-plane': '如为有意使用的自定义 plane，可忽略；否则改为已知 plane（global/backend/surface 等）',
  'xnl.syntax': '检查 XNL 语法：节点闭合、文本块 </?>、数组末尾逗号',
};

interface PathLoc {
  plane: string;
  category: string;
  topic: string;
}

function pathLoc(relFile: string): PathLoc {
  const segs = relFile.split(path.sep).filter(Boolean);
  const plane = segs[0] ?? '';
  const category = segs[1] ?? '';
  let topic = segs[2] ?? '';
  if (topic === 'index.xnl' && segs.length >= 3) topic = segs[1] ?? '';
  topic = topic.replace(/\.xnl$/i, '');
  return { plane, category, topic };
}

function collectRefs(attrs: AttributeMap | undefined): string[] {
  const out: string[] = [];
  const visit = (v: unknown): void => {
    if (typeof v === 'string') {
      if (
        v.startsWith(ENGINEERING_SCHEME) ||
        v.startsWith(MODELING_SCHEME) ||
        v.startsWith(BEHAVIOR_SCHEME) ||
        v.startsWith(DECISION_SCHEME)
      ) {
        out.push(v);
      }
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) visit(item);
      return;
    }
    if (v && typeof v === 'object') {
      for (const item of Object.values(v as Record<string, unknown>)) visit(item);
    }
  };
  if (attrs) for (const v of Object.values(attrs)) visit(v);
  return out;
}

function collectNodeRefs(node: DataElementNode): string[] {
  return [
    ...collectRefs(node.attributes),
    ...collectRefs(node.metadata),
  ];
}

function checkIdPathAlignment(node: DataElementNode, relFile: string, loc: PathLoc): ValidateFinding[] {
  const findings: ValidateFinding[] = [];
  const id = readNodeId(node);
  if (!id) return findings;
  const parts = id.split('.');

  if (parts.length < 4) {
    findings.push({
      file: relFile,
      layer: 'hierarchy',
      severity: 'error',
      rule: 'engineering.id-format',
      message: `#${id}: id must be '#<plane>.<category>.<topic>.<name>'`,
      fix_hint: '使用完整四段式 id，例如 #backend.rules.state_transitions.no_illegal_status',
    });
    return findings;
  }

  const [idPlane, idCategory, idTopic] = parts;
  if (idPlane !== loc.plane) {
    findings.push({
      file: relFile,
      layer: 'hierarchy',
      severity: 'error',
      rule: 'engineering.id-plane-mismatch',
      message: `#${id}: id plane '${idPlane}' does not match path plane '${loc.plane}' (${relFile})`,
      fix_hint: RULE_FIX_HINTS['engineering.id-plane-mismatch'],
    });
  }
  if (idCategory !== loc.category) {
    findings.push({
      file: relFile,
      layer: 'hierarchy',
      severity: 'error',
      rule: 'engineering.id-category-mismatch',
      message: `#${id}: id category '${idCategory}' does not match path category '${loc.category}' (${relFile})`,
      fix_hint: RULE_FIX_HINTS['engineering.id-category-mismatch'],
    });
  }
  if (idTopic !== loc.topic) {
    findings.push({
      file: relFile,
      layer: 'hierarchy',
      severity: 'error',
      rule: 'engineering.id-topic-mismatch',
      message: `#${id}: id topic '${idTopic}' does not match path topic '${loc.topic}' (${relFile})`,
      fix_hint: RULE_FIX_HINTS['engineering.id-topic-mismatch'],
    });
  }

  return findings;
}

function checkReferences(node: DataElementNode, relFile: string, knownEngineeringUris: Set<string>): ValidateFinding[] {
  const findings: ValidateFinding[] = [];
  const id = readNodeId(node);
  const where = id ? `#${id}` : `<${node.tag}>`;

  for (const ref of collectNodeRefs(node)) {
    if (ref.startsWith(ENGINEERING_SCHEME)) {
      if (!knownEngineeringUris.has(ref)) {
        findings.push({
          file: relFile,
          layer: 'hierarchy',
          severity: 'error',
          rule: 'engineering.dangling-reference',
          message: `${where}: dangling engineering reference '${ref}'`,
          fix_hint: RULE_FIX_HINTS['engineering.dangling-reference'],
        });
      }
      continue;
    }

    const [scheme, minParts] = ref.startsWith(MODELING_SCHEME)
      ? [MODELING_SCHEME, 3]
      : ref.startsWith(BEHAVIOR_SCHEME)
        ? [BEHAVIOR_SCHEME, 2]
        : ref.startsWith(DECISION_SCHEME)
          ? [DECISION_SCHEME, 1]
          : ['', 0];
    if (!scheme) continue;
    const rest = ref.slice(scheme.length);
    if (rest.split('/').filter(Boolean).length < minParts) {
      findings.push({
        file: relFile,
        layer: 'hierarchy',
        severity: 'error',
        rule: 'engineering.malformed-reference',
        message: `${where}: malformed reference '${ref}'`,
        fix_hint: `检查引用格式；${scheme} 至少需要 ${minParts} 个路径段`,
      });
    }
  }

  return findings;
}

function checkLayout(relFiles: Iterable<string>): ValidateFinding[] {
  const findings: ValidateFinding[] = [];
  const planes = new Set<string>();
  for (const relFile of relFiles) {
    const loc = pathLoc(relFile);
    if (loc.plane) planes.add(loc.plane);
    if (!loc.plane || !loc.category || !loc.topic) {
      findings.push({
        file: relFile,
        layer: 'hierarchy',
        severity: 'error',
        rule: 'engineering.path-format',
        message: `engineering file path must be '<plane>/<category>/<topic>.xnl' or '<plane>/<category>/<topic>/index.xnl'`,
        fix_hint: RULE_FIX_HINTS['engineering.path-format'],
      });
      continue;
    }
    if (!KNOWN_CATEGORIES.has(loc.category)) {
      findings.push({
        file: relFile,
        layer: 'hierarchy',
        severity: 'warning',
        rule: 'engineering.unknown-category',
        message: `unknown engineering category '${loc.category}' (custom categories are allowed; verify it is intentional)`,
        fix_hint: RULE_FIX_HINTS['engineering.unknown-category'],
      });
    }
  }

  if (!planes.has('global')) {
    findings.push({
      file: '.',
      layer: 'hierarchy',
      severity: 'warning',
      rule: 'engineering.missing-global-plane',
      message: `engineering registry has no 'global' plane; this is allowed but cross-plane knowledge usually belongs there`,
      fix_hint: RULE_FIX_HINTS['engineering.missing-global-plane'],
    });
  }

  for (const plane of planes) {
    if (plane && !KNOWN_PLANES.has(plane)) {
      findings.push({
        file: '.',
        layer: 'hierarchy',
        severity: 'warning',
        message: `unknown engineering plane '${plane}' (custom planes are allowed; verify it is intentional)`,
      });
    }
  }

  return findings;
}

export function validateEngineeringTree(dir: string, opts: ValidateOptions = {}): ValidateFinding[] {
  void opts;
  const findings: ValidateFinding[] = [];
  const { registry, issues } = loadEngineeringRegistrySafe(dir);

  for (const issue of issues) {
    if (issue.kind === 'syntax') {
      findings.push({
        file: issue.file,
        line: issue.line,
        layer: 'syntax',
        severity: 'error',
        rule: 'xnl.syntax',
        message: issue.message,
        fix_hint: RULE_FIX_HINTS['xnl.syntax'],
      });
    } else {
      findings.push({
        file: issue.file,
        layer: 'hierarchy',
        severity: 'error',
        rule: 'engineering.registry-load',
        message: issue.message,
      });
    }
  }

  const knownEngineeringUris = new Set<string>();
  for (const [relFile, nodes] of registry.files) {
    const loc = pathLoc(relFile);
    for (const node of nodes) {
      const id = readNodeId(node);
      if (!id || !isDataElement(node)) continue;
      knownEngineeringUris.add(`${ENGINEERING_SCHEME}${loc.plane}/${loc.category}/${loc.topic}/${nodeName(id)}`);
    }
  }

  for (const [relFile, nodes] of registry.files) {
    const loc = pathLoc(relFile);
    for (const node of nodes) {
      if (!isDataElement(node)) continue;
      for (const msg of validateEngineeringNode(node)) {
        findings.push({ file: relFile, layer: 'schema', severity: 'error', message: msg });
      }
      findings.push(...checkIdPathAlignment(node, relFile, loc));
      findings.push(...checkReferences(node, relFile, knownEngineeringUris));
    }
  }

  const layoutFiles = new Set<string>(registry.files.keys());
  for (const issue of issues) if (issue.kind === 'syntax') layoutFiles.add(issue.file);
  findings.push(...checkLayout(layoutFiles));

  return findings;
}
