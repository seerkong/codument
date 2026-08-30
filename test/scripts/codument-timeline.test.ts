import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runTimeline } from '../../scripts/codument-timeline';

function write(root: string, relative: string, content: string): void {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

describe('codument timeline', () => {
  it('uses Git roots as boundaries and normalizes current and legacy resource metadata', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-timeline-home-'));
    const out = path.join(home, 'timeline');

    fs.mkdirSync(path.join(home, 'repo-a', '.git'), { recursive: true });
    write(home, 'repo-a/codument/tracks/active/current/track.xnl', `<Track #current apiVersion="codument.tech/v1alpha1" {
  created_at = "2026-01-03T08:00:00+08:00"
  updated_at = "2026-01-04T09:00:00+08:00"
}>
`);
    write(home, 'repo-a/codument/missions/pending/roadmap/mission.xml', `<Mission id="roadmap"><Metadata>
  <CreatedAt>2026-01-05T00:00:00Z</CreatedAt><UpdatedAt>2026-01-07T00:00:00Z</UpdatedAt>
</Metadata></Mission>`);
    write(home, 'repo-a/codument/tracks/legacy-plan/plan.xml', `<plan><metadata>
  <track_id>legacy-plan</track_id><created_at>2025-12-30</created_at><updated_at>2026-01-02</updated_at>
</metadata></plan>`);
    write(home, 'repo-a/codument/archive/archived-plan/plan.xml', '<plan><metadata><track_id>archived-plan</track_id></metadata></plan>');
    write(home, 'repo-a/codument/archive/archived-plan/metadata.json', JSON.stringify({
      createdAt: '2025-12-01T00:00:00Z', updatedAt: '2025-12-02T00:00:00Z',
    }));

    // Discovery must stop at repo-a rather than counting a nested repository.
    fs.mkdirSync(path.join(home, 'repo-a', 'nested', '.git'), { recursive: true });
    write(home, 'repo-a/nested/codument/tracks/active/ignored/track.xnl', '<Track #ignored { created_at = "2026-01-01T00:00:00Z" }>');

    // A worktree uses a .git file rather than a directory.
    write(home, 'repo-b/.git', 'gitdir: /tmp/worktree-gitdir\n');
    write(home, 'repo-b/codument/missions/active/xml-mission/mission.xml', `<Mission id="xml-mission"><Metadata>
      <CreatedAt>2026-02-01T00:00:00Z</CreatedAt><UpdatedAt>2026-02-03T00:00:00Z</UpdatedAt>
    </Metadata></Mission>`);
    write(home, 'repo-b/codument/tracks/active/legacy-xml/track.xml', `<Track id="legacy-xml"><Metadata>
      <CreatedAt>2026-01-11T00:00:00Z</CreatedAt><UpdatedAt>2026-01-12T00:00:00Z</UpdatedAt>
    </Metadata></Track>`);
    write(home, 'repo-b/codument/tracks/tasks-format/tasks.xml', `<tasks><metadata>
      <track_id>tasks-format</track_id><created_at>2026-01-13T00:00:00Z</created_at><updated_at>2026-01-14T00:00:00Z</updated_at>
    </metadata></tasks>`);
    write(home, 'repo-b/codument/missions/archived/current-mission/mission.xnl', `<Mission #current-mission {
      created_at = "2026-02-04T00:00:00Z" updated_at = "2026-02-05T00:00:00Z"
    }>`);

    const report = runTimeline({ home, outputDir: out, groupBy: 'week' });

    expect(report.repositories).toHaveLength(2);
    expect(report.resources).toHaveLength(8);
    expect(report.resources.map((resource) => resource.id).sort()).toEqual([
      'archived-plan', 'current', 'current-mission', 'legacy-plan', 'legacy-xml', 'roadmap', 'tasks-format', 'xml-mission',
    ]);
    expect(report.resources.find((resource) => resource.id === 'current')).toMatchObject({
      kind: 'track', format: 'xnl', lifecycle: 'active',
      createdAt: '2026-01-03T00:00:00.000Z', updatedAt: '2026-01-04T01:00:00.000Z',
    });
    expect(report.resources.find((resource) => resource.id === 'legacy-plan')).toMatchObject({
      kind: 'track', format: 'plan-xml', lifecycle: 'active',
      createdAt: '2025-12-30T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
    });
    expect(report.resources.find((resource) => resource.id === 'archived-plan')).toMatchObject({
      lifecycle: 'archived', format: 'plan-xml',
      createdAt: '2025-12-01T00:00:00.000Z', updatedAt: '2025-12-02T00:00:00.000Z',
    });
    expect(report.resources.find((resource) => resource.id === 'legacy-xml')).toMatchObject({
      kind: 'track', format: 'xml', lifecycle: 'active',
      createdAt: '2026-01-11T00:00:00.000Z', updatedAt: '2026-01-12T00:00:00.000Z',
    });
    expect(report.resources.find((resource) => resource.id === 'tasks-format')).toMatchObject({
      kind: 'track', format: 'tasks-xml', lifecycle: 'active',
    });
    expect(report.resources.find((resource) => resource.id === 'current-mission')).toMatchObject({
      kind: 'mission', format: 'xnl', lifecycle: 'archived',
    });
    expect(report.resources.some((resource) => resource.id === 'ignored')).toBe(false);

    expect(report.timeline.buckets.some((bucket) => bucket.track.created === 2)).toBe(true);
    expect(report.timeline.buckets.reduce((total, bucket) => total + bucket.mission.updated, 0)).toBe(3);
    expect(fs.existsSync(path.join(out, 'resources.json'))).toBe(true);
    expect(fs.existsSync(path.join(out, 'resources.csv'))).toBe(true);
    expect(fs.existsSync(path.join(out, 'timeline.json'))).toBe(true);
    expect(fs.readFileSync(path.join(out, 'timeline.html'), 'utf8')).toContain('<svg');
  });

  it('reports conflicting authorities and permits JSON-only reports', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-timeline-conflict-'));
    const out = path.join(home, 'out');
    fs.mkdirSync(path.join(home, 'repo', '.git'), { recursive: true });
    write(home, 'repo/codument/tracks/active/conflict/track.xnl', '<Track #conflict { created_at = "2026-01-01T00:00:00Z" }>');
    write(home, 'repo/codument/tracks/active/conflict/track.xml', '<Track id="conflict"><Metadata><CreatedAt>2020-01-01T00:00:00Z</CreatedAt></Metadata></Track>');

    const report = runTimeline({ home, outputDir: out, groupBy: 'month', writeHtml: false });

    expect(report.resources).toHaveLength(1);
    expect(report.resources[0]?.format).toBe('xnl');
    expect(report.warnings.join('\n')).toContain('multiple Track authority candidates');
    expect(fs.existsSync(path.join(out, 'timeline.html'))).toBe(false);
  });

  it('filters resources by a Git remote host across SSH, HTTPS, and SCP-like URLs', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-timeline-remote-'));
    const company = path.join(home, 'company');
    const companyTwo = path.join(home, 'company-two');
    const publicRepo = path.join(home, 'public');
    for (const repo of [company, companyTwo, publicRepo]) {
      fs.mkdirSync(repo);
      expect(Bun.spawnSync(['git', 'init', '--quiet', repo]).exitCode).toBe(0);
    }
    expect(Bun.spawnSync(['git', '-C', company, 'remote', 'add', 'origin', 'git@git.example.company:platform/company.git']).exitCode).toBe(0);
    expect(Bun.spawnSync(['git', '-C', company, 'remote', 'add', 'mirror', 'https://git.example.company/platform/mirror.git']).exitCode).toBe(0);
    expect(Bun.spawnSync(['git', '-C', companyTwo, 'remote', 'add', 'origin', 'https://git.example.company/platform/company-two.git']).exitCode).toBe(0);
    expect(Bun.spawnSync(['git', '-C', publicRepo, 'remote', 'add', 'origin', 'https://github.com/openai/example.git']).exitCode).toBe(0);
    write(home, 'company/codument/tracks/active/company-track/track.xnl', '<Track #company-track { created_at = "2026-01-01T00:00:00Z" updated_at = "2026-01-02T00:00:00Z" }>');
    write(home, 'company-two/codument/missions/active/company-mission/mission.xnl', '<Mission #company-mission { created_at = "2026-02-01T00:00:00Z" updated_at = "2026-02-02T00:00:00Z" }>');
    write(home, 'public/codument/tracks/active/public-track/track.xnl', '<Track #public-track { created_at = "2026-01-01T00:00:00Z" updated_at = "2026-01-02T00:00:00Z" }>');

    const report = runTimeline({
      home, outputDir: path.join(home, 'company-report'), groupBy: 'month', remoteHost: 'git.example.company',
    });
    const resourceData = JSON.parse(fs.readFileSync(path.join(home, 'company-report', 'resources.json'), 'utf8')) as {
      remoteHost?: string;
      repositoryTotals?: Array<{ remoteRepository: string; tracks: number; missions: number; total: number }>;
    };
    const html = fs.readFileSync(path.join(home, 'company-report', 'timeline.html'), 'utf8');

    expect(report.remoteHost).toBe('git.example.company');
    expect(report.repositories).toEqual([fs.realpathSync(company), fs.realpathSync(companyTwo)]);
    expect(report.resources.map((resource) => resource.id)).toEqual(['company-track', 'company-mission']);
    expect(report.repositoryLabels[fs.realpathSync(company)]).toContain('git.example.company');
    expect(report.repositoryLabels[fs.realpathSync(companyTwo)]).toBe('https://git.example.company/platform/company-two.git');
    expect(report.repositoryTotals).toEqual(expect.arrayContaining([
      expect.objectContaining({ remoteRepository: 'https://git.example.company/platform/company-two.git', tracks: 0, missions: 1, total: 1 }),
      expect.objectContaining({ tracks: 1, missions: 0, total: 1 }),
    ]));
    expect(resourceData.remoteHost).toBe('git.example.company');
    expect(resourceData.repositoryTotals).toEqual(report.repositoryTotals);
    expect(html).toContain('Remote host filter: git.example.company');
    expect(html).toContain('id="repository-total-rows"');
    expect(html).toContain('Totals by Git repository');
    expect(html).toContain('<th>Git repository</th><th>Tracks</th><th>Missions</th><th>Total</th>');
    expect(html).not.toContain('id="repository-select"');
    const embeddedScript = /<script>([\s\S]*)<\/script>/.exec(html)?.[1];
    expect(embeddedScript).toBeDefined();
    expect(() => new Function(embeddedScript!)).not.toThrow();
  });

  it('exports quarter buckets and embeds an offline four-granularity switcher', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-timeline-grouping-'));
    fs.mkdirSync(path.join(home, 'repo', '.git'), { recursive: true });
    write(home, 'repo/codument/tracks/active/q4/track.xnl', '<Track #q4 { created_at = "2025-12-31T00:00:00Z" updated_at = "2026-01-01T00:00:00Z" }>');
    write(home, 'repo/codument/missions/active/q1/mission.xnl', '<Mission #q1 { created_at = "2026-02-01T00:00:00Z" updated_at = "2026-02-02T00:00:00Z" }>');

    const report = runTimeline({ home, outputDir: path.join(home, 'out'), groupBy: 'quarter' });
    const html = fs.readFileSync(path.join(home, 'out', 'timeline.html'), 'utf8');

    expect(report.groupBy).toBe('quarter');
    expect(report.timeline.buckets.map((bucket) => bucket.period)).toEqual(['2025-Q4', '2026-Q1']);
    expect(html).toContain('id="group-by"');
    expect(html).toContain('<option value="quarter"');
    expect(html).toContain('<option value="month"');
    expect(html).toContain('<option value="week"');
    expect(html).toContain('<option value="day"');
    expect(html).toContain('function renderTimeline');
    expect(html).toContain('<th colspan="3">Tracks</th><th colspan="3">Missions</th>');
    expect(html).toContain('Cumulative Tracks');
    expect(html).toContain('Cumulative Missions');
    expect(html).toContain('id="chart-tooltip"');
    expect(html).toContain('Tracks created');
    expect(html).toContain('Missions updated');
    expect(html).toContain('chart.addEventListener(\'pointermove\'');
  });
});
