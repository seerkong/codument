import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');

function template(relativePath: string): string {
  return fs.readFileSync(
    path.join(ROOT, 'src', 'templates', 'codument', ...relativePath.split('/')),
    'utf-8',
  );
}

describe('decision registry authoring templates', () => {
  it('requires a full-fidelity recursive XNL registry and combined source discovery', () => {
    const registry = template('std/spec/decision-registry.md');
    const xnl = template('std/spec/xnl-format.md');
    const archive = template('std/actions/archive-track.md');

    expect(registry).toContain('根 `decisions.xnl`');
    expect(registry).toContain('递归 `decisions/**/*.xnl`');
    expect(registry).toContain('任何一类存在都不得压制另一类');
    expect(registry).toContain('archive、migration、serializer 和 merge 直接操作 XNL AST');
    expect(registry).toContain('nested decision hierarchy');
    expect(registry).toContain('`depends_on`、`activation`、`derived_from`');

    expect(xnl).toContain('两类来源同时存在时都必须参与');
    expect(xnl).toContain('不得先投影为摘要 DTO 或 `decision.md` 再重建');
    expect(archive).toContain('把完整 XNL AST 按 stable id 合并进 `codument/decisions/**/*.xnl`');
  });

  it('keeps decision identity independent of owner paths and excludes compatibility views', () => {
    const registry = template('std/spec/decision-registry.md');
    const knowledgeTiers = template('std/attractors/knowledge-tiers.md');
    const archiveCommand = template('std/commands/archive-track.md');

    expect(registry).toContain('decision identity 只由稳定 XNL `#id` 决定');
    expect(registry).toContain('canonical URI 为 `decision://<id>`');
    expect(registry).toContain('URI 不包含 archive 时间戳、bucket、owner file 或物理目录');
    expect(registry).toContain('建立全局 stable-id index');
    expect(registry).toContain('duplicate stable id');
    expect(registry).toContain('summary 和 legacy Markdown 不进入 index');

    expect(knowledgeTiers).toContain('物理 owner file 不是 identity');
    expect(knowledgeTiers).toContain('历史 `decision.md` 与 archive `summary.md`');
    expect(knowledgeTiers).toContain('不参与 merge、index 或真源冲突裁决');
    expect(archiveCommand).toContain('Archive summaries and legacy Markdown are not decision merge/index inputs');
  });

  it('authors new durable decisions as XNL and forbids canonical decision.md promotion', () => {
    const planTrack = template('std/actions/plan-track.md');
    const planMission = template('std/actions/plan-mission.md');
    const archive = template('std/actions/archive-track.md');
    const registry = template('std/spec/decision-registry.md');

    expect(planTrack).toContain('不要为新 track 创建');
    expect(planTrack).toContain('而不是生成 canonical `decision.md`');
    expect(planMission).toContain('根 `decisions.xnl` 无条件创建');
    expect(registry).toContain('新 durable decision 必须以完整 XNL AST 持久化');
    expect(archive).toContain('legacy Markdown 不参与 canonical decision merge');

    for (const content of [planTrack, planMission, archive, registry]) {
      expect(content).not.toContain(
        '把 durable 决策提升到 codument/decisions/YYYY-MM/YYYY-MM-DD-HHmm-slug/decision.md',
      );
      expect(content).not.toContain(
        '提升到 codument/decisions/YYYY-MM/YYYY-MM-DD-HHmm-slug/decision.md',
      );
    }
  });
});
