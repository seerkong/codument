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

function writeDecisionFile(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf-8');
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

describe('codument decisions validate', () => {
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

  it('fails pending decisions', async () => {
    const ws = tmpWorkspace();
    const file = path.join(ws, 'decisions.md');
    writeDecisionFile(file, `# Decisions

### 1. Pending decision
- Blocks: track.xml
- Durable candidate: no
- 状态：pending
`);

    const { code, out } = await runDecisions(ws, [file]);
    expect(code).toBe(1);
    expect(out).toContain('[error] 1. Pending decision: decision is still pending');
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
    writeDecisionFile(path.join(ws, 'codument', 'tracks', 'add-sample', 'decisions.xnl'), `<decision #track.add_sample.use_xnl {
  status = "accepted"
  blocks = []
  durable_candidate = false
}
(
  <question ?>Use XNL?</?>
  <answer ?>Yes.</?>
)>
`);
    writeDecisionFile(path.join(ws, 'codument', 'tracks', 'add-sample', 'decisions.md'), `# Decisions

### 1. Legacy pending decision
- Blocks: track.xml
- Durable candidate: no
- Status: pending
`);

    const { code, out } = await runDecisions(ws, ['add-sample']);
    expect(code).toBe(0);
    expect(out).toContain(path.join('codument', 'tracks', 'add-sample', 'decisions.xnl'));
  });

  it('falls back to legacy decisions.md for a track id', async () => {
    const ws = tmpWorkspace();
    writeDecisionFile(path.join(ws, 'codument', 'tracks', 'legacy-sample', 'decisions.md'), `# Decisions

### 1. Accepted decision
- Blocks: none
- Durable candidate: no
- Status: accepted
`);

    const { code, out } = await runDecisions(ws, ['legacy-sample']);
    expect(code).toBe(0);
    expect(out).toContain(path.join('codument', 'tracks', 'legacy-sample', 'decisions.md'));
  });

  it('fails pending decisions in decisions.xnl', async () => {
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
    expect(code).toBe(1);
    expect(out).toContain('[error] track.sample.pending: decision is still pending');
    expect(out).toContain("[error] track.sample.pending: blocking decision has unresolved status 'pending'");
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
    expect(code).toBe(1);
    expect(out).toContain('[error] track.root.child: decision is still pending');
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
    expect(code).toBe(1);
    expect(out).toContain('[error] track.options.valid: decision is still pending');
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
});
