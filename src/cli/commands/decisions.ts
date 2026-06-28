import * as fs from 'fs';
import * as path from 'path';
import { parseOptions, TRACKS_DIR } from '../utils';

export interface DecisionFinding {
  severity: 'error' | 'warning';
  file: string;
  decision: string;
  message: string;
}

const RESOLVED_STATUS = new Set(['accepted', 'resolved', 'deferred']);

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

    if (blocks && blocks !== '-' && blocks.toLowerCase() !== 'none' && status && !RESOLVED_STATUS.has(status)) {
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
  if (!target) return path.join(process.cwd(), 'decisions.md');
  if (target.endsWith('.md') || target.includes(path.sep)) return target;
  return path.join(TRACKS_DIR, target, 'decisions.md');
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
