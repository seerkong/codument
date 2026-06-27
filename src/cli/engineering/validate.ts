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
  message: string;
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

function collectRefs(meta: AttributeMap | undefined): string[] {
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
  if (meta) for (const v of Object.values(meta)) visit(v);
  return out;
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
      message: `#${id}: id must be '#<plane>.<category>.<topic>.<name>'`,
    });
    return findings;
  }

  const [idPlane, idCategory, idTopic] = parts;
  if (idPlane !== loc.plane) {
    findings.push({
      file: relFile,
      layer: 'hierarchy',
      severity: 'error',
      message: `#${id}: id plane '${idPlane}' does not match path plane '${loc.plane}' (${relFile})`,
    });
  }
  if (idCategory !== loc.category) {
    findings.push({
      file: relFile,
      layer: 'hierarchy',
      severity: 'error',
      message: `#${id}: id category '${idCategory}' does not match path category '${loc.category}' (${relFile})`,
    });
  }
  if (idTopic !== loc.topic) {
    findings.push({
      file: relFile,
      layer: 'hierarchy',
      severity: 'error',
      message: `#${id}: id topic '${idTopic}' does not match path topic '${loc.topic}' (${relFile})`,
    });
  }

  return findings;
}

function checkReferences(node: DataElementNode, relFile: string, knownEngineeringUris: Set<string>): ValidateFinding[] {
  const findings: ValidateFinding[] = [];
  const id = readNodeId(node);
  const where = id ? `#${id}` : `<${node.tag}>`;

  for (const ref of collectRefs(node.metadata)) {
    if (ref.startsWith(ENGINEERING_SCHEME)) {
      if (!knownEngineeringUris.has(ref)) {
        findings.push({
          file: relFile,
          layer: 'hierarchy',
          severity: 'error',
          message: `${where}: dangling engineering reference '${ref}'`,
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
        message: `${where}: malformed reference '${ref}'`,
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
        message: `engineering file path must be '<plane>/<category>/<topic>.xnl' or '<plane>/<category>/<topic>/index.xnl'`,
      });
      continue;
    }
    if (!KNOWN_CATEGORIES.has(loc.category)) {
      findings.push({
        file: relFile,
        layer: 'hierarchy',
        severity: 'warning',
        message: `unknown engineering category '${loc.category}' (custom categories are allowed; verify it is intentional)`,
      });
    }
  }

  if (!planes.has('global')) {
    findings.push({
      file: '.',
      layer: 'hierarchy',
      severity: 'warning',
      message: `engineering registry has no 'global' plane; this is allowed but cross-plane knowledge usually belongs there`,
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
        message: issue.message,
      });
    } else {
      findings.push({ file: issue.file, layer: 'hierarchy', severity: 'error', message: issue.message });
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
