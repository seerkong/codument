import * as fs from 'fs';
import * as path from 'path';
import { parseXnl, XnlParseError } from 'xnl-core';
import type { DataElementNode, TextElementNode, XnlNode } from 'xnl-core';
import {
  ACTIVE_TRACKS_DIR,
  DECISIONS_DIR,
  PENDING_TRACKS_DIR,
  parseOptions,
} from '../utils';
import {
  discoverXnlRegistryFiles,
  readStableNodeId,
} from '../xnl/registry';

export interface DecisionFinding {
  severity: 'error' | 'warning';
  file: string;
  decision: string;
  message: string;
  layer?: 'syntax' | 'schema' | 'hierarchy';
}

export const RESOLVED_DECISION_STATUS = new Set(['accepted', 'resolved', 'deferred']);

export interface XnlDecisionOption {
  key?: string;
  title?: string;
  description?: string;
  tradeoff?: string;
  recommended: boolean;
}

export interface XnlDecisionRecord {
  id: string;
  status?: string;
  blocks?: unknown;
  durableCandidate: boolean;
  rawAnswer?: string;
  decisionText?: string;
  rationale?: string;
  evidence?: string;
  confidence?: string;
  reversibility?: string;
  options: XnlDecisionOption[];
  optionsWrapperPresent: boolean;
  optionsInDecisionBody: boolean;
  directOptionChildren: number;
  invalidOptionChildren: number;
  answerWrapperPresent: boolean;
  answerInDecisionBody: boolean;
  invalidAnswerChildren: number;
}

type Element = DataElementNode | TextElementNode;

function isDataElement(node: XnlNode | undefined): node is DataElementNode {
  return Boolean(node && typeof node === 'object' && (node as DataElementNode).kind === 'DataElement');
}

function isTextElement(node: XnlNode | undefined): node is TextElementNode {
  return Boolean(node && typeof node === 'object' && (node as TextElementNode).kind === 'TextElement');
}

function isElement(node: XnlNode | undefined): node is Element {
  return isDataElement(node) || isTextElement(node);
}

function readNodeId(node: DataElementNode): string | undefined {
  return readStableNodeId(node);
}

function prop(node: DataElementNode, key: string): unknown {
  return node.attributes?.[key] ?? node.metadata?.[key];
}

function propText(node: DataElementNode, key: string): string | undefined {
  const value = prop(node, key);
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const child = node.extend?.children?.[key];
  if (isTextElement(child)) return (child.text ?? '').trim();
  return undefined;
}

function readXnlAnswerFeedback(node: DataElementNode): Pick<XnlDecisionRecord, 'rawAnswer' | 'decisionText' | 'rationale' | 'evidence' | 'answerWrapperPresent' | 'answerInDecisionBody' | 'invalidAnswerChildren'> {
  const answer = node.extend?.children?.answer;
  const answerInDecisionBody = (node.body ?? []).some((child) => isElement(child) && child.tag === 'answer');
  if (!answer || !isDataElement(answer)) {
    return {
      rawAnswer: propText(node, 'answer'),
      decisionText: propText(node, 'decision-text'),
      rationale: propText(node, 'rationale'),
      evidence: propText(node, 'evidence'),
      answerWrapperPresent: false,
      answerInDecisionBody,
      invalidAnswerChildren: 0,
    };
  }

  const allowed = new Set(['raw-answer', 'decision-text', 'rationale', 'evidence']);
  const nestedChildren = answer.extend?.children ?? {};
  const invalidAnswerChildren = Object.keys(nestedChildren).filter((key) => !allowed.has(key)).length
    + (answer.body?.length ?? 0);
  return {
    rawAnswer: propText(answer, 'raw-answer'),
    decisionText: propText(answer, 'decision-text'),
    rationale: propText(answer, 'rationale'),
    evidence: propText(answer, 'evidence'),
    answerWrapperPresent: true,
    answerInDecisionBody,
    invalidAnswerChildren,
  };
}

function propBool(node: DataElementNode, key: string): boolean {
  const value = prop(node, key);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'yes';
  }
  return false;
}

function hasBlockingBlocks(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value !== 'string') return Boolean(value);
  const normalized = value.trim().toLowerCase();
  return Boolean(normalized) && normalized !== '-' && normalized !== 'none' && normalized !== '[]';
}

function collectDecisionNodes(node: XnlNode, out: DataElementNode[]): void {
  if (!isDataElement(node)) return;
  if (node.tag === 'decision') {
    out.push(node);
  }
  for (const child of (node.body ?? []).filter(isElement)) {
    collectDecisionNodes(child, out);
  }
}

function readXnlDecisionOptions(node: DataElementNode): Pick<XnlDecisionRecord, 'options' | 'optionsWrapperPresent' | 'optionsInDecisionBody' | 'directOptionChildren' | 'invalidOptionChildren'> {
  const wrapper = node.extend?.children?.options;
  const optionsInDecisionBody = (node.body ?? []).some((child) => isElement(child) && child.tag === 'options');
  const directOptionChildren = (node.body ?? []).filter((child) => isElement(child) && child.tag === 'option').length
    + (node.extend?.children?.option ? 1 : 0);
  if (!wrapper || !isDataElement(wrapper)) {
    return {
      options: [],
      optionsWrapperPresent: false,
      optionsInDecisionBody,
      directOptionChildren,
      invalidOptionChildren: 0,
    };
  }

  const options: XnlDecisionOption[] = [];
  let invalidOptionChildren = 0;
  for (const child of wrapper.body ?? []) {
    if (!isDataElement(child) || child.tag !== 'option') {
      invalidOptionChildren += 1;
      continue;
    }
    options.push({
      key: propText(child, 'key'),
      title: propText(child, 'title'),
      description: propText(child, 'description'),
      tradeoff: propText(child, 'tradeoff'),
      recommended: propBool(child, 'recommended'),
    });
  }

  return {
    options,
    optionsWrapperPresent: true,
    optionsInDecisionBody,
    directOptionChildren,
    invalidOptionChildren,
  };
}

function readXnlDecisionRecord(node: DataElementNode): XnlDecisionRecord {
  return {
    id: readNodeId(node) ?? `<${node.tag}>`,
    status: propText(node, 'status')?.toLowerCase(),
    blocks: prop(node, 'blocks'),
    durableCandidate: propBool(node, 'durable_candidate') || propBool(node, 'durable-candidate'),
    confidence: propText(node, 'confidence'),
    reversibility: propText(node, 'reversibility'),
    ...readXnlAnswerFeedback(node),
    ...readXnlDecisionOptions(node),
  };
}

export function readXnlDecisionRecords(file: string): XnlDecisionRecord[] {
  const content = fs.readFileSync(file, 'utf-8');
  const nodes = parseXnl(content, { textBlockStyle: true }).nodes;
  const decisionNodes: DataElementNode[] = [];
  for (const node of nodes) {
    collectDecisionNodes(node, decisionNodes);
  }
  return decisionNodes.map(readXnlDecisionRecord);
}

function validateXnlDecisionRecords(
  file: string,
  records: XnlDecisionRecord[],
): DecisionFinding[] {
  const findings: DecisionFinding[] = [];
  for (const record of records) {
    const status = record.status;
    if (status === 'pending') {
      findings.push({
        file,
        severity: 'error',
        decision: record.id,
        message: 'decision is still pending',
      });
    }

    if (hasBlockingBlocks(record.blocks) && status && !RESOLVED_DECISION_STATUS.has(status)) {
      findings.push({
        file,
        severity: status === 'pending' ? 'error' : 'warning',
        decision: record.id,
        message: `blocking decision has unresolved status '${status}'`,
      });
    }

    if (record.durableCandidate) {
      for (const [required, value] of [
        ['Evidence', record.evidence],
        ['Confidence', record.confidence],
        ['Reversibility', record.reversibility],
      ] as const) {
        if (!value || value === '-') {
          findings.push({
            file,
            severity: 'warning',
            decision: record.id,
            message: `durable candidate is missing ${required}`,
          });
        }
      }
    }

    if (record.optionsInDecisionBody) {
      findings.push({
        file,
        severity: 'error',
        decision: record.id,
        message: 'options must be inside the decision extend block (), not the decision body []',
      });
    }

    if (record.directOptionChildren > 0) {
      findings.push({
        file,
        severity: 'error',
        decision: record.id,
        message: 'option must be inside an options wrapper, not directly under decision',
      });
    }

    if (record.answerInDecisionBody) {
      findings.push({
        file,
        severity: 'error',
        decision: record.id,
        message: 'answer must be inside the decision extend block (), not the decision body []',
      });
    }

    if (record.answerWrapperPresent) {
      if (record.invalidAnswerChildren > 0) {
        findings.push({
          file,
          severity: 'error',
          decision: record.id,
          message: 'answer may contain only raw-answer, decision-text, rationale and evidence child nodes',
        });
      }
      for (const [label, value] of [
        ['Raw answer', record.rawAnswer],
        ['Decision text', record.decisionText],
        ['Rationale', record.rationale],
        ['Evidence', record.evidence],
      ] as const) {
        if (!value || value === '-') {
          findings.push({
            file,
            severity: 'error',
            decision: record.id,
            message: `answer is missing ${label}`,
          });
        }
      }
    }

    if (record.optionsWrapperPresent) {
      if (record.options.length === 0) {
        findings.push({
          file,
          severity: 'error',
          decision: record.id,
          message: 'options must contain at least one option',
        });
      }
      if (record.invalidOptionChildren > 0) {
        findings.push({
          file,
          severity: 'error',
          decision: record.id,
          message: 'options may contain only option child nodes',
        });
      }

      const keys = new Set<string>();
      for (const option of record.options) {
        if (!option.key) {
          findings.push({
            file,
            severity: 'error',
            decision: record.id,
            message: 'option is missing key',
          });
        } else if (keys.has(option.key)) {
          findings.push({
            file,
            severity: 'error',
            decision: record.id,
            message: `option key is duplicated: ${option.key}`,
          });
        } else {
          keys.add(option.key);
        }

        if (!option.title) {
          findings.push({
            file,
            severity: 'error',
            decision: record.id,
            message: `option ${option.key ?? '(unknown)'} is missing title`,
          });
        }
        if (!option.description) {
          findings.push({
            file,
            severity: 'error',
            decision: record.id,
            message: `option ${option.key ?? '(unknown)'} is missing description`,
          });
        }
      }

      const recommendedCount = record.options.filter((option) => option.recommended).length;
      if (recommendedCount !== 1) {
        findings.push({
          file,
          severity: 'error',
          decision: record.id,
          message: `options must mark exactly one recommended option (found ${recommendedCount})`,
        });
      }
    }
  }

  return findings.map((finding) => ({ ...finding, layer: 'schema' }));
}

interface DecisionSourceSpec {
  file: string;
  label: string;
}

interface DecisionNodeRef {
  file: string;
  id?: string;
  node: DataElementNode;
  parentId?: string;
}

function hierarchyFinding(
  file: string,
  decision: string,
  message: string,
): DecisionFinding {
  return { file, decision, message, severity: 'error', layer: 'hierarchy' };
}

function collectDecisionNodeRefs(
  value: unknown,
  file: string,
  refs: DecisionNodeRef[],
  findings: DecisionFinding[],
  parentDecision?: DataElementNode,
  directParent?: DataElementNode,
  relation?: 'body' | 'extend' | 'attributes' | 'metadata',
): void {
  if (isDataElement(value as XnlNode)) {
    const node = value as DataElementNode;
    const isDecision = node.tag === 'decision';
    const id = isDecision ? readNodeId(node) : undefined;

    if (isDecision) {
      if (parentDecision && (directParent !== parentDecision || relation !== 'body')) {
        findings.push(hierarchyFinding(
          file,
          id ?? '<decision>',
          'nested decision must be a direct child in its parent decision body',
        ));
      }

      for (const child of node.body ?? []) {
        if (!isDataElement(child) || child.tag !== 'decision') {
          findings.push(hierarchyFinding(
            file,
            id ?? '<decision>',
            'decision body may contain only nested decision nodes',
          ));
        }
      }

      refs.push({
        file,
        id,
        node,
        parentId: parentDecision ? readNodeId(parentDecision) : undefined,
      });
    }

    const decisionForChildren = isDecision ? node : parentDecision;
    for (const child of node.body ?? []) {
      collectDecisionNodeRefs(
        child,
        file,
        refs,
        findings,
        decisionForChildren,
        node,
        'body',
      );
    }
    for (const child of Object.values(node.extend?.children ?? {})) {
      collectDecisionNodeRefs(
        child,
        file,
        refs,
        findings,
        decisionForChildren,
        node,
        'extend',
      );
    }
    for (const child of Object.values(node.attributes ?? {})) {
      collectDecisionNodeRefs(
        child,
        file,
        refs,
        findings,
        decisionForChildren,
        node,
        'attributes',
      );
    }
    for (const child of Object.values(node.metadata ?? {})) {
      collectDecisionNodeRefs(
        child,
        file,
        refs,
        findings,
        decisionForChildren,
        node,
        'metadata',
      );
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectDecisionNodeRefs(item, file, refs, findings, parentDecision, directParent, relation);
    }
    return;
  }

  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectDecisionNodeRefs(item, file, refs, findings, parentDecision, directParent, relation);
    }
  }
}

function normalizeDecisionReference(raw: string): string {
  return raw.startsWith('decision://') ? raw.slice('decision://'.length) : raw;
}

function referenceTarget(raw: string, expression: boolean): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const target = expression ? trimmed.slice(0, trimmed.indexOf('=')).trim() : trimmed;
  if (expression && !trimmed.includes('=')) return undefined;
  return normalizeDecisionReference(target) || undefined;
}

function stringList(
  value: unknown,
  field: string,
  ref: DecisionNodeRef,
  findings: DecisionFinding[],
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    findings.push({
      file: ref.file,
      decision: ref.id ?? '<decision>',
      severity: 'error',
      layer: 'schema',
      message: `${field} must be an array of strings`,
    });
    return [];
  }

  const strings: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) {
      findings.push({
        file: ref.file,
        decision: ref.id ?? '<decision>',
        severity: 'error',
        layer: 'schema',
        message: `${field} must contain only non-empty strings`,
      });
      continue;
    }
    strings.push(item);
  }
  return strings;
}

function referenceFinding(
  ref: DecisionNodeRef,
  field: string,
  raw: string,
  knownIds: Set<string>,
  expression: boolean,
): DecisionFinding | undefined {
  const target = referenceTarget(raw, expression);
  if (!target) {
    return {
      file: ref.file,
      decision: ref.id ?? '<decision>',
      severity: 'error',
      layer: 'schema',
      message: `malformed ${field} reference '${raw}'`,
    };
  }
  if (knownIds.has(target)) return undefined;
  return hierarchyFinding(
    ref.file,
    ref.id ?? '<decision>',
    `unresolved ${field} reference '${target}'`,
  );
}

function validateDecisionReferences(
  refs: DecisionNodeRef[],
  knownIds: Set<string>,
): { findings: DecisionFinding[]; dependencies: Map<string, Set<string>> } {
  const findings: DecisionFinding[] = [];
  const dependencies = new Map<string, Set<string>>();

  for (const ref of refs) {
    if (!ref.id) continue;
    const deps = dependencies.get(ref.id) ?? new Set<string>();
    dependencies.set(ref.id, deps);
    if (ref.parentId) deps.add(ref.parentId);

    for (const raw of stringList(prop(ref.node, 'depends_on'), 'depends_on', ref, findings)) {
      const finding = referenceFinding(ref, 'depends_on', raw, knownIds, false);
      if (finding) {
        findings.push(finding);
      } else {
        deps.add(normalizeDecisionReference(raw.trim()));
      }
    }

    const activation = prop(ref.node, 'activation');
    if (activation !== undefined) {
      if (!activation || typeof activation !== 'object' || Array.isArray(activation)) {
        findings.push({
          file: ref.file,
          decision: ref.id,
          severity: 'error',
          layer: 'schema',
          message: 'activation must be an object containing all and/or any string arrays',
        });
      } else {
        const rules = activation as Record<string, unknown>;
        for (const key of ['all', 'any']) {
          for (const raw of stringList(rules[key], `activation.${key}`, ref, findings)) {
            const finding = referenceFinding(ref, 'activation', raw, knownIds, true);
            if (finding) findings.push(finding);
          }
        }
      }
    }

    for (const raw of stringList(prop(ref.node, 'derived_from'), 'derived_from', ref, findings)) {
      const finding = referenceFinding(ref, 'derived_from', raw, knownIds, true);
      if (finding) findings.push(finding);
    }
  }

  return { findings, dependencies };
}

function validateDependencyCycles(
  refs: DecisionNodeRef[],
  dependencies: Map<string, Set<string>>,
): DecisionFinding[] {
  const findings: DecisionFinding[] = [];
  const state = new Map<string, 'visiting' | 'visited'>();
  const stack: string[] = [];
  const refsById = new Map(refs.filter((ref) => ref.id).map((ref) => [ref.id!, ref]));
  const reported = new Set<string>();

  const visit = (id: string): void => {
    state.set(id, 'visiting');
    stack.push(id);
    for (const dependency of dependencies.get(id) ?? []) {
      if (!dependencies.has(dependency)) continue;
      if (state.get(dependency) === 'visiting') {
        const start = stack.indexOf(dependency);
        const cycle = [...stack.slice(start), dependency];
        const key = [...new Set(cycle)].sort().join('|');
        if (!reported.has(key)) {
          reported.add(key);
          const ref = refsById.get(id)!;
          findings.push(hierarchyFinding(
            ref.file,
            id,
            `decision dependency graph contains a cycle: ${cycle.join(' -> ')}`,
          ));
        }
      } else if (!state.has(dependency)) {
        visit(dependency);
      }
    }
    stack.pop();
    state.set(id, 'visited');
  };

  for (const id of [...dependencies.keys()].sort()) {
    if (!state.has(id)) visit(id);
  }
  return findings;
}

function validateXnlDecisionSourceSet(sources: DecisionSourceSpec[]): DecisionFinding[] {
  const findings: DecisionFinding[] = [];
  const refs: DecisionNodeRef[] = [];

  for (const source of sources) {
    let nodes: XnlNode[];
    try {
      const content = fs.readFileSync(source.file, 'utf-8');
      nodes = parseXnl(content, { textBlockStyle: true }).nodes;
    } catch (err) {
      const message = err instanceof XnlParseError ? err.message : String(err);
      findings.push({
        file: source.label,
        severity: 'error',
        decision: '(file)',
        layer: 'syntax',
        message: `invalid XNL: ${message}`,
      });
      continue;
    }

    const fileRefs: DecisionNodeRef[] = [];
    for (const node of nodes) {
      collectDecisionNodeRefs(node, source.label, fileRefs, findings);
    }
    refs.push(...fileRefs);
    findings.push(...validateXnlDecisionRecords(
      source.label,
      fileRefs.map((ref) => readXnlDecisionRecord(ref.node)),
    ));
  }

  const knownIds = new Set<string>();
  const owners = new Map<string, DecisionNodeRef>();
  for (const ref of refs) {
    if (!ref.id) {
      findings.push({
        file: ref.file,
        severity: 'error',
        decision: '<decision>',
        layer: 'schema',
        message: 'decision node is missing a stable id',
      });
      continue;
    }
    const existing = owners.get(ref.id);
    if (existing) {
      findings.push(hierarchyFinding(
        ref.file,
        ref.id,
        `Duplicate decision node id '${ref.id}' in '${ref.file}' and '${existing.file}'`,
      ));
    } else {
      owners.set(ref.id, ref);
      knownIds.add(ref.id);
    }
  }

  const referenceResult = validateDecisionReferences(refs, knownIds);
  findings.push(...referenceResult.findings);
  findings.push(...validateDependencyCycles(refs, referenceResult.dependencies));
  return findings;
}

function validateXnlDecisionsFile(file: string): DecisionFinding[] {
  return validateXnlDecisionSourceSet([{ file, label: file }]);
}

function splitDecisionSections(content: string): Array<{ title: string; body: string }> {
  const heading = /^###\s+(.+)$/gm;
  const matches = [...content.matchAll(heading)];
  if (matches.length === 0) return [{ title: '(document)', body: content }];

  return matches.map((m, i) => {
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : content.length;
    return { title: m[1].trim(), body: content.slice(start, end) };
  });
}

function field(section: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^-[ \\t]*${escaped}[ \\t]*[：:][ \\t]*(.*)$`, 'im');
  const match = section.match(re);
  return match?.[1]?.trim();
}

function statusOf(section: string): string | undefined {
  return field(section, '状态')?.toLowerCase() ?? field(section, 'Status')?.toLowerCase();
}

export function validateDecisionsFile(file: string): DecisionFinding[] {
  const findings: DecisionFinding[] = [];
  if (!fs.existsSync(file)) {
    findings.push({ file, severity: 'error', decision: '(file)', message: 'decisions file not found' });
    return findings;
  }

  if (fs.statSync(file).isDirectory()) {
    const sources = discoverXnlRegistryFiles(file).map((relFile) => ({
      file: path.join(file, ...relFile.split('/')),
      label: relFile,
    }));
    return validateXnlDecisionSourceSet(sources);
  }

  if (file.endsWith('.xnl')) {
    return validateXnlDecisionsFile(file);
  }

  const content = fs.readFileSync(file, 'utf-8');
  for (const section of splitDecisionSections(content)) {
    const status = statusOf(section.body);
    const blocks = field(section.body, 'Blocks');
    const durable = field(section.body, 'Durable candidate')?.toLowerCase();

    if (status === 'pending') {
      findings.push({
        file,
        severity: 'error',
        decision: section.title,
        message: 'decision is still pending',
      });
    }

    if (blocks && blocks !== '-' && blocks.toLowerCase() !== 'none' && status && !RESOLVED_DECISION_STATUS.has(status)) {
      findings.push({
        file,
        severity: status === 'pending' ? 'error' : 'warning',
        decision: section.title,
        message: `blocking decision has unresolved status '${status}'`,
      });
    }

    if (durable === 'yes') {
      for (const required of ['Evidence', 'Confidence', 'Reversibility']) {
        const value = field(section.body, required);
        if (!value || value === '-') {
          findings.push({
            file,
            severity: 'warning',
            decision: section.title,
            message: `durable candidate is missing ${required}`,
          });
        }
      }
    }
  }

  return findings;
}

interface ResolvedDecisionTarget {
  display: string;
  sources?: DecisionSourceSpec[];
  legacyFile?: string;
}

function portableJoin(...segments: string[]): string {
  return segments.join('/');
}

function registrySources(dir: string): DecisionSourceSpec[] {
  return discoverXnlRegistryFiles(dir).map((relFile) => ({
    file: path.join(dir, ...relFile.split('/')),
    label: relFile,
  }));
}

function processSources(dir: string): DecisionSourceSpec[] {
  const sources: DecisionSourceSpec[] = [];
  const root = path.join(dir, 'decisions.xnl');
  if (fs.existsSync(root)) {
    sources.push({ file: root, label: 'decisions.xnl' });
  }
  const nested = path.join(dir, 'decisions');
  for (const relFile of discoverXnlRegistryFiles(nested)) {
    sources.push({
      file: path.join(nested, ...relFile.split('/')),
      label: portableJoin('decisions', relFile),
    });
  }
  return sources;
}

function targetForProcessDir(dir: string): ResolvedDecisionTarget {
  const sources = processSources(dir);
  if (sources.length > 0) {
    const display = sources.length === 1 && sources[0].label === 'decisions.xnl'
      ? sources[0].file
      : dir;
    return { display, sources };
  }
  return { display: path.join(dir, 'decisions.md'), legacyFile: path.join(dir, 'decisions.md') };
}

function targetForDirectory(dir: string): ResolvedDecisionTarget {
  if (path.resolve(dir) === path.resolve(DECISIONS_DIR)) {
    return { display: dir, sources: registrySources(dir) };
  }
  if (
    fs.existsSync(path.join(dir, 'track.xml'))
    || fs.existsSync(path.join(dir, 'mission.xml'))
    || fs.existsSync(path.join(dir, 'decisions.xnl'))
    || fs.existsSync(path.join(dir, 'decisions'))
  ) {
    return targetForProcessDir(dir);
  }
  return { display: dir, sources: registrySources(dir) };
}

function resolveTarget(target: string | undefined): ResolvedDecisionTarget {
  if (!target) {
    return targetForProcessDir(process.cwd());
  }
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    return targetForDirectory(target);
  }
  if (target.endsWith('.md')) {
    return { display: target, legacyFile: target };
  }
  if (target.endsWith('.xnl')) {
    return { display: target, sources: [{ file: target, label: target }] };
  }
  if (target.includes(path.sep) || target.includes('/')) {
    return { display: target, legacyFile: target };
  }

  const processParents = [
    ACTIVE_TRACKS_DIR,
    PENDING_TRACKS_DIR,
    path.join('codument', 'missions', 'active'),
    path.join('codument', 'missions', 'pending'),
  ];
  for (const parent of processParents) {
    const processDir = path.join(parent, target);
    if (fs.existsSync(processDir) && fs.statSync(processDir).isDirectory()) {
      return targetForProcessDir(processDir);
    }
  }
  const fallback = path.join(ACTIVE_TRACKS_DIR, target, 'decisions.md');
  return { display: fallback, legacyFile: fallback };
}

function validateTarget(target: ResolvedDecisionTarget): DecisionFinding[] {
  if (target.sources) {
    return validateXnlDecisionSourceSet(target.sources);
  }
  return validateDecisionsFile(target.legacyFile!);
}

function report(findings: DecisionFinding[], file: string): void {
  if (findings.length === 0) {
    console.log(`✓ decisions validate: no issues in ${file}`);
    return;
  }

  console.log(`decisions validate: issues in ${file}:`);
  for (const f of findings) {
    const context = f.layer ? ` [${f.layer}; ${f.file}]` : ` [${f.file}]`;
    console.log(`  [${f.severity}] ${f.decision}: ${f.message}${context}`);
  }
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  console.log(`${errors} error(s), ${warnings} warning(s)`);
  if (errors > 0) process.exit(1);
}

export async function decisionsCommand(args: string[]) {
  const sub = args[0];
  const rest = args.slice(1);
  switch (sub) {
    case 'validate': {
      const { positional } = parseOptions(rest);
      const target = resolveTarget(positional[0]);
      report(validateTarget(target), target.display);
      return;
    }
    default:
      console.error(`Unknown decisions subcommand: ${sub ?? '(none)'}`);
      console.log('Usage: codument decisions validate [file|track-id]');
      process.exit(1);
  }
}
