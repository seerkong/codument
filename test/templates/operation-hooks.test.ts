import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { parseConfigRoot } from '../../src/cli/config/resource';
import { wordToString, type DataElementNode, type XnlNode } from 'xnl-core';

const ROOT = path.resolve(__dirname, '..', '..');
const OPERATION_EXCLUDES = new Set(['README.md', '_operation-spec.md']);

function data(value: XnlNode | undefined): DataElementNode | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) && 'kind' in value && value.kind === 'DataElement'
    ? value
    : undefined;
}

function operationNames(): Set<string> {
  const dir = path.join(ROOT, 'src', 'templates', 'codument', 'std', 'operations');
  return new Set(fs.readdirSync(dir)
    .filter((file) => file.endsWith('.md') && !OPERATION_EXCLUDES.has(file))
    .map((file) => file.replace(/\.md$/, '')));
}

function operationHooks(): DataElementNode[] {
  const file = path.join(ROOT, 'src', 'templates', 'codument', 'config', 'operation-hooks.xnl');
  const root = parseConfigRoot(file, 'OperationHooks');
  return data(root.extend?.children.Operations)?.body?.map(data).filter(Boolean) as DataElementNode[];
}

function currentOperationHooksText(): string {
  const xnl = path.join(ROOT, 'codument', 'config', 'operation-hooks.xnl');
  const file = fs.existsSync(xnl) ? xnl : path.join(ROOT, 'codument', 'config', 'operation-hooks.xml');
  return fs.readFileSync(file, 'utf-8');
}

describe('codument operation hook template', () => {
  it('uses only official operation names and matching hook prefixes', () => {
    const operations = operationNames();
    const configured = operationHooks();

    for (const operation of configured) {
      const name = wordToString(operation.id) ?? '';
      expect(operations.has(name), `${name} is not a std operation`).toBe(true);

      const hooks = data(operation.extend?.children.Hooks)?.body?.map(data).filter(Boolean) as DataElementNode[] ?? [];
      for (const hook of hooks) {
        const on = String(hook.attributes?.on ?? '');
        expect(on, `${name} hook is missing on`).toBeTruthy();
        expect(on.startsWith(`${name}:`), `${name} hook ${on} must use the operation name as prefix`).toBe(true);
      }
    }
  });

  it('does not run fresh attractor checks by default', () => {
    const configured = operationHooks();
    expect(JSON.stringify(configured)).not.toContain('AttractorCheck');
    expect(configured.map((operation) => wordToString(operation.id)).sort()).toEqual([
      'gap-loop',
    ]);
  });

  it('keeps planning before hooks out of the current dogfood config', () => {
    const config = currentOperationHooksText();
    expect(config).not.toContain('plan-track:before');
    expect(config).not.toContain('plan-mission:before');
  });
});
