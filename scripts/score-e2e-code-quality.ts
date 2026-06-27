#!/usr/bin/env bun
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

interface CheckResult {
  name: string;
  command: string;
  exitCode: number | null;
  passed: boolean;
  skipped?: boolean;
  output: string;
}

interface Dimension {
  name: string;
  score: number;
  max: number;
  evidence: string[];
  issues: string[];
}

interface Report {
  workspace: string;
  track?: string;
  totalScore: number;
  maxScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  dimensions: Dimension[];
  checks: CheckResult[];
  generatedAt: string;
}

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const options: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      i++;
    } else {
      options[key] = true;
    }
  }
  return { positional, options };
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function run(cwd: string, name: string, command: string, args: string[], skipped = false): CheckResult {
  if (skipped) {
    return { name, command: [command, ...args].join(' '), exitCode: null, passed: false, skipped: true, output: 'skipped' };
  }
  const proc = spawnSync(command, args, { cwd, encoding: 'utf-8', timeout: 120_000 });
  const output = `${proc.stdout ?? ''}${proc.stderr ?? ''}`.trim();
  return {
    name,
    command: [command, ...args].join(' '),
    exitCode: proc.status,
    passed: proc.status === 0,
    output: output.slice(0, 6000),
  };
}

function hasFile(root: string, names: string[]): boolean {
  return names.some((name) => fs.existsSync(path.join(root, name)));
}

function listFiles(root: string, pred: (rel: string) => boolean): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.next')) continue;
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs).split(path.sep).join('/');
      if (entry.isDirectory()) visit(abs);
      else if (entry.isFile() && pred(rel)) out.push(rel);
    }
  };
  visit(root);
  return out.sort();
}

function detectTrack(workspace: string, explicit?: string): string | undefined {
  if (explicit) return explicit;
  const dir = path.join(workspace, 'codument', 'tracks');
  if (!fs.existsSync(dir)) return undefined;
  return fs.readdirSync(dir).find((name) => fs.existsSync(path.join(dir, name, 'track.xml')));
}

function packageScripts(workspace: string): Record<string, string> {
  const pkgPath = path.join(workspace, 'package.json');
  if (!fs.existsSync(pkgPath)) return {};
  const pkg = readJson(pkgPath) as { scripts?: Record<string, string> };
  return pkg.scripts ?? {};
}

function grade(score: number): Report['grade'] {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function dim(name: string, max: number, score: number, evidence: string[], issues: string[]): Dimension {
  return { name, max, score: Math.max(0, Math.min(max, score)), evidence, issues };
}

function writeMarkdown(report: Report, file: string): void {
  const lines = [
    `# Code Quality Report`,
    '',
    `Workspace: ${report.workspace}`,
    report.track ? `Track: ${report.track}` : undefined,
    `Score: ${report.totalScore}/${report.maxScore} (${report.grade})`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Dimensions',
    '',
    '| Dimension | Score | Evidence | Issues |',
    '|---|---:|---|---|',
    ...report.dimensions.map((d) => `| ${d.name} | ${d.score}/${d.max} | ${d.evidence.join('<br>') || '-'} | ${d.issues.join('<br>') || '-'} |`),
    '',
    '## Checks',
    '',
    '| Check | Result | Command |',
    '|---|---|---|',
    ...report.checks.map((c) => `| ${c.name} | ${c.skipped ? 'SKIPPED' : c.passed ? 'PASS' : 'FAIL'} | \`${c.command}\` |`),
    '',
  ].filter((line): line is string => line !== undefined);
  fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf-8');
}

const { positional, options } = parseArgs(process.argv.slice(2));
const workspace = path.resolve(positional[0] ?? process.cwd());
const outDir = path.resolve(String(options.out ?? path.join(workspace, 'reports')));
const track = detectTrack(workspace, typeof options.track === 'string' ? options.track : undefined);
const cli = String(options.codument ?? path.join(import.meta.dir, '..', 'src', 'cli', 'index.ts'));
const scripts = packageScripts(workspace);
const hasPackage = fs.existsSync(path.join(workspace, 'package.json'));
const hasBunLock = hasFile(workspace, ['bun.lock', 'bun.lockb']);
const runner = hasBunLock || fs.existsSync(path.join(workspace, 'bunfig.toml')) ? 'bun' : hasPackage ? 'npm' : '';
const runScript = (name: string) => runner === 'bun'
  ? run(workspace, name, 'bun', ['run', name], !scripts[name])
  : run(workspace, name, 'npm', ['run', name, '--silent'], !scripts[name] || !runner);

const checks: CheckResult[] = [];
checks.push(runScript('test'));
checks.push(runScript('typecheck'));
checks.push(runScript('lint'));
checks.push(runScript('build'));
if (track) {
  checks.push(run(workspace, 'codument validate', 'bun', ['run', cli, 'validate', track, '--strict']));
  checks.push(run(workspace, 'modeling validate', 'bun', ['run', cli, 'modeling', 'validate', '--deltas', track]));
  checks.push(run(workspace, 'engineering validate', 'bun', ['run', cli, 'engineering', 'validate', '--deltas', track]));
}

const srcFiles = listFiles(workspace, (rel) => /\.(ts|tsx|js|jsx|vue|svelte|py|go|rs)$/.test(rel) && !rel.startsWith('codument/'));
const testFiles = listFiles(workspace, (rel) => /(^|\/)(test|tests|__tests__)\/|\.test\.|\.spec\./.test(rel));
const modelingFiles = track ? listFiles(path.join(workspace, 'codument', 'tracks', track, 'modeling_deltas'), (rel) => rel.endsWith('.xnl')) : [];
const engineeringFiles = track ? listFiles(path.join(workspace, 'codument', 'tracks', track, 'engineering_deltas'), (rel) => rel.endsWith('.xnl')) : [];

const runnableScore = 10
  + (checks.find((c) => c.name === 'build')?.passed ? 5 : 0)
  + (checks.find((c) => c.name === 'codument validate')?.passed ? 5 : 0);
const testsScore = (testFiles.length > 0 ? 8 : 0)
  + (checks.find((c) => c.name === 'test')?.passed ? 10 : 0)
  + (checks.find((c) => c.name === 'typecheck')?.passed ? 2 : 0);
const architectureScore = (srcFiles.length > 0 ? 6 : 0)
  + (modelingFiles.length > 0 ? 7 : 0)
  + (engineeringFiles.length > 0 ? 7 : 0);
const codumentScore = (track ? 6 : 0)
  + (checks.find((c) => c.name === 'modeling validate')?.passed ? 7 : 0)
  + (checks.find((c) => c.name === 'engineering validate')?.passed ? 7 : 0);
const maintainabilityScore = Math.min(10, 3 + Math.min(3, Math.floor(srcFiles.length / 2)) + (checks.find((c) => c.name === 'lint')?.passed ? 4 : 0));
const safetyScore = 5
  + (srcFiles.some((f) => /auth|permission|validation|schema|policy|guard/i.test(f)) ? 3 : 0)
  + (engineeringFiles.some((f) => /rules|runbooks|troubleshooting|reference/.test(f)) ? 2 : 0);

const dimensions = [
  dim('Runnable behavior', 20, runnableScore, [
    hasPackage ? 'package.json present' : 'no package.json',
    checks.find((c) => c.name === 'build')?.passed ? 'build passes' : 'build missing/fails',
  ], runnableScore < 16 ? ['Need stronger runnable/build evidence'] : []),
  dim('Tests and type safety', 20, testsScore, [
    `${testFiles.length} test file(s)`,
    checks.find((c) => c.name === 'test')?.passed ? 'tests pass' : 'tests missing/fail',
    checks.find((c) => c.name === 'typecheck')?.passed ? 'typecheck passes' : 'typecheck missing/fails',
  ], testsScore < 14 ? ['Need tests and typecheck evidence'] : []),
  dim('Architecture fit', 20, architectureScore, [
    `${srcFiles.length} source file(s)`,
    `${modelingFiles.length} modeling delta file(s)`,
    `${engineeringFiles.length} engineering delta file(s)`,
  ], architectureScore < 14 ? ['Need clearer source/modeling/engineering alignment'] : []),
  dim('Codument alignment', 20, codumentScore, [
    track ? `track ${track}` : 'no active track found',
    checks.find((c) => c.name === 'modeling validate')?.passed ? 'modeling validate passes' : 'modeling validate missing/fails',
    checks.find((c) => c.name === 'engineering validate')?.passed ? 'engineering validate passes' : 'engineering validate missing/fails',
  ], codumentScore < 14 ? ['Need valid codument track and registry deltas'] : []),
  dim('Maintainability', 10, maintainabilityScore, [
    checks.find((c) => c.name === 'lint')?.passed ? 'lint passes' : 'lint missing/fails',
    `${srcFiles.length} source file(s)`,
  ], maintainabilityScore < 10 ? ['Need lint and clearer module organization'] : []),
  dim('Safety and data boundaries', 10, safetyScore, [
    srcFiles.some((f) => /auth|permission|validation|schema|policy|guard/i.test(f)) ? 'validation/security-like files present' : 'no obvious validation/security files',
    engineeringFiles.some((f) => /rules|runbooks|troubleshooting|reference/.test(f)) ? 'engineering operational knowledge present' : 'limited engineering operational knowledge',
  ], safetyScore < 10 ? ['Need explicit validation/security/data-boundary evidence'] : []),
];

const totalScore = dimensions.reduce((sum, d) => sum + d.score, 0);
const maxScore = dimensions.reduce((sum, d) => sum + d.max, 0);
const report: Report = {
  workspace,
  track,
  totalScore,
  maxScore,
  grade: grade(totalScore),
  dimensions,
  checks,
  generatedAt: new Date().toISOString(),
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'code-quality.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
writeMarkdown(report, path.join(outDir, 'code-quality.md'));
console.log(`Code quality score: ${report.totalScore}/${report.maxScore} (${report.grade})`);
console.log(`Reports: ${path.join(outDir, 'code-quality.json')} ${path.join(outDir, 'code-quality.md')}`);
