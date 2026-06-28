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

describe('codument skill templates', () => {
  it('ships expected codument skills in the template manifest', () => {
    const paths = new Set(TEMPLATE_FILES.map((f) => f.path));
    for (const skill of SKILLS) {
      expect(paths.has(`skills/${skill}/SKILL.md`)).toBe(true);
    }
  });

  it('uses valid minimal skill frontmatter and names', () => {
    for (const skill of SKILLS) {
      const file = path.join(ROOT, 'src', 'templates', 'skills', skill, 'SKILL.md');
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).toStartWith('---\n');
      expect(content).toContain(`name: ${skill}`);
      expect(content).toMatch(/description: .+/);
      expect(content).toContain('# Codument');
    }
  });
});
