import * as path from 'path';
import type { XnlNode, DataElementNode, AttributeMap } from 'xnl-core';
import {
  loadModelingRegistrySafe,
  isDataElement,
  readNodeId,
  idNamespace,
  nodeName,
  type ModelingRegistry,
} from './registry';
import { validateModelingNode } from './schema';

/**
 * Modeling validation engine. Checks every modeling `.xnl` file across three
 * layers — XNL syntax, node-schema semantics, hierarchy/reference consistency —
 * and returns author-friendly findings instead of throwing.
 *
 * See std/spec/modeling-node-schema.md (§5 id namespace, §6 references) and the
 * track decisions: id↔path alignment is lenient (context must match; plane
 * prefix optional but must match if present); `modeling://` dangling refs are
 * errors; `behavior://` is syntax-only; a `domain` plane must exist; unknown
 * derived planes are warnings; duplicate ids are findings, not throws.
 */

export type ValidateLayer = 'syntax' | 'schema' | 'hierarchy';
export type ValidateSeverity = 'error' | 'warning';

export interface ValidateFinding {
  /** Path relative to the validated dir. */
  file: string;
  /** 1-based line, when known. */
  line?: number;
  layer: ValidateLayer;
  severity: ValidateSeverity;
  message: string;
}

export type ValidateMode = 'registry' | 'deltas';

export interface ValidateOptions {
  /**
   * `registry` (default): files live at `<plane>/<context>/...index.xnl` — path
   * context is the second path segment. `deltas`: files live at
   * `<plane>/<context>.xnl` (a track's `modeling_deltas/`) — path context is the
   * file basename without `.xnl`.
   */
  mode?: ValidateMode;
}

/** Planes with a fixed meaning; anything else is treated as an open derived plane. */
const KNOWN_PLANES = new Set(['domain', 'backend', 'surface', 'cli', 'agent']);

/** Reference scheme prefixes we recognise in metadata values. */
const MODELING_SCHEME = 'modeling://';
const BEHAVIOR_SCHEME = 'behavior://';

interface PathLoc {
  plane: string;
  context: string;
}

/** Derive `<plane>/<context>` from a registry / delta file path. */
function pathLoc(relFile: string, mode: ValidateMode): PathLoc {
  const segs = relFile.split(path.sep).filter(Boolean);
  const plane = segs[0] ?? '';
  if (mode === 'deltas') {
    // `<plane>/<context>.xnl`
    const base = segs[1] ?? '';
    const context = base.replace(/\.xnl$/i, '');
    return { plane, context };
  }
  // registry: `<plane>/<context>/...`
  const context = segs[1] ?? plane;
  return { plane, context };
}

/** Collect every `modeling://` / `behavior://` string anywhere in a metadata map. */
function collectRefs(meta: AttributeMap | undefined): string[] {
  const out: string[] = [];
  const visit = (v: unknown): void => {
    if (typeof v === 'string') {
      if (v.startsWith(MODELING_SCHEME) || v.startsWith(BEHAVIOR_SCHEME)) out.push(v);
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) visit(item);
      return;
    }
    if (v && typeof v === 'object') {
      // XnlWord or nested attribute map — scan its values.
      for (const item of Object.values(v as Record<string, unknown>)) visit(item);
    }
  };
  if (meta) for (const v of Object.values(meta)) visit(v);
  return out;
}

/** Validate id↔path alignment for one node; returns hierarchy findings. */
function checkIdPathAlignment(
  node: DataElementNode,
  relFile: string,
  loc: PathLoc,
): ValidateFinding[] {
  const findings: ValidateFinding[] = [];
  const id = readNodeId(node);
  if (!id) return findings; // schema layer already flags a missing id
  const ns = idNamespace(id);
  const segs = ns ? ns.split('.') : [];

  if (segs.length === 0) {
    findings.push({
      file: relFile,
      layer: 'hierarchy',
      severity: 'error',
      message: `#${id}: id has no namespace context segment; expected '<context>.<name>' with context '${loc.context}'`,
    });
    return findings;
  }

  const idContext = segs[segs.length - 1];
  if (idContext !== loc.context) {
    findings.push({
      file: relFile,
      layer: 'hierarchy',
      severity: 'error',
      message: `#${id}: id context '${idContext}' does not match path context '${loc.context}' (${relFile})`,
    });
  }

  // plane prefix optional; if present (namespace has >= 2 segments) it must match.
  if (segs.length >= 2) {
    const idPlane = segs[segs.length - 2];
    if (idPlane !== loc.plane) {
      findings.push({
        file: relFile,
        layer: 'hierarchy',
        severity: 'error',
        message: `#${id}: id plane prefix '${idPlane}' does not match path plane '${loc.plane}' (${relFile})`,
      });
    }
  }

  return findings;
}

/** Validate modeling:///behavior:// references for one node against the uri set. */
function checkReferences(
  node: DataElementNode,
  relFile: string,
  knownUris: Set<string>,
): ValidateFinding[] {
  const findings: ValidateFinding[] = [];
  const id = readNodeId(node);
  const where = id ? `#${id}` : `<${node.tag}>`;
  for (const ref of collectRefs(node.metadata)) {
    if (ref.startsWith(MODELING_SCHEME)) {
      if (!knownUris.has(ref)) {
        findings.push({
          file: relFile,
          layer: 'hierarchy',
          severity: 'error',
          message: `${where}: dangling reference '${ref}' (no such node in the registry index)`,
        });
      }
    } else if (ref.startsWith(BEHAVIOR_SCHEME)) {
      // Syntax-only: must look like behavior://<capability>/.../<id>; existence unverified.
      const rest = ref.slice(BEHAVIOR_SCHEME.length);
      if (rest.split('/').filter(Boolean).length < 2) {
        findings.push({
          file: relFile,
          layer: 'hierarchy',
          severity: 'error',
          message: `${where}: malformed behavior reference '${ref}' (expected behavior://<capability>/...)`,
        });
      }
    }
  }
  return findings;
}

/**
 * Check plane legality: domain must exist; unknown = warning. Operates over every
 * discovered file path (including ones that failed to parse), so a syntax error in
 * a `domain/...` file does not also produce a spurious "missing domain plane".
 */
function checkPlanes(relFiles: Iterable<string>, mode: ValidateMode): ValidateFinding[] {
  const findings: ValidateFinding[] = [];
  const planes = new Set<string>();
  for (const relFile of relFiles) {
    planes.add(pathLoc(relFile, mode).plane);
  }

  if (!planes.has('domain')) {
    findings.push({
      file: '.',
      layer: 'hierarchy',
      severity: 'error',
      message: `modeling registry must contain a 'domain' plane (found planes: ${[...planes].sort().join(', ') || '(none)'})`,
    });
  }

  for (const plane of planes) {
    if (plane && !KNOWN_PLANES.has(plane)) {
      findings.push({
        file: '.',
        layer: 'hierarchy',
        severity: 'warning',
        message: `unknown derived plane '${plane}' (open derived planes are allowed; verify it is intentional)`,
      });
    }
  }

  return findings;
}

/**
 * Validate a modeling tree (registry by default, or a track's `modeling_deltas/`
 * tree when `mode: 'deltas'`). Returns all findings across the three layers;
 * never throws on author errors.
 */
export function validateModelingTree(dir: string, opts: ValidateOptions = {}): ValidateFinding[] {
  const mode: ValidateMode = opts.mode ?? 'registry';
  const findings: ValidateFinding[] = [];

  const { registry, issues } = loadModelingRegistrySafe(dir);

  // Layer 1 (syntax) + duplicate id (hierarchy), from the safe loader.
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
      findings.push({
        file: issue.file,
        layer: 'hierarchy',
        severity: 'error',
        message: issue.message,
      });
    }
  }

  // Known uris for reference resolution. Recompute from the path layout so delta
  // mode (`<plane>/<context>.xnl`) and registry mode agree on the canonical
  // `modeling://<plane>/<context>/<name>` form.
  const knownUris = new Set<string>();
  for (const [relFile, nodes] of registry.files) {
    const loc = pathLoc(relFile, mode);
    for (const node of nodes) {
      const id = readNodeId(node);
      if (!id || !isDataElement(node)) continue;
      knownUris.add(`${MODELING_SCHEME}${loc.plane}/${loc.context}/${nodeName(id)}`);
    }
  }

  // Layer 2 (schema) + Layer 3 per-node (alignment + references).
  for (const [relFile, nodes] of registry.files) {
    const loc = pathLoc(relFile, mode);
    for (const node of nodes) {
      if (!isDataElement(node)) continue;
      for (const msg of validateModelingNode(node)) {
        findings.push({ file: relFile, layer: 'schema', severity: 'error', message: msg });
      }
      findings.push(...checkIdPathAlignment(node, relFile, loc));
      findings.push(...checkReferences(node, relFile, knownUris));
    }
  }

  // Layer 3 cross-file: plane legality, over all discovered files (parsed ones
  // plus syntax-failed ones, so a broken domain file still counts as a domain plane).
  const planeFiles = new Set<string>(registry.files.keys());
  for (const issue of issues) if (issue.kind === 'syntax') planeFiles.add(issue.file);
  findings.push(...checkPlanes(planeFiles, mode));

  return findings;
}

export { idNamespace };
