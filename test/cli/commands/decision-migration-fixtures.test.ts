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
  '../../../src/templates/codument/std/actions/migrate.md',
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
  it('routes decisions and all through the bundled reference and authoritative action', () => {
    const skill = fs.readFileSync(MIGRATE_SKILL, 'utf-8');
    const action = fs.readFileSync(MIGRATE_ACTION, 'utf-8');

    expect(skill).toContain('[archive | specs | decisions | all]');
    expect(skill).toContain('references/decision-migration.md');
    expect(action).toContain('`archive` | `specs` | `decisions` | `all`');
    expect(action).toContain('what ∈ {decisions, all}');
    expect(action).toContain('references/decision-migration.md');
    expect(action).toContain('codument decisions validate');
    expect(action).toContain('migration manifest');
  });

  it('provides a near-top table of contents for every main protocol section', () => {
    const reference = fs.readFileSync(DECISION_MIGRATION_REFERENCE, 'utf-8');
    const tocStart = reference.indexOf('## 目录');
    const firstSectionStart = reference.indexOf('## 1. 不变量');

    expect(tocStart).toBeGreaterThan(0);
    expect(tocStart).toBeLessThan(firstSectionStart);
    for (const link of [
      '[1. 不变量](#1-不变量)',
      '[2. 建立迁移工作区](#2-建立迁移工作区)',
      '[3. Inventory 与分类](#3-inventory-与分类)',
      '[4. 从 archive 恢复完整 XNL](#4-从-archive-恢复完整-xnl)',
      '[5. Markdown-only 保真转换](#5-markdown-only-保真转换)',
      '[6. Issue 与 conflict 处理](#6-issue-与-conflict-处理)',
      '[7. Staging、验证与提交](#7-staging验证与提交)',
      '[8. Rollback](#8-rollback)',
      '[9. Verification 与迁移报告](#9-verification-与迁移报告)',
    ]) {
      expect(reference.slice(tocStart, firstSectionStart)).toContain(link);
    }
  });
});
