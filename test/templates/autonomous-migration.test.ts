import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(import.meta.dir, '../..');
const skill = fs.readFileSync(
  path.join(root, 'src/templates/skills/codument-migrate/SKILL.md'),
  'utf8',
);
const operation = fs.readFileSync(
  path.join(root, 'src/templates/codument/std/operations/migrate.md'),
  'utf8',
);
const decisionReference = fs.readFileSync(
  path.join(root, 'src/templates/skills/codument-migrate/references/decision-migration.md'),
  'utf8',
);

describe('autonomous codument migration skill', () => {
  it('routes a no-argument invocation to full workspace convergence', () => {
    expect(skill).toContain('无参数时完成整个 workspace');
    expect(operation).toContain('`{{args}}` 为空：进入 **workspace 模式**');
    expect(operation).toContain('codument upgrade-workspace --json');
    expect(operation).toContain('重新打开升级后的 `codument/std/operations/migrate.md`');
    expect(operation).toContain('完成一项后继续下一项');
    expect(operation).toContain('把 validate error 视为当前版本资源的语义 review 项');
    expect(operation).toContain('再运行一次 `codument upgrade-workspace --json`');
  });

  it('keeps one resource path as the low-blast-radius mode', () => {
    expect(skill).toContain('传入路径时只升级该资源');
    expect(operation).toContain('`{{args}}` 是一个文件路径：进入 **resource 模式**');
    expect(operation).toContain('codument upgrade-resource <path> --json');
  });

  it('performs semantic review in the current agent without agent relaunch flags', () => {
    expect(operation).toContain('当前 Coding Agent 就是 review 执行者');
    expect(operation).toContain('reviewRequired');
    expect(operation).toContain('semanticReviewRecommended');
    expect(operation).toContain('cleanup.trackDirectoryConflicts');
    expect(operation).not.toMatch(/codument upgrade-workspace[^\n]*--agent/);
  });

  it('requires full validation and a stable final inventory before completion', () => {
    expect(operation).toContain('codument validate --strict');
    expect(operation).toContain('codument modeling validate codument/modeling');
    expect(operation).toContain('codument engineering validate codument/engineering');
    expect(operation).toContain('codument decisions validate codument/decisions');
    expect(operation).toContain('git diff --check');
    expect(operation).toContain('除此之外持续执行');
  });

  it('lets AI-only Decision conversion retire the backed-up Markdown authority', () => {
    expect(decisionReference).toContain('退役已备份的 Markdown authority');
    expect(decisionReference).toContain('codument upgrade-resource <target> --json');
    expect(decisionReference).toContain('workspace 复扫无遗留');
  });
});
