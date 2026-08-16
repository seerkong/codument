import * as fs from 'fs';
import * as path from 'path';
import { loadEngineeringRegistry, isDataElement, readNodeId } from './registry';

/**
 * Fractal-split lint: flag oversized engineering XNL files as candidates for
 * same-name-folder split (multi-file). Heuristic, advisory — the actual split is
 * applied by the model per folder-manifest.md. Thresholds are configurable
 * (defaults below; overridable via codument/config/engineering.xnl in P4).
 */

export interface LintThresholds {
  /** Max lines before a file is a split candidate. */
  maxLines: number;
  /** Max top-level engineering nodes before a file is a split candidate. */
  maxNodes: number;
}

export const DEFAULT_THRESHOLDS: LintThresholds = {
  maxLines: 400,
  maxNodes: 8,
};

export interface LintFinding {
  file: string;
  lines: number;
  nodeCount: number;
  reasons: string[];
}

/** Lint a engineering registry directory for fractal-split candidates. */
export function lintEngineeringRegistry(
  dir: string,
  thresholds: LintThresholds = DEFAULT_THRESHOLDS,
): LintFinding[] {
  const findings: LintFinding[] = [];
  if (!fs.existsSync(dir)) return findings;
  const registry = loadEngineeringRegistry(dir);

  for (const [relFile, nodes] of registry.files) {
    const content = fs.readFileSync(path.join(dir, relFile), 'utf-8');
    const lines = content.split('\n').length;
    const nodeCount = nodes.filter((n) => isDataElement(n) && readNodeId(n)).length;

    const reasons: string[] = [];
    if (lines > thresholds.maxLines) {
      reasons.push(`${lines} lines > ${thresholds.maxLines}`);
    }
    if (nodeCount > thresholds.maxNodes) {
      reasons.push(`${nodeCount} nodes > ${thresholds.maxNodes}`);
    }
    if (reasons.length > 0) {
      findings.push({ file: relFile, lines, nodeCount, reasons });
    }
  }

  return findings.sort((a, b) => a.file.localeCompare(b.file));
}
