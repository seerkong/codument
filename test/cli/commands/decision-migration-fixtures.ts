import * as fs from 'fs';
import * as path from 'path';
import { parseXnl } from 'xnl-core';
import type { DataElementNode, XnlNode } from 'xnl-core';

export type DecisionMigrationFixtureClassification =
  | 'archive-recoverable'
  | 'markdown-only'
  | 'missing-source'
  | 'ambiguous-id'
  | 'target-conflict';

export interface DecisionMigrationFixtureExpectation {
  name: string;
  classification: DecisionMigrationFixtureClassification;
  decisionId: string;
  legacyRelativePath: string;
  archiveId?: string;
  archiveSourceMatches: number;
  targetMatches: number;
  requiredLegacySentinels: string[];
  requiredArchiveSentinels?: string[];
}

export interface DecisionMigrationFixture {
  name: string;
  root: string;
  workspace: string;
  expected: DecisionMigrationFixtureExpectation;
}

export const DECISION_MIGRATION_FIXTURES_ROOT = path.resolve(
  __dirname,
  '../../resources/decision-migration-inventory',
);

export function recursiveFiles(root: string, extension?: string): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  const visit = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (!extension || entry.name.endsWith(extension)) {
        files.push(entryPath);
      }
    }
  };
  visit(root);
  return files.sort();
}

export function decisionNodeId(node: DataElementNode): string | undefined {
  if (!node.id) return undefined;
  return [...node.id.namespace, node.id.name].join('.');
}

export function decisionIdsInFile(file: string): string[] {
  const ids: string[] = [];
  const visit = (node: XnlNode): void => {
    if (!node || typeof node !== 'object' || (node as DataElementNode).kind !== 'DataElement') {
      return;
    }
    const element = node as DataElementNode;
    if (element.tag === 'decision') {
      const id = decisionNodeId(element);
      if (id) ids.push(id);
    }
    for (const child of element.body ?? []) visit(child);
  };
  const parsed = parseXnl(fs.readFileSync(file, 'utf-8'), { textBlockStyle: true });
  for (const node of parsed.nodes) visit(node);
  return ids;
}

export function findArchiveDirectories(workspace: string, archiveId: string): string[] {
  const archivesRoot = path.join(workspace, 'codument', 'tracks', 'archived');
  if (!fs.existsSync(archivesRoot)) return [];
  const matches: string[] = [];
  const visit = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const entryPath = path.join(current, entry.name);
      if (entry.name === archiveId) matches.push(entryPath);
      visit(entryPath);
    }
  };
  visit(archivesRoot);
  return matches.sort();
}

export function countArchiveDecisionMatches(fixture: DecisionMigrationFixture): number {
  const archiveId = fixture.expected.archiveId;
  if (!archiveId) return 0;
  return findArchiveDirectories(fixture.workspace, archiveId)
    .flatMap(dir => recursiveFiles(dir, '.xnl'))
    .flatMap(decisionIdsInFile)
    .filter(id => id === fixture.expected.decisionId)
    .length;
}

export function countTargetDecisionMatches(fixture: DecisionMigrationFixture): number {
  const registryRoot = path.join(fixture.workspace, 'codument', 'decisions');
  return recursiveFiles(registryRoot, '.xnl')
    .flatMap(decisionIdsInFile)
    .filter(id => id === fixture.expected.decisionId)
    .length;
}

export function loadDecisionMigrationFixtures(): DecisionMigrationFixture[] {
  return fs.readdirSync(DECISION_MIGRATION_FIXTURES_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const root = path.join(DECISION_MIGRATION_FIXTURES_ROOT, entry.name);
      return {
        name: entry.name,
        root,
        workspace: path.join(root, 'workspace'),
        expected: JSON.parse(
          fs.readFileSync(path.join(root, 'expected.json'), 'utf-8'),
        ) as DecisionMigrationFixtureExpectation,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}
