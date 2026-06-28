import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { TEMPLATE_FILES } from '../../src/templates/manifest';

const ROOT = path.resolve(__dirname, '..', '..');

const SKILLS = [
  'codument-modeling-engineering-e2e',
  'codument-code-quality-score',
  'codument-decision-tree',
];

const DEPRECATED_SKILLS = [
  'codument-execute-wave',
  'codument-init',
  'codument-plan-schedule',
  'codument-plan-wave',
  'codument-status',
];

const NON_OPERATION_SKILLS = new Set([
  'codument-code-quality-score',
  'codument-decision-tree',
  'codument-modeling-engineering-e2e',
]);

const OPERATION_EXCLUDES = new Set(['README.md', '_operation-spec.md']);

function operationNames(): Set<string> {
  const dir = path.join(ROOT, 'codument', 'std', 'operations');
  return new Set(fs.readdirSync(dir)
    .filter((file) => file.endsWith('.md') && !OPERATION_EXCLUDES.has(file))
    .map((file) => file.replace(/\.md$/, '')));
}

function skillNames(): string[] {
  const dir = path.join(ROOT, 'src', 'templates', 'skills');
  return fs.readdirSync(dir)
    .filter((name) => fs.existsSync(path.join(dir, name, 'SKILL.md')))
    .sort();
}

function operationRefs(content: string): string[] {
  return [...content.matchAll(/@\/codument\/std\/operations\/([A-Za-z0-9_-]+)\.md/g)]
    .map((match) => match[1]);
}

describe('codument skill templates', () => {
  it('ships expected codument skills in the template manifest', () => {
    const paths = new Set(TEMPLATE_FILES.map((f) => f.path));
    for (const skill of SKILLS) {
      expect(paths.has(`skills/${skill}/SKILL.md`)).toBe(true);
    }
  });

  it('uses valid minimal skill frontmatter and names', () => {
    for (const skill of skillNames()) {
      const file = path.join(ROOT, 'src', 'templates', 'skills', skill, 'SKILL.md');
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).toStartWith('---\n');
      expect(content).toContain(`name: ${skill}`);
      expect(content).toMatch(/description: .+/);
      expect(content).toContain('# Codument');
    }
  });

  it('does not ship deprecated codument operation skills', () => {
    const paths = new Set(TEMPLATE_FILES.map((f) => f.path));
    for (const skill of DEPRECATED_SKILLS) {
      expect(paths.has(`skills/${skill}/SKILL.md`)).toBe(false);
      expect(fs.existsSync(path.join(ROOT, 'src', 'templates', 'skills', skill, 'SKILL.md'))).toBe(false);
    }
  });

  it('maps every operation body to at least one skill shell, with no dangling operation refs', () => {
    const operations = operationNames();
    const covered = new Map<string, string[]>();
    for (const operation of operations) {
      covered.set(operation, []);
    }

    for (const skill of skillNames()) {
      if (NON_OPERATION_SKILLS.has(skill)) {
        continue;
      }

      const file = path.join(ROOT, 'src', 'templates', 'skills', skill, 'SKILL.md');
      const refs = operationRefs(fs.readFileSync(file, 'utf-8'));
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) {
        expect(operations.has(ref)).toBe(true);
        covered.get(ref)?.push(skill);
      }
    }

    for (const [operation, skills] of covered) {
      expect(skills, `${operation} has no skill shell`).not.toHaveLength(0);
    }
  });

  it('keeps codument-discuss conversation-first instead of fixed report generation', () => {
    const operation = fs.readFileSync(
      path.join(ROOT, 'src', 'templates', 'codument', 'std', 'operations', 'discuss.md'),
      'utf-8'
    );
    const skill = fs.readFileSync(
      path.join(ROOT, 'src', 'templates', 'skills', 'codument-discuss', 'SKILL.md'),
      'utf-8'
    );

    expect(operation).toContain('这是一次**对话**');
    expect(operation).toContain('必须与用户进行讨论、提问、确认或澄清');
    expect(operation).toContain('findings.md');
    expect(operation).toContain('knowledge.md');
    expect(operation).not.toContain('`context.md`：');
    expect(operation).not.toContain('`decision-tree.md`：');
    expect(operation).not.toContain('`recommendation.md`：');
    expect(operation).not.toContain('analysis_files:');

    expect(skill).toContain('人机讨论入口');
    expect(skill).toContain('与用户对话澄清');
    expect(skill).not.toContain('使用 `codument/analysis/` 作为临时 scratch');
  });
});
