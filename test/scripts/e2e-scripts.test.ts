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
    const taskDir = path.join(ROOT, 'e2e', 'modeling-engineering');
    const script = fs.readFileSync(path.join(taskDir, 'run.sh'), 'utf-8');
    expect(script).toContain('codument/config/modeling.xnl');
    expect(script).toContain('codument/config/engineering.xnl');
    expect(script).toContain('modeling validate --deltas');
    expect(script).toContain('engineering validate --deltas');
    expect(script).toContain('score.ts');
    expect(script).toContain('MODE="${MODE:-full}"');
    expect(script).toContain('SKIP_AGENT');
    expect(script).toContain('AGENT_TIMEOUT');
    expect(script).toContain('run_codument');
    expect(script).toContain('track.xnl');
    expect(script).toContain('BehaviorPatch');
    expect(script).toContain('for stage in active pending');
    expect(script).not.toContain('tracks/active/active');
    expect(fs.existsSync(path.join(taskDir, 'README.md'))).toBe(true);
    for (const task of ['todo', 'ecommerce', 'blog']) {
      const concreteTask = path.join(taskDir, task);
      expect(fs.readFileSync(path.join(concreteTask, 'product.md'), 'utf-8')).toContain('# Product:');
      expect(fs.readFileSync(path.join(concreteTask, 'plan.md'), 'utf-8')).toContain('分批落盘');
      expect(fs.readFileSync(path.join(concreteTask, 'plan.md'), 'utf-8')).toContain('howto、rules、reference');
      expect(fs.readFileSync(path.join(concreteTask, 'implement.md'), 'utf-8')).toContain('codument-impl-track');
    }
  });

  it('keeps the old modeling-only entrypoint as a compatibility wrapper', () => {
    const script = fs.readFileSync(path.join(ROOT, 'scripts', 'verify-modeling-e2e.sh'), 'utf-8');
    expect(script).toContain('e2e/modeling-engineering/run.sh');
    expect(script).toContain('MODE="${MODE:-plan-only}"');
    expect(script).toContain('ENGINEERING="${ENGINEERING:-0}"');
  });

  it('initializes and validates a current-XNL temporary workspace in smoke mode', async () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-e2e-harness-'));
    fs.rmSync(ws, { recursive: true, force: true });
    const proc = Bun.spawn(['bash', path.join(ROOT, 'e2e', 'modeling-engineering', 'smoke.sh')], {
      cwd: ROOT,
      env: {
        ...process.env,
        WS: `${ws}-task`,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const code = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    expect(stderr).toBe('');
    for (const task of ['todo', 'ecommerce', 'blog']) {
      expect(stdout).toContain(`== smoke task: ${task} ==`);
    }
    expect(stdout.match(/track = smoke-modeling-engineering \(active\)/g)).toHaveLength(3);
    expect(stdout).toContain('track.xnl OK');
    expect(stdout).toContain('codument/tracks/active/smoke-modeling-engineering/modeling_deltas');
    expect(stdout).toContain('codument/tracks/active/smoke-modeling-engineering/engineering_deltas');
    expect(stdout).toContain('Code quality score:');
    expect(code).toBe(0);
    expect(fs.existsSync(`${ws}-task`)).toBe(false);
  }, 30_000);

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
    write(path.join(ws, 'codument', 'tracks', 'active', track, 'track.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<Track id="${track}" version="1" xmlns:cdt="urn:codument:v1">
  <Metadata><Status>completed</Status><Goal>sample</Goal><Description>sample</Description><CommitMode>manual</CommitMode><CreatedAt>2026-06-28T00:00:00+08:00</CreatedAt><UpdatedAt>2026-06-28T00:00:00+08:00</UpdatedAt></Metadata>
  <TaskSpace id="space_${track}" name="${track}" version="1"><SubNodes><TaskGroup id="P1" name="p" status="DONE" order="0"><SubNodes><Task id="T1.1" name="t" status="DONE" order="0"/></SubNodes></TaskGroup></SubNodes></TaskSpace>
</Track>
`);
    write(path.join(ws, 'codument', 'tracks', 'active', track, 'behavior_deltas', 'cap', 'delta.xml'), `<behavior-patch capability="cap" version="1">
  <upsert selector="behavior://cap/requirements/sample"><requirement id="sample"><statement>系统 SHALL work.</statement><suite id="s"><case id="c"><given>x</given><when>y</when><then>z</then></case></suite></requirement></upsert>
</behavior-patch>`);
    write(path.join(ws, 'codument', 'tracks', 'active', track, 'modeling_deltas', 'domain', 'sample.xnl'), `<object #domain.sample.item kind="entity" fact_grade="authoritative_fact" single_writer="backend.item" [
  <types ?m>
  interface Item { id: string }
  </?m>
]>`);
    write(path.join(ws, 'codument', 'tracks', 'active', track, 'engineering_deltas', 'global', 'howto', 'sample.xnl'), `<howto #global.howto.sample.add_item kind="howto" [
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
      path.join(ROOT, 'e2e', 'modeling-engineering', 'score.ts'),
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
  }, 15_000);

  it('discovers a pending track.xnl and invokes a compiled Codument CLI', async () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-quality-pending-'));
    const track = 'pending-sample';
    const trackDir = path.join(ws, 'codument', 'tracks', 'pending', track);
    write(path.join(trackDir, 'track.xnl'), '<Track #pending-sample apiVersion="codument.tech/v1alpha1" version="1">\n');

    const proc = Bun.spawn([
      'bun', 'run', path.join(ROOT, 'e2e', 'modeling-engineering', 'score.ts'), ws,
      '--track', track,
      '--out', path.join(ws, 'reports'),
      '--codument', path.join(ROOT, 'dist', 'codument'),
    ], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
    const code = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(stderr).toBe('');
    expect(code).toBe(0);

    const report = JSON.parse(fs.readFileSync(path.join(ws, 'reports', 'code-quality.json'), 'utf-8')) as {
      dimensions: { name: string; evidence: string[] }[];
    };
    expect(report.dimensions.find((dimension) => dimension.name === 'Codument alignment')?.evidence)
      .toContain('track pending/pending-sample');
  }, 15_000);
});

describe('project implementation E2E scripts', () => {
  const suiteDir = path.join(ROOT, 'e2e', 'project-implementation');
  const caseDir = path.join(suiteDir, 'stream-pipeline-ai-agent');

  it('keeps the original request in its leaf task and uses a real single-session Agent runner', () => {
    const request = fs.readFileSync(path.join(caseDir, 'request.md'), 'utf-8');
    const runner = fs.readFileSync(path.join(suiteDir, 'run.sh'), 'utf-8');
    const verifier = fs.readFileSync(path.join(caseDir, 'verify.sh'), 'utf-8');

    expect(request).toContain('你是一名非常擅长教学型工程实现的 Python 架构师。');
    expect(request).toContain('semantic mainline');
    expect(request).toContain('请直接按文件输出完整项目代码。');
    expect(runner).toContain('codument init --agent="$AGENT"');
    expect(runner).toContain('cat "$WORKSPACE_REQUEST"');
    expect(runner).toContain('REQUEST_FILE="$TASK_DIR/request.md"');
    expect(runner).toContain('VERIFY_SCRIPT="$TASK_DIR/verify.sh"');
    expect(runner).not.toContain('REQUEST_FILE="$TASK_DIR/$TASK_ID.md"');
    expect(runner).toContain('codex_args=(exec -C "$WS"');
    expect(runner).toContain('使用已经初始化好的 Codument');
    expect(runner).toContain('CODUMENT_SOURCE="current-workspace-build"');
    expect(runner).toContain('bun run build');
    expect(runner).toContain('E2E_BIN_DIR="$WS/.e2e-bin"');
    expect(runner).toContain('PATH="$E2E_BIN_DIR:$PATH"');
    expect(runner).toContain('_codument-provenance.txt');
    expect(runner).toContain('CODUMENT_SHA256');
    expect(runner).toContain('CODUMENT_GIT_SHA');
    expect(verifier).toContain('status = "completed"');
    expect(verifier).toContain('python" -m pytest -q');
    expect(verifier).toContain('semantic pipeline does not use an RxPY Subject');
    expect(verifier).toContain('response\\.function_call_arguments\\.delta');
    expect(verifier).toContain('tests/test_readline_projection.py');
    expect(runner).toContain('Python 环境请使用满足项目声明的可用隔离环境。');
    expect(runner).not.toMatch(/python3\.(?:[0-9]+)/);
    expect(verifier).toContain('uv venv --quiet --project "$WS"');
    expect(verifier).toContain('python_candidates');
    expect(verifier).toContain("-c 'import encodings, ensurepip'");
    expect(verifier).toContain('PYTHON cannot create a usable environment for this project');
  });

  it('prepares a current Codument workspace and preserves the request without invoking an Agent', async () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'project-implementation-smoke-'));
    fs.rmSync(ws, { recursive: true, force: true });
    const proc = Bun.spawn(['bash', path.join(suiteDir, 'smoke.sh')], {
      cwd: ROOT,
      env: { ...process.env, WS: ws },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const code = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    expect(stderr).toBe('');
    expect(stdout).toContain('Codument 环境与需求副本准备完成');
    expect(stdout).toContain('request sha256:');
    expect(stdout).toContain('source: current-workspace-build');
    expect(stdout).toContain('version: codument v');
    expect(stdout).toMatch(/sha256: [a-f0-9]{64}/);
    expect(stdout).toMatch(/git_sha: [a-f0-9]{40}/);
    expect(code).toBe(0);
    expect(fs.existsSync(ws)).toBe(false);
  }, 30_000);
});
