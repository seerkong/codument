import * as fs from 'fs';
import * as path from 'path';
import { parseXnl, wordToString, XnlParseError } from 'xnl-core';
import type { DataElementNode, TextElementNode, XnlNode, XnlWord } from 'xnl-core';
import { ACTIVE_TRACKS_DIR, PENDING_TRACKS_DIR, parseOptions } from '../utils';

export interface DecisionFinding {
  severity: 'error' | 'warning';
  file: string;
  decision: string;
  message: string;
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
  const fromWord = wordToString((node as { id?: XnlWord }).id);
  if (fromWord) return fromWord;
  const attrId = node.attributes?.id;
  if (typeof attrId === 'string') return attrId;
  const metaId = node.metadata?.id;
  if (typeof metaId === 'string') return metaId;
  if (metaId && typeof metaId === 'object' && (metaId as XnlWord).kind === 'Word') {
    return wordToString(metaId as XnlWord);
  }
  return undefined;
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

function validateXnlDecisionsFile(file: string): DecisionFinding[] {
  let records: XnlDecisionRecord[];
  try {
    records = readXnlDecisionRecords(file);
  } catch (err) {
    const message = err instanceof XnlParseError ? err.message : String(err);
    return [{ file, severity: 'error', decision: '(file)', message: `invalid XNL: ${message}` }];
  }

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

  return findings;
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

function resolveTarget(target: string | undefined): string {
  if (!target) {
    const xnl = path.join(process.cwd(), 'decisions.xnl');
    if (fs.existsSync(xnl)) return xnl;
    return path.join(process.cwd(), 'decisions.md');
  }
  if (target.endsWith('.md') || target.endsWith('.xnl') || target.includes(path.sep)) return target;
  for (const parent of [ACTIVE_TRACKS_DIR, PENDING_TRACKS_DIR]) {
    const trackDir = path.join(parent, target);
    const xnl = path.join(trackDir, 'decisions.xnl');
    if (fs.existsSync(xnl)) return xnl;
    const markdown = path.join(trackDir, 'decisions.md');
    if (fs.existsSync(markdown)) return markdown;
  }
  return path.join(ACTIVE_TRACKS_DIR, target, 'decisions.md');
}

function report(findings: DecisionFinding[], file: string): void {
  if (findings.length === 0) {
    console.log(`✓ decisions validate: no issues in ${file}`);
    return;
  }

  console.log(`decisions validate: issues in ${file}:`);
  for (const f of findings) {
    console.log(`  [${f.severity}] ${f.decision}: ${f.message}`);
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
      const file = resolveTarget(positional[0]);
      report(validateDecisionsFile(file), file);
      return;
    }
    default:
      console.error(`Unknown decisions subcommand: ${sub ?? '(none)'}`);
      console.log('Usage: codument decisions validate [file|track-id]');
      process.exit(1);
  }
}
