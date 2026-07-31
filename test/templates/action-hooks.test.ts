import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { parseSpecXmlContent, type SpecXmlNode } from '../../src/cli/utils/spec-xml';

const ROOT = path.resolve(__dirname, '..', '..');
const ACTION_EXCLUDES = new Set(['README.md', '_action-spec.md']);

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

function actionNames(): Set<string> {
  const dir = path.join(ROOT, 'src', 'templates', 'codument', 'std', 'actions');
  return new Set(fs.readdirSync(dir)
    .filter((file) => file.endsWith('.md') && !ACTION_EXCLUDES.has(file))
    .map((file) => file.replace(/\.md$/, '')));
}

function actionHooks(): SpecXmlNode {
  const file = path.join(ROOT, 'src', 'templates', 'codument', 'config', 'action-hooks.xml');
  return parseSpecXmlContent(fs.readFileSync(file, 'utf-8'));
}

function currentActionHooksText(): string {
  return fs.readFileSync(path.join(ROOT, 'codument', 'config', 'action-hooks.xml'), 'utf-8');
}

describe('codument action hook template', () => {
  it('uses only official action names and matching hook prefixes', () => {
    const actions = actionNames();
    const root = actionHooks();
    expect(root.tag).toBe('ActionHooks');

    for (const action of childrenByTag(root, 'Action')) {
      const name = action.attrs.name;
      expect(actions.has(name), `${name} is not a std action`).toBe(true);

      for (const hook of descendants(action, (node) => node.tag === 'Hook')) {
        const on = hook.attrs.on;
        expect(on, `${name} hook is missing on`).toBeTruthy();
        expect(on.startsWith(`${name}:`), `${name} hook ${on} must use the action name as prefix`).toBe(true);
      }
    }
  });

  it('does not run fresh attractor checks by default', () => {
    const root = actionHooks();
    expect(descendants(root, (node) => node.tag === 'cdt:AttractorCheck')).toHaveLength(0);
    expect(childrenByTag(root, 'Action').map((action) => action.attrs.name).sort()).toEqual([
      'archive-track',
      'gap-loop',
    ]);
  });

  it('keeps planning before hooks out of the current dogfood config', () => {
    const config = currentActionHooksText();
    expect(config).not.toContain('plan-track:before');
    expect(config).not.toContain('plan-mission:before');
  });
});
