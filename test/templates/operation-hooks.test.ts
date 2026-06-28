import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { parseSpecXmlContent, type SpecXmlNode } from '../../src/cli/utils/spec-xml';

const ROOT = path.resolve(__dirname, '..', '..');
const OPERATION_EXCLUDES = new Set(['README.md', '_operation-spec.md']);

function childrenByTag(node: SpecXmlNode, tag: string): SpecXmlNode[] {
  return node.children.filter((child) => child.tag === tag);
}

function descendants(node: SpecXmlNode, pred: (n: SpecXmlNode) => boolean, acc: SpecXmlNode[] = []): SpecXmlNode[] {
  for (const child of node.children) {
    if (pred(child)) {
      acc.push(child);
    }
    descendants(child, pred, acc);
  }
  return acc;
}

function operationNames(): Set<string> {
  const dir = path.join(ROOT, 'src', 'templates', 'codument', 'std', 'operations');
  return new Set(fs.readdirSync(dir)
    .filter((file) => file.endsWith('.md') && !OPERATION_EXCLUDES.has(file))
    .map((file) => file.replace(/\.md$/, '')));
}

function operationHooks(): SpecXmlNode {
  const file = path.join(ROOT, 'src', 'templates', 'codument', 'config', 'operation-hooks.xml');
  return parseSpecXmlContent(fs.readFileSync(file, 'utf-8'));
}

describe('codument operation hook template', () => {
  it('uses only official operation names and matching hook prefixes', () => {
    const operations = operationNames();
    const root = operationHooks();
    expect(root.tag).toBe('OperationHooks');

    for (const operation of childrenByTag(root, 'Operation')) {
      const name = operation.attrs.name;
      expect(operations.has(name), `${name} is not a std operation`).toBe(true);

      for (const hook of descendants(operation, (node) => node.tag === 'Hook')) {
        const on = hook.attrs.on;
        expect(on, `${name} hook is missing on`).toBeTruthy();
        expect(on.startsWith(`${name}:`), `${name} hook ${on} must use the operation name as prefix`).toBe(true);
      }
    }
  });

  it('runs coding attractor checks before plan-track and plan-mission by default', () => {
    const root = operationHooks();
    const planOps = childrenByTag(root, 'Operation').filter((op) =>
      op.attrs.name === 'plan-track' || op.attrs.name === 'plan-mission'
    );

    expect(planOps.map((op) => op.attrs.name).sort()).toEqual(['plan-mission', 'plan-track']);

    for (const operation of planOps) {
      const hook = descendants(operation, (node) => node.tag === 'Hook')
        .find((node) => node.attrs.on === `${operation.attrs.name}:before`);
      expect(hook, `${operation.attrs.name} must have a before hook`).toBeTruthy();

      const attractorCheck = hook
        ? descendants(hook, (node) => node.tag === 'cdt:AttractorCheck')[0]
        : undefined;
      expect(attractorCheck?.attrs.use).toBe('coding');
    }
  });
});
