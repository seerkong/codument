import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf-8');
}

describe('modeling + engineering E2E scripts', () => {
  it('documents the full registry E2E protocol without invoking a real agent', () => {
    const script = fs.readFileSync(path.join(ROOT, 'scripts', 'verify-modeling-engineering-e2e.sh'), 'utf-8');
    expect(script).toContain('codument/config/modeling.xml');
    expect(script).toContain('codument/config/engineering.xml');
    expect(script).toContain('modeling validate --deltas');
    expect(script).toContain('engineering validate --deltas');
    expect(script).toContain('score-e2e-code-quality.ts');
    expect(script).toContain('MODE="${MODE:-full}"');
    expect(script).toContain('SKIP_AGENT');
    expect(script).toContain('AGENT_TIMEOUT');
    expect(script).toContain('分批落盘');
    expect(script).toContain('howto、rules、reference');
    for (const topic of ['todo', 'ecommerce', 'blog']) {
      expect(script).toContain(`${topic})`);
    }
  });

  it('keeps the old modeling-only entrypoint as a compatibility wrapper', () => {
    const script = fs.readFileSync(path.join(ROOT, 'scripts', 'verify-modeling-e2e.sh'), 'utf-8');
    expect(script).toContain('verify-modeling-engineering-e2e.sh');
    expect(script).toContain('MODE="${MODE:-plan-only}"');
    expect(script).toContain('ENGINEERING="${ENGINEERING:-0}"');
  });

  it('scores a minimal workspace and writes JSON + Markdown reports', async () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-quality-score-'));
    const track = 'add-sample';
    write(path.join(ws, 'package.json'), JSON.stringify({
      scripts: {
        test: 'bun test',
        typecheck: 'bunx tsc --noEmit',
        build: 'bun test',
      },
      devDependencies: {
        typescript: '^5.3.0',
      },
    }, null, 2));
    write(path.join(ws, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { target: 'ESNext', module: 'ESNext', moduleResolution: 'bundler', types: ['bun-types'] },
      include: ['src/**/*', 'test/**/*'],
    }, null, 2));
    write(path.join(ws, 'src', 'index.ts'), 'export function add(a: number, b: number) { return a + b; }\n');
    write(path.join(ws, 'test', 'index.test.ts'), "import { expect, it } from 'bun:test';\nimport { add } from '../src';\nit('adds', () => expect(add(1, 2)).toBe(3));\n");
    write(path.join(ws, 'codument', 'tracks', track, 'track.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<Track id="${track}" version="1" xmlns:cdt="urn:codument:v1">
  <Metadata><Status>completed</Status><Goal>sample</Goal><Description>sample</Description><CommitMode>manual</CommitMode><CreatedAt>2026-06-28T00:00:00+08:00</CreatedAt><UpdatedAt>2026-06-28T00:00:00+08:00</UpdatedAt></Metadata>
  <TaskSpace id="space_${track}" name="${track}" version="1"><SubNodes><TaskGroup id="P1" name="p" status="DONE" order="0"><SubNodes><Task id="T1.1" name="t" status="DONE" order="0"/></SubNodes></TaskGroup></SubNodes></TaskSpace>
</Track>
`);
    write(path.join(ws, 'codument', 'tracks', track, 'behavior_deltas', 'cap', 'delta.xml'), `<behavior-patch capability="cap" version="1">
  <upsert selector="behavior://cap/requirements/sample"><requirement id="sample"><statement>系统 SHALL work.</statement><suite id="s"><case id="c"><given>x</given><when>y</when><then>z</then></case></suite></requirement></upsert>
</behavior-patch>`);
    write(path.join(ws, 'codument', 'tracks', track, 'modeling_deltas', 'domain', 'sample.xnl'), `<object #domain.sample.item kind="entity" fact_grade="authoritative_fact" single_writer="backend.item" [
  <types ?m>
  interface Item { id: string }
  </?m>
]>`);
    write(path.join(ws, 'codument', 'tracks', track, 'engineering_deltas', 'global', 'howto', 'sample.xnl'), `<howto #global.howto.sample.add_item kind="howto" [
  <when-to-use ?m>
  添加 item 时使用。
  </?m>
  <steps ?m>
  1. 写测试。
  </?m>
  <verification ?m>
  运行测试。
  </?m>
]>`);

    const proc = Bun.spawn([
      'bun',
      'run',
      path.join(ROOT, 'scripts', 'score-e2e-code-quality.ts'),
      ws,
      '--track',
      track,
      '--out',
      path.join(ws, 'reports'),
      '--codument',
      path.join(ROOT, 'src', 'cli', 'index.ts'),
    ], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
    const code = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(stderr).toBe('');
    expect(code).toBe(0);

    const report = JSON.parse(fs.readFileSync(path.join(ws, 'reports', 'code-quality.json'), 'utf-8')) as {
      totalScore: number;
      maxScore: number;
      dimensions: { name: string }[];
    };
    expect(report.maxScore).toBe(100);
    expect(report.totalScore).toBeGreaterThan(0);
    expect(report.dimensions.map((d) => d.name)).toContain('Codument alignment');
    expect(fs.readFileSync(path.join(ws, 'reports', 'code-quality.md'), 'utf-8')).toContain('Code Quality Report');
  });
});
