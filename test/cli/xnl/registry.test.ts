import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseXnl } from 'xnl-core';
import {
  discoverXnlRegistryFiles,
  loadXnlRegistry,
  loadXnlRegistrySafe,
  readStableNodeId,
  serializeXnlFile,
} from '../../../src/cli/xnl/registry';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codument-xnl-registry-'));
}

function write(root: string, relFile: string, content: string): void {
  const file = path.join(root, ...relFile.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf-8');
}

const decisionNodesOnly = {
  shouldIndex: (node: { tag: string }) => node.tag === 'decision',
  registryName: 'decision',
};

function semanticAst(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semanticAst);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'textMarker')
      .map(([key, child]) => [key, semanticAst(child)]),
  );
}

describe('generic XNL registry loader', () => {
  it('discovers recursive XNL files in stable portable order and skips hidden trees', () => {
    const dir = tmpDir();
    write(dir, 'z-last.xnl', '<decision #z.last>');
    write(dir, 'alpha/nested/b.xnl', '<decision #alpha.b>');
    write(dir, 'alpha/a.xnl', '<decision #alpha.a>');
    write(dir, '.tmp/ignored.xnl', '<decision #hidden.tmp>');
    write(dir, 'alpha/.node-meta/ignored.xnl', '<decision #hidden.meta>');
    write(dir, 'not-xnl.md', '# ignored');

    expect(discoverXnlRegistryFiles(dir)).toEqual([
      'alpha/a.xnl',
      'alpha/nested/b.xnl',
      'z-last.xnl',
    ]);

    const registry = loadXnlRegistry(dir, decisionNodesOnly);
    expect([...registry.files.keys()]).toEqual([
      'alpha/a.xnl',
      'alpha/nested/b.xnl',
      'z-last.xnl',
    ]);
    expect([...registry.index.keys()]).toEqual(['alpha.a', 'alpha.b', 'z.last']);
  });

  it('indexes nested decision nodes with stable owner and ancestor metadata', () => {
    const dir = tmpDir();
    write(dir, 'topic/forest.xnl', `
<decision #root.policy { status = "accepted" }
[
  <context #root.context
  [
    <decision #root.policy.child { status = "resolved" }
    [
      <decision #root.policy.child.leaf { status = "accepted" }>
    ]>
  ]>
]>
`);

    const registry = loadXnlRegistry(dir, decisionNodesOnly);
    const child = registry.index.get('root.policy.child');
    const leaf = registry.index.get('root.policy.child.leaf');

    expect(child).toBeDefined();
    expect(child!.file).toBe('topic/forest.xnl');
    expect(child!.owner).toEqual({ file: 'topic/forest.xnl', topLevelIndex: 0 });
    expect(child!.ancestors.map(({ tag, id }) => ({ tag, id }))).toEqual([
      { tag: 'decision', id: 'root.policy' },
      { tag: 'context', id: 'root.context' },
    ]);
    expect(child!.parent).toEqual({ tag: 'context', id: 'root.context' });
    expect(child!.path).toEqual([
      { kind: 'root', index: 0 },
      { kind: 'body', index: 0 },
      { kind: 'body', index: 0 },
    ]);

    expect(leaf!.ancestors.map((ancestor) => ancestor.id)).toEqual([
      'root.policy',
      'root.context',
      'root.policy.child',
    ]);
    expect(leaf!.parent).toEqual({ tag: 'decision', id: 'root.policy.child' });
  });

  it('reads stable ids from #word, attributes.id, or metadata.id', () => {
    const dir = tmpDir();
    write(dir, 'ids.xnl', `
<decision #from.word>
<decision { id = "from.attributes" }>
<decision id = "from.metadata">
`);

    const registry = loadXnlRegistry(dir, decisionNodesOnly);
    expect([...registry.index.keys()]).toEqual([
      'from.word',
      'from.attributes',
      'from.metadata',
    ]);
    expect(readStableNodeId(registry.index.get('from.word')!.node)).toBe('from.word');
  });

  it('safe-loads valid files while reporting syntax, duplicate-id, and missing-id issues', () => {
    const dir = tmpDir();
    write(dir, 'a-first.xnl', '<decision #same.id { status = "accepted" }>');
    write(dir, 'b-invalid.xnl', '<decision #broken');
    write(dir, 'c-duplicate.xnl', '<decision #same.id { status = "resolved" }>');
    write(dir, 'd-missing.xnl', '<decision { status = "accepted" }>');

    const { registry, issues } = loadXnlRegistrySafe(dir, decisionNodesOnly);

    expect(registry.index.get('same.id')!.file).toBe('a-first.xnl');
    expect(registry.files.has('b-invalid.xnl')).toBe(false);
    expect(issues.map((issue) => issue.kind)).toEqual([
      'syntax',
      'duplicate-id',
      'missing-id',
    ]);
    expect(issues[0].file).toBe('b-invalid.xnl');
    expect(issues[0].line).toBeGreaterThanOrEqual(1);
    expect(issues[1]).toMatchObject({
      file: 'c-duplicate.xnl',
      otherFile: 'a-first.xnl',
      id: 'same.id',
    });
    expect(issues[2]).toMatchObject({
      file: 'd-missing.xnl',
      nodeTag: 'decision',
    });
  });

  it('throwing load rejects duplicate stable ids with both owner files', () => {
    const dir = tmpDir();
    write(dir, 'a.xnl', '<decision #same.id>');
    write(dir, 'nested/b.xnl', '<decision #same.id>');

    expect(() => loadXnlRegistry(dir, decisionNodesOnly)).toThrow(
      /Duplicate decision node id 'same\.id'.*nested\/b\.xnl.*a\.xnl/,
    );
  });
});

describe('generic full-fidelity XNL serializer', () => {
  it('preserves complete decision AST semantics across parse, serialize, and parse', () => {
    const fixtureRoot = path.resolve(
      import.meta.dir,
      '../../resources/archive-decision-registry/full-fidelity',
    );
    const sources = [
      path.join(fixtureRoot, 'decisions.xnl'),
      path.join(fixtureRoot, 'decisions/platform/runtime/conditional-activation.xnl'),
    ];

    for (const source of sources) {
      const parsed = parseXnl(fs.readFileSync(source, 'utf-8'), { textBlockStyle: true });
      let marker = 0;
      const serialized = serializeXnlFile(parsed.nodes, {
        textMarkerFactory: () => `ROUNDTRIP${++marker}`,
      });
      const reparsed = parseXnl(serialized, { textBlockStyle: true });

      expect(semanticAst(reparsed.nodes)).toEqual(semanticAst(parsed.nodes));
      expect(serialized.endsWith('\n')).toBe(true);
      expect(serializeXnlFile(reparsed.nodes)).toBe(serialized);
    }
  });

  it('retains unknown attributes and extensions alongside nested decision semantics', () => {
    const source = `
<decision #registry.parent {
  status = "accepted"
  vendor_policy = { mode = "opaque" version = 3 }
  activation = { all = ["registry.prerequisite=enabled"] }
  derived_from = ["registry.prerequisite=enabled"]
}
(
  <question ?Q>Which representation?</?Q>
  <options { vendor_flag = true } [
    <option { key = "full" recommended = true }
    (
      <title ?T>Full XNL</?T>
    )>
  ]>
  <answer { channel = "confirmation" }
  (
    <raw-answer ?R>Use full XNL.</?R>
    <decision-text ?D>Preserve the entire AST.</?D>
    <vendor-extension { preserve = true }
    (
      <opaque ?O>sentinel</?O>
    )>
  )>
)
[
  <decision #registry.parent.child {
    status = "resolved"
    depends_on = ["registry.parent"]
  }>
]>
`;
    const parsed = parseXnl(source, { textBlockStyle: true });
    const serialized = serializeXnlFile(parsed.nodes);
    const reparsed = parseXnl(serialized, { textBlockStyle: true });

    expect(reparsed.nodes).toEqual(parsed.nodes);
    expect(serialized).toContain('vendor_policy');
    expect(serialized).toContain('<vendor-extension');
    expect(serialized).toContain('#registry.parent.child');
    expect(serialized).toContain('activation');
    expect(serialized).toContain('derived_from');
  });
});
