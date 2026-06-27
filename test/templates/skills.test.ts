import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { TEMPLATE_FILES } from '../../src/templates/manifest';

const ROOT = path.resolve(__dirname, '..', '..');

describe('codument E2E and quality skill templates', () => {
  it('ships the modeling+engineering E2E and code quality skills in the template manifest', () => {
    const paths = new Set(TEMPLATE_FILES.map((f) => f.path));
    expect(paths.has('skills/codument-modeling-engineering-e2e/SKILL.md')).toBe(true);
    expect(paths.has('skills/codument-code-quality-score/SKILL.md')).toBe(true);
  });

  it('uses valid minimal skill frontmatter and names', () => {
    for (const skill of ['codument-modeling-engineering-e2e', 'codument-code-quality-score']) {
      const file = path.join(ROOT, 'src', 'templates', 'skills', skill, 'SKILL.md');
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).toStartWith('---\n');
      expect(content).toContain(`name: ${skill}`);
      expect(content).toMatch(/description: .+/);
      expect(content).toContain('# Codument');
    }
  });
});
