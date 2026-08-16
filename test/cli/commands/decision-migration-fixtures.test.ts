import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import {
  countArchiveDecisionMatches,
  countTargetDecisionMatches,
  findArchiveDirectories,
  loadDecisionMigrationFixtures,
} from './decision-migration-fixtures';

const DECISION_MIGRATION_REFERENCE = path.resolve(
  __dirname,
  '../../../src/templates/skills/codument-migrate/references/decision-migration.md',
);
const MIGRATE_SKILL = path.resolve(
  __dirname,
  '../../../src/templates/skills/codument-migrate/SKILL.md',
);
const MIGRATE_ACTION = path.resolve(
  __dirname,
  '../../../src/templates/codument/std/operations/migrate.md',
);

describe('decision migration inventory fixtures', () => {
  const fixtures = loadDecisionMigrationFixtures();

  it('covers every migration inventory classification', () => {
    expect(fixtures.map(fixture => fixture.expected.classification).sort()).toEqual([
      'ambiguous-id',
      'archive-recoverable',
      'markdown-only',
      'missing-source',
      'target-conflict',
    ]);
  });

  for (const fixture of fixtures) {
    it(`${fixture.name} has an internally consistent inventory`, () => {
      expect(fixture.expected.name).toBe(fixture.name);

      const legacyFile = path.join(
        fixture.workspace,
        ...fixture.expected.legacyRelativePath.split('/'),
      );
      const legacy = fs.readFileSync(legacyFile, 'utf-8');
      expect(legacy).toContain(`Decision URI: decision://${fixture.expected.decisionId}`);
      for (const sentinel of fixture.expected.requiredLegacySentinels) {
        expect(legacy).toContain(sentinel);
      }

      if (fixture.expected.archiveId) {
        expect(legacy).toContain(`Source: archive://${fixture.expected.archiveId}`);
        for (const archiveDir of findArchiveDirectories(
          fixture.workspace,
          fixture.expected.archiveId,
        )) {
          const archiveSource = fs
            .readdirSync(archiveDir, { recursive: true, withFileTypes: true })
            .filter(entry => entry.isFile() && entry.name.endsWith('.xnl'))
            .map(entry => fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf-8'))
            .join('\n');
          for (const sentinel of fixture.expected.requiredArchiveSentinels ?? []) {
            expect(archiveSource).toContain(sentinel);
          }
        }
      } else {
        expect(legacy).not.toContain('Source: archive://');
      }

      expect(countArchiveDecisionMatches(fixture)).toBe(
        fixture.expected.archiveSourceMatches,
      );
      expect(countTargetDecisionMatches(fixture)).toBe(fixture.expected.targetMatches);
    });
  }
});

describe('decision migration reference', () => {
  it('routes unified resource upgrades and Decision review through the bundled reference', () => {
    const skill = fs.readFileSync(MIGRATE_SKILL, 'utf-8');
    const operation = fs.readFileSync(MIGRATE_ACTION, 'utf-8');

    expect(skill).toContain('codument upgrade-resource <path> --json');
    expect(skill).toContain('references/decision-migration.md');
    expect(operation).toContain('调用没有参数时升级整个 workspace');
    expect(operation).toContain('codument upgrade-workspace --json');
    expect(operation).toContain('codument upgrade-resource <path> --json');
    expect(operation).toContain('`review-required`');
    expect(operation).toContain('Decision 保留 forest、嵌套 tree、options、answer feedback');
    expect(operation).toContain('migration manifest');
  });

  it('keeps AI review focused on semantics after the CLI-owned transaction', () => {
    const reference = fs.readFileSync(DECISION_MIGRATION_REFERENCE, 'utf-8');

    expect(reference).toContain('## 修正原则');
    expect(reference).toContain('## 循环');
    expect(reference).toContain('不改 CLI-owned backup/manifest');
    expect(reference).toContain('codument decisions create <file> <decision-id>');
    expect(reference).not.toContain('## Staging');
    expect(reference).not.toContain('## Rollback');
  });
});
