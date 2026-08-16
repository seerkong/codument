import {
  diffNodes,
  dryRunMutations,
  parseXnl,
  type DataElementNode,
  type XnlMutation,
} from 'xnl-core';
import type { SpecXmlNode } from '../utils/spec-xml';
import { parseBehaviorXnlContent, serializeBehaviorNode } from './resource';
import { serializeXnlFile } from '../xnl/registry';

export interface NativeBehaviorMutationResult {
  content: string;
  mutations: XnlMutation[];
}

export function applyNativeBehaviorMutations(
  baseContent: string,
  expectedBehavior: SpecXmlNode,
): NativeBehaviorMutationResult {
  const base = parseBehaviorRoot(baseContent);
  const expectedContent = serializeBehaviorNode(
    expectedBehavior,
    expectedBehavior.attrs.apiVersion || 'codument.tech/v1alpha1',
  );
  const expected = parseBehaviorRoot(expectedContent);
  const mutations = diffNodes(base, expected);
  const result = dryRunMutations(base, mutations, {
    verifyValueBefore: true,
    identityPolicy: 'allow-missing',
  });
  if (result.status === 'rejected') {
    const diagnostics = result.diagnostics
      .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
      .join('; ');
    throw new Error(`Native Behavior mutation batch rejected: ${diagnostics}`);
  }
  const nativeContent = serializeXnlFile([result.value]);
  const actualBehavior = parseBehaviorXnlContent(nativeContent);
  const expectedNormalized = parseBehaviorXnlContent(expectedContent);
  if (JSON.stringify(actualBehavior) !== JSON.stringify(expectedNormalized)) {
    const remaining = diffNodes(result.value, expected);
    const summary = remaining.map((mutation) => `${mutation.type}:${String(mutation.path)}`).join(', ');
    throw new Error(`Native Behavior mutation result diverged from the DSL model (${remaining.length} mutation(s) remain: ${summary})`);
  }
  return {
    content: serializeBehaviorNode(actualBehavior, actualBehavior.attrs.apiVersion),
    mutations,
  };
}

function parseBehaviorRoot(content: string): DataElementNode {
  parseBehaviorXnlContent(content);
  const parsed = parseXnl(content, { textBlockStyle: true });
  const root = parsed.nodes[0];
  if (
    !root
    || typeof root !== 'object'
    || Array.isArray(root)
    || !('kind' in root)
    || root.kind !== 'DataElement'
    || root.tag !== 'Behavior'
  ) {
    throw new Error('Behavior XNL must contain exactly one <Behavior> root.');
  }
  return root;
}
