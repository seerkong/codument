import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const repoRoot = path.resolve(import.meta.dir, '../../..');
const cli = path.join(repoRoot, 'src/cli/index.ts');

function tmpWorkspace(): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-decisions-'));
  fs.mkdirSync(path.join(ws, 'codument', 'tracks'), { recursive: true });
  return ws;
}

function writeDecisionFile(file: string, content: string, addCurrentVersion = true): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const normalized = addCurrentVersion && path.extname(file) === '.xnl'
    ? content.replace(/^<decision (#[^\s{>]+)([^\n]*)$/gm, (line, id, suffix) => (
      suffix.includes('apiVersion=')
        ? line
        : `<decision ${id} apiVersion="codument.tech/v1alpha1"${suffix}`
    ))
    : content;
  fs.writeFileSync(file, normalized, 'utf-8');
}

async function runDecisions(ws: string, args: string[]) {
  const proc = Bun.spawn(['bun', 'run', cli, 'decisions', 'validate', ...args], {
    cwd: ws,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const code = await proc.exited;
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  return { code, out, err };
}

async function runDecisionCommand(ws: string, command: string, args: string[]) {
  const proc = Bun.spawn(['bun', 'run', cli, 'decisions', command, ...args], {
    cwd: ws,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    code: await proc.exited,
    out: await new Response(proc.stdout).text(),
    err: await new Response(proc.stderr).text(),
  };
}

describe('codument decisions create', () => {
  it('creates a versioned pending root with options and appends nested decisions', async () => {
    const ws = tmpWorkspace();
    const file = path.join(ws, 'codument', 'tracks', 'active', 'sample', 'decisions.xnl');

    let result = await runDecisionCommand(ws, 'create', [file, 'track.sample.storage']);
    expect(result.code).toBe(0);
    let xnl = fs.readFileSync(file, 'utf8');
    expect(xnl).toContain('<decision #track.sample.storage apiVersion="codument.tech/v1alpha1"');
    expect(xnl).toMatch(/<options \{\s*\} \[/);
    expect(xnl).toContain('recommended = true');

    result = await runDecisionCommand(ws, 'create', [file, 'track.sample.storage.encryption', '--parent', 'track.sample.storage']);
    expect(result.code).toBe(0);
    xnl = fs.readFileSync(file, 'utf8');
    expect(xnl.match(/apiVersion="codument.tech\/v1alpha1"/g)).toHaveLength(1);
    expect(xnl).toContain('<decision #track.sample.storage.encryption {');

    const validated = await runDecisions(ws, [file]);
    expect(validated.code).toBe(0);
    expect(validated.out).toContain('decision is still pending');
  });

  it('rejects non-XNL targets, duplicate ids, and missing parents', async () => {
    const ws = tmpWorkspace();
    const file = path.join(ws, 'decisions.xnl');
    expect((await runDecisionCommand(ws, 'create', [path.join(ws, 'decisions.md'), 'track.bad'])).code).toBe(1);
    expect((await runDecisionCommand(ws, 'create', [file, 'track.good'])).code).toBe(0);
    expect((await runDecisionCommand(ws, 'create', [file, 'track.good'])).code).toBe(1);
    expect((await runDecisionCommand(ws, 'create', [file, 'track.child', '--parent', 'track.missing'])).code).toBe(1);
  });
});

describe('codument decisions frontier', () => {
  it('returns only pending decisions whose dependencies and parent are resolved', async () => {
    const ws = tmpWorkspace();
    const file = path.join(ws, 'decisions.xnl');
    writeDecisionFile(file, `<decision #root { status = "accepted" priority = "P1" } [
  <decision #ready { status = "pending" priority = "P0" depends_on = ["root"] }>
]>
<decision #blocker { status = "pending" priority = "P1" }>
<decision #waiting { status = "pending" priority = "P0" depends_on = ["blocker"] }>
<decision #other { status = "pending" priority = "P2" }>`);

    const result = await runDecisionCommand(ws, 'frontier', [file, '--json']);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out).map((entry: { id: string }) => entry.id)).toEqual(['ready', 'blocker', 'other']);
  });
});

describe('codument decisions validate', () => {
  it('requires the Halfcode-backed Decision Kind version on every forest root', async () => {
    const ws = tmpWorkspace();
    const file = path.join(ws, 'decisions.xnl');
    writeDecisionFile(file, `<decision #track.version.missing { status = "accepted" }>`, false);
    let result = await runDecisions(ws, [file]);
    expect(result.code).toBe(1);
    expect(result.out).toContain('top-level decision is missing apiVersion (expected codument.tech/v1alpha1)');

    writeDecisionFile(file, `<decision #track.version.unsupported apiVersion="codument.tech/v9" { status = "accepted" }>`, false);
    result = await runDecisions(ws, [file]);
    expect(result.code).toBe(1);
    expect(result.out).toContain("unsupported decision apiVersion 'codument.tech/v9'");
  });

  it('passes accepted decisions with durable metadata', async () => {
    const ws = tmpWorkspace();
    const file = path.join(ws, 'decisions.md');
    writeDecisionFile(file, `# Decisions

### 1. Accepted decision
- Blocks: implementation
- Evidence: user request and local code
- Confidence: 0.9
- Reversibility: moderate
- Durable candidate: yes
- 状态：accepted
`);

    const { code, out } = await runDecisions(ws, [file]);
    expect(code).toBe(0);
    expect(out).toContain('no issues');
  });

  it('warns on pending decisions', async () => {
    const ws = tmpWorkspace();
    const file = path.join(ws, 'decisions.md');
    writeDecisionFile(file, `# Decisions

### 1. Pending decision
- Blocks: track.xml
- Durable candidate: no
- 状态：pending
`);

    const { code, out } = await runDecisions(ws, [file]);
    expect(code).toBe(0);
    expect(out).toContain('[warning] 1. Pending decision: decision is still pending');
  });

  it('warns but succeeds when durable metadata is incomplete', async () => {
    const ws = tmpWorkspace();
    const file = path.join(ws, 'decisions.md');
    writeDecisionFile(file, `# Decisions

### 1. Durable but incomplete
- Blocks: none
- Evidence: -
- Confidence:
- Reversibility: -
- Durable candidate: yes
- Status: accepted
`);

    const { code, out } = await runDecisions(ws, [file]);
    expect(code).toBe(0);
    expect(out).toContain('[warning] 1. Durable but incomplete: durable candidate is missing Evidence');
    expect(out).toContain('[warning] 1. Durable but incomplete: durable candidate is missing Confidence');
    expect(out).toContain('[warning] 1. Durable but incomplete: durable candidate is missing Reversibility');
  });

  it('resolves a track id to codument/tracks/<id>/decisions.xnl before legacy markdown', async () => {
    const ws = tmpWorkspace();
    writeDecisionFile(path.join(ws, 'codument', 'tracks', 'active', 'add-sample', 'decisions.xnl'), `<decision #track.add_sample.use_xnl {
  status = "accepted"
  blocks = []
  durable_candidate = false
}
(
  <question ?>Use XNL?</?>
  <answer ?>Yes.</?>
)>
`);
    writeDecisionFile(path.join(ws, 'codument', 'tracks', 'active', 'add-sample', 'decisions.md'), `# Decisions

### 1. Legacy pending decision
- Blocks: track.xml
- Durable candidate: no
- Status: pending
`);

    const { code, out } = await runDecisions(ws, ['add-sample']);
    expect(code).toBe(0);
    expect(out).toContain(path.join('codument', 'tracks', 'active', 'add-sample', 'decisions.xnl'));
  });

  it('falls back to legacy decisions.md for a track id', async () => {
    const ws = tmpWorkspace();
    writeDecisionFile(path.join(ws, 'codument', 'tracks', 'active', 'legacy-sample', 'decisions.md'), `# Decisions

### 1. Accepted decision
- Blocks: none
- Durable candidate: no
- Status: accepted
`);

    const { code, out } = await runDecisions(ws, ['legacy-sample']);
    expect(code).toBe(0);
    expect(out).toContain(path.join('codument', 'tracks', 'active', 'legacy-sample', 'decisions.md'));
  });

  it('warns on pending decisions in decisions.xnl', async () => {
    const ws = tmpWorkspace();
    const file = path.join(ws, 'decisions.xnl');
    writeDecisionFile(file, `<decision #track.sample.pending {
  kind = "planning-decision"
  priority = "P0"
  status = "pending"
  blocks = ["track.xml"]
  durable_candidate = false
}
(
  <question ?>Can this stay pending?</?>
)>
`);

    const { code, out } = await runDecisions(ws, [file]);
    expect(code).toBe(0);
    expect(out).toContain('[warning] track.sample.pending: decision is still pending');
    expect(out).toContain("[warning] track.sample.pending: blocking decision has unresolved status 'pending'");
  });

  it('validates nested decision-tree decisions from body children', async () => {
    const ws = tmpWorkspace();
    const file = path.join(ws, 'decisions.xnl');
    writeDecisionFile(file, `<decision #track.root {
  status = "accepted"
  blocks = []
  durable_candidate = false
}
(
  <question ?>Root?</?>
)
[
  <decision #track.root.child {
    status = "pending"
    blocks = ["implementation"]
    durable_candidate = false
  }
  (
    <question ?>Child?</?>
  )>
]>
`);

    const { code, out } = await runDecisions(ws, [file]);
    expect(code).toBe(0);
    expect(out).toContain('[warning] track.root.child: decision is still pending');
  });

  it('validates options wrapper separately from nested decision children', async () => {
    const ws = tmpWorkspace();
    const file = path.join(ws, 'decisions.xnl');
    writeDecisionFile(file, `<decision #track.options.valid {
  status = "pending"
  blocks = ["design.md"]
}
(
  <question ?>Which carrier should be used?</?>
  <options { } [
    <option { key = "A" recommended = true }
    (
      <title ?>Use XNL</?>
      <description ?>Keep decisions structured and machine-readable.</?>
      <tradeoff ?>Requires parser and template changes.</?>
    )
    >
    <option { key = "B" }
    (
      <title ?>Use Markdown</?>
      <description ?>Keep the legacy Markdown decision file.</?>
      <tradeoff ?>Lower migration cost, weaker structure.</?>
    )
    >
  ]>
  <answer ?>Awaiting user choice.</?>
)
[
  <decision #track.options.valid.child {
    status = "accepted"
  }
  (
    <question ?>Should legacy fallback remain?</?>
    <answer ?>Yes.</?>
  )>
]
>
`);

    const { code, out } = await runDecisions(ws, [file]);
    expect(code).toBe(0);
    expect(out).toContain('[warning] track.options.valid: decision is still pending');
    expect(out).not.toContain('options must be inside the decision extend block');
  });

  it('rejects options placed in the decision tree body', async () => {
    const ws = tmpWorkspace();
    const file = path.join(ws, 'decisions.xnl');
    writeDecisionFile(file, `<decision #track.options.invalid {
  status = "accepted"
}
(
  <question ?>Which carrier should be used?</?>
)
[
  <options { } [
    <option { key = "A" }
    (
      <title ?>Use XNL</?>
      <description ?>Structured carrier.</?>
    )
    >
  ]>
]
>
`);

    const { code, out } = await runDecisions(ws, [file]);
    expect(code).toBe(1);
    expect(out).toContain('[error] track.options.invalid: options must be inside the decision extend block (), not the decision body []');
  });

  it('requires exactly one recommended option in an options wrapper', async () => {
    const ws = tmpWorkspace();
    const file = path.join(ws, 'decisions.xnl');
    writeDecisionFile(file, `<decision #track.options.recommendation {
  status = "accepted"
}
(
  <question ?>Which carrier should be used?</?>
  <options { } [
    <option { key = "A" }
    (
      <title ?>Use XNL</?>
      <description ?>Structured carrier.</?>
    )
    >
    <option { key = "B" }
    (
      <title ?>Use Markdown</?>
      <description ?>Legacy carrier.</?>
    )
    >
  ]>
)
>
`);

    const { code, out } = await runDecisions(ws, [file]);
    expect(code).toBe(1);
    expect(out).toContain('[error] track.options.recommendation: options must mark exactly one recommended option (found 0)');
  });

  it('rejects a direct option child without an options wrapper', async () => {
    const ws = tmpWorkspace();
    const file = path.join(ws, 'decisions.xnl');
    writeDecisionFile(file, `<decision #track.options.direct {
  status = "accepted"
}
(
  <question ?>Which carrier should be used?</?>
  <option { key = "A" recommended = true }
  (
    <title ?>Use XNL</?>
    <description ?>Structured carrier.</?>
  )
  >
)
>
`);

    const { code, out } = await runDecisions(ws, [file]);
    expect(code).toBe(1);
    expect(out).toContain('[error] track.options.direct: option must be inside an options wrapper, not directly under decision');
  });

  it('warns when durable decisions.xnl records miss durable evidence fields', async () => {
    const ws = tmpWorkspace();
    const file = path.join(ws, 'decisions.xnl');
    writeDecisionFile(file, `<decision #track.sample.durable {
  status = "accepted"
  blocks = []
  durable_candidate = true
}
(
  <question ?>Durable?</?>
)>
`);

    const { code, out } = await runDecisions(ws, [file]);
    expect(code).toBe(0);
    expect(out).toContain('[warning] track.sample.durable: durable candidate is missing Evidence');
    expect(out).toContain('[warning] track.sample.durable: durable candidate is missing Confidence');
    expect(out).toContain('[warning] track.sample.durable: durable candidate is missing Reversibility');
  });

  it('accepts durable decisions.xnl records with singleton evidence fields', async () => {
    const ws = tmpWorkspace();
    const file = path.join(ws, 'decisions.xnl');
    writeDecisionFile(file, `<decision #track.sample.durable {
  status = "accepted"
  blocks = []
  durable_candidate = true
}
(
  <question ?>Durable?</?>
  <evidence ?>User explicitly approved it.</?>
  <confidence ?>0.92</?>
  <reversibility ?>moderate</?>
)>
`);

    const { code, out } = await runDecisions(ws, [file]);
    expect(code).toBe(0);
    expect(out).toContain('no issues');
  });

  it('reads structured answer feedback and nested evidence', async () => {
    const ws = tmpWorkspace();
    const file = path.join(ws, 'decisions.xnl');
    writeDecisionFile(file, `<decision #track.sample.answer_feedback {
  status = "accepted"
  blocks = []
  durable_candidate = true
}
(
  <question ?>Should the answer be structured?</?>
  <answer { }
  (
    <raw-answer ?>Yes, use the structured answer container.</?>
    <decision-text ?>Use answer as a feedback container.</?>
    <rationale ?>The raw response and normalized decision have different meanings.</?>
    <evidence ?>The user explicitly requested the grouping.</?>
  )
  >
  <confidence ?>0.94</?>
  <reversibility ?>easy</?>
)
>
`);

    const { code, out } = await runDecisions(ws, [file]);
    expect(code).toBe(0);
    expect(out).toContain('no issues');
  });

  it('requires the complete feedback set in a new answer wrapper', async () => {
    const ws = tmpWorkspace();
    const file = path.join(ws, 'decisions.xnl');
    writeDecisionFile(file, `<decision #track.sample.incomplete_answer {
  status = "accepted"
}
(
  <question ?>Is the answer complete?</?>
  <answer { }
  (
    <raw-answer ?>Yes.</?>
  )
  >
)
>
`);

    const { code, out } = await runDecisions(ws, [file]);
    expect(code).toBe(1);
    expect(out).toContain('[error] track.sample.incomplete_answer: answer is missing Decision text');
    expect(out).toContain('[error] track.sample.incomplete_answer: answer is missing Rationale');
    expect(out).toContain('[error] track.sample.incomplete_answer: answer is missing Evidence');
  });

  it('recursively validates a decision registry directory and fails closed on duplicate stable ids', async () => {
    const ws = tmpWorkspace();
    const registry = path.join(ws, 'codument', 'decisions');
    writeDecisionFile(path.join(registry, 'registry.xnl'), `<decision #registry.shared {
  status = "accepted"
}>
`);
    writeDecisionFile(path.join(registry, 'platform', 'runtime.xnl'), `<decision #registry.shared {
  status = "resolved"
}>
`);

    const { code, out } = await runDecisions(ws, [registry]);
    expect(code).toBe(1);
    expect(out).toContain("Duplicate decision node id 'registry.shared'");
    expect(out).toContain('registry.xnl');
    expect(out).toContain('platform/runtime.xnl');
    expect(out).toContain('hierarchy');
  });

  it('validates the root and recursive decision source set for a track id', async () => {
    const ws = tmpWorkspace();
    const track = path.join(ws, 'codument', 'tracks', 'active', 'source-set');
    writeDecisionFile(path.join(track, 'decisions.xnl'), `<decision #track.source_set.root {
  status = "accepted"
}>
`);
    writeDecisionFile(path.join(track, 'decisions', 'platform', 'conditional.xnl'), `<decision #track.source_set.conditional {
  status = "accepted"
  depends_on = ["track.source_set.root"]
  activation = { all = ["track.source_set.missing_activation=enabled"] }
  derived_from = ["track.source_set.missing_derivation=enabled"]
}>
`);

    const { code, out } = await runDecisions(ws, ['source-set']);
    expect(code).toBe(1);
    expect(out).toContain("unresolved activation reference 'track.source_set.missing_activation'");
    expect(out).toContain("unresolved derived_from reference 'track.source_set.missing_derivation'");
    expect(out).toContain('decisions/platform/conditional.xnl');
  });

  it('resolves an active mission id and validates its recursive decision source set', async () => {
    const ws = tmpWorkspace();
    const mission = path.join(ws, 'codument', 'missions', 'active', 'mission-source-set');
    writeDecisionFile(path.join(mission, 'decisions.xnl'), `<decision #mission.source_set.root {
  status = "accepted"
}>
`);
    writeDecisionFile(path.join(mission, 'decisions', 'nested.xnl'), `<decision #mission.source_set.child {
  status = "pending"
}>
`);

    const { code, out } = await runDecisions(ws, ['mission-source-set']);
    expect(code).toBe(0);
    expect(out).toContain('[warning] mission.source_set.child: decision is still pending');
    expect(out).toContain('decisions/nested.xnl');
  });

  it('rejects invalid decision hierarchy and dangling dependency references', async () => {
    const ws = tmpWorkspace();
    const file = path.join(ws, 'decisions.xnl');
    writeDecisionFile(file, `<decision #track.hierarchy.root {
  status = "accepted"
  depends_on = ["track.hierarchy.missing"]
}
[
  <note ?>Decision bodies cannot contain arbitrary child elements.</?>
]>
`);

    const { code, out } = await runDecisions(ws, [file]);
    expect(code).toBe(1);
    expect(out).toContain("unresolved depends_on reference 'track.hierarchy.missing'");
    expect(out).toContain('decision body may contain only nested decision nodes');
    expect(out).toContain('hierarchy');
  });

  it('rejects cycles in the cross-file decision dependency graph', async () => {
    const ws = tmpWorkspace();
    const registry = path.join(ws, 'codument', 'decisions');
    writeDecisionFile(path.join(registry, 'a.xnl'), `<decision #registry.cycle.a {
  status = "accepted"
  depends_on = ["registry.cycle.b"]
}>
`);
    writeDecisionFile(path.join(registry, 'nested', 'b.xnl'), `<decision #registry.cycle.b {
  status = "accepted"
  depends_on = ["registry.cycle.a"]
}>
`);

    const { code, out } = await runDecisions(ws, [registry]);
    expect(code).toBe(1);
    expect(out).toContain('decision dependency graph contains a cycle');
    expect(out).toContain('registry.cycle.a');
    expect(out).toContain('registry.cycle.b');
  });

  it('keeps explicit legacy Markdown file validation compatible', async () => {
    const ws = tmpWorkspace();
    const file = path.join(ws, 'legacy-decisions.md');
    writeDecisionFile(file, `# Decisions

### Legacy pending
- Blocks: implementation
- Durable candidate: no
- Status: pending
`);

    const { code, out } = await runDecisions(ws, [file]);
    expect(code).toBe(0);
    expect(out).toContain('[warning] Legacy pending: decision is still pending');
  });
});
