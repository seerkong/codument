import * as fs from 'fs';
import * as path from 'path';
import { parseOptions } from '../utils';

interface StdLintFinding {
  file: string;
  line: number;
  rule: string;
  message: string;
}

const RULES: Array<{ rule: string; pattern: RegExp; message: string }> = [
  { rule: 'std.legacy.actions-path', pattern: /std\/actions/, message: 'current skill and operation routes must use std/operations' },
  { rule: 'std.legacy.cdt-authoring', pattern: /\bcdt:/, message: 'current XNL authoring uses unprefixed nodes' },
  { rule: 'std.legacy.hyphenated-xnl-field', pattern: /\b(?:child-mode|verify-round|max-rounds|on-exhausted|project-ref)\b/, message: 'current XNL fields use snake_case names' },
  { rule: 'std.legacy.xml-node-authoring', pattern: /<(?:Task\s+(?:id|status)=|TrackLink\s+(?:id|state)=)/, message: 'current resource nodes use Halfcode XNL ids and attribute blocks' },
  { rule: 'std.legacy.workflow-xnl', pattern: /<Hook\s+on>|status-in-XML|<Needs>/, message: 'current Track authoring uses XNL attribute blocks and Schedule Node/After edges' },
  { rule: 'std.legacy.metadata-wrapper', pattern: /Metadata\.Status|<Metadata><GapRound>/, message: 'current XNL state belongs in root attributes' },
  { rule: 'std.legacy.behavior-sections', pattern: /ADDED vs MODIFIED|RENAMED（/, message: 'current BehaviorPatch authoring uses Upsert/Delete/Move mutations' },
  { rule: 'std.legacy.behavior-xml', pattern: /behavior delta 继续使用 XML/, message: 'current BehaviorPatch authoring uses XNL' },
  { rule: 'std.manual-write-fallback', pattern: /兼容 fallback|手工归档流程|清单做兼容校验/, message: 'mutating operations must block when their CLI authority is unavailable' },
  { rule: 'std.manual-authority-move', pattern: /Move an approved track|直接移动.{0,30}tracks\/active/, message: 'Track authority movement must use codument track transition' },
  { rule: 'std.manual-system-field-write', pattern: /更新根属性.{0,20}updated_at|gap_round.{0,20}(?:父层|AI).{0,12}写入/, message: 'CLI lifecycle commands own Track timestamps and gap_round' },
  { rule: 'std.manual-lifecycle-write', pattern: /(?:任务|Task).{0,12}(?:回置|置为|改为|标记为|写为|=)\s*(?:ACTIVE|DONE|FAILED|REFUSED|SKIPPED|BLOCKED)|(?:回写|直接写).{0,8}(?:各\s*)?(?:Task|任务).{0,8}status/i, message: 'Track task lifecycle changes must use codument track task transition' },
  { rule: 'std.hardcoded-decision-version', pattern: /每个顶层 decision 使用.*apiVersion|每个顶层.*写.*apiVersion/, message: 'Decision versions come from the current Kind registry and validator' },
];

export function stdLintCommand(args: string[]): void {
  const { positional, options } = parseOptions(args);
  const root = path.resolve(positional[0] ?? path.join('src', 'templates', 'codument', 'std'));
  if (positional.length > 1) throw new Error('Usage: codument std lint [dir] [--json]');
  if (!fs.existsSync(root)) throw new Error(`std directory does not exist: ${root}`);
  const findings: StdLintFinding[] = [];
  for (const file of markdownFiles(root)) {
    const relative = path.relative(root, file);
    if (isExcludedDocumentation(relative)) continue;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      for (const rule of RULES) {
        if (rule.pattern.test(lines[index])) findings.push({
          file: relative,
          line: index + 1,
          rule: rule.rule,
          message: rule.message,
        });
      }
    }
  }
  if (options.json === true) console.log(JSON.stringify(findings, null, 2));
  else if (findings.length === 0) console.log(`✓ std lint: no issues in ${root}`);
  else for (const finding of findings) console.log(`${finding.file}:${finding.line} [${finding.rule}] ${finding.message}`);
  if (findings.length > 0) process.exitCode = 1;
}

function isExcludedDocumentation(relative: string): boolean {
  const segments = relative.split(path.sep);
  if (segments.includes('compat') || segments.includes('spec')) return true;
  return relative.endsWith(path.join('std', 'operations', 'migrate.md'))
    || relative === path.join('operations', 'migrate.md');
}

function markdownFiles(root: string): string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const candidate = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(candidate);
      else if (entry.isFile() && entry.name.endsWith('.md')) out.push(candidate);
    }
  };
  visit(root);
  return out.sort();
}
