import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { codumentExists } from '../utils';
import { GENERATED_KIND_DEFINITIONS } from './generated';
import { behaviorPatchSkeleton } from '../behavior/patch-resource';

export type CodumentResourceKind = keyof typeof GENERATED_KIND_DEFINITIONS;

export function getKindDefinition(kind: string) {
  return GENERATED_KIND_DEFINITIONS[kind as CodumentResourceKind];
}

export function supportsApiVersion(kind: string, apiVersion: string): boolean {
  const definition = getKindDefinition(kind);
  return Boolean(definition && (definition.supportedApiVersions as readonly string[]).includes(apiVersion));
}

export const CODUMENT_API_VERSION = GENERATED_KIND_DEFINITIONS.Track.currentApiVersion;

export type ScaffoldKind = 'Track' | 'Mission';
export type ScaffoldStage = 'pending' | 'active';

export interface ScaffoldKindDefinition {
  kind: ScaffoldKind;
  format: 'xml' | 'xnl';
  currentApiVersion: string;
  stages: readonly ScaffoldStage[];
  collection: 'tracks' | 'missions';
  entryFile: 'track.xnl' | 'mission.xnl';
}

export const KIND_DEFINITIONS: Readonly<Record<ScaffoldKind, ScaffoldKindDefinition>> = Object.freeze({
  Track: Object.freeze({
    kind: 'Track', format: 'xnl', currentApiVersion: GENERATED_KIND_DEFINITIONS.Track.currentApiVersion,
    stages: ['pending', 'active'] as const, collection: 'tracks', entryFile: 'track.xnl',
  }),
  Mission: Object.freeze({
    kind: 'Mission', format: 'xnl', currentApiVersion: GENERATED_KIND_DEFINITIONS.Mission.currentApiVersion,
    stages: ['pending', 'active'] as const, collection: 'missions', entryFile: 'mission.xnl',
  }),
});

export interface ScaffoldResult {
  kind: ScaffoldKind;
  id: string;
  stage: ScaffoldStage;
  apiVersion: string;
  directory: string;
  files: string[];
}

export function scaffoldKind(kind: ScaffoldKind, id: string, stage: ScaffoldStage): ScaffoldResult {
  if (!codumentExists()) throw new Error('Codument is not initialized. Run codument init first.');
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`Invalid ${kind} id '${id}': expected lowercase kebab-case`);
  }
  const definition = KIND_DEFINITIONS[kind];
  if (!definition.stages.includes(stage)) {
    throw new Error(`Invalid ${kind} stage '${stage}': expected pending or active`);
  }
  const directory = path.join('codument', definition.collection, stage, id);
  if (fs.existsSync(directory)) throw new Error(`${kind} '${id}' already exists in ${directory}`);

  fs.mkdirSync(directory, { recursive: true });
  const timestamp = new Date().toISOString();
  const gitHead = kind === 'Track' ? currentGitHead() : undefined;
  const resource = kind === 'Track'
    ? trackSkeleton(id, stage, timestamp, definition.currentApiVersion, gitHead)
    : missionSkeleton(id, stage, timestamp, definition.currentApiVersion);
  const files = [definition.entryFile, 'proposal.md', 'design.md'];
  fs.writeFileSync(path.join(directory, definition.entryFile), resource, 'utf8');
  fs.writeFileSync(path.join(directory, 'proposal.md'), `# ${kind}: ${id}\n`, 'utf8');
  fs.writeFileSync(path.join(directory, 'design.md'), `# Design: ${id}\n`, 'utf8');
  return { kind, id, stage, apiVersion: definition.currentApiVersion, directory, files };
}

export function scaffoldBehaviorPatch(trackId: string, capability: string): ScaffoldResult {
  if (!codumentExists()) throw new Error('Codument is not initialized. Run codument init first.');
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(trackId)) {
    throw new Error(`Invalid Track id '${trackId}': expected lowercase kebab-case`);
  }
  if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/.test(capability)) {
    throw new Error(`Invalid BehaviorPatch capability '${capability}': expected lowercase kebab or dotted name`);
  }
  const locations = (['pending', 'active'] as const)
    .map((stage) => ({ stage, directory: path.join('codument', 'tracks', stage, trackId) }))
    .filter((candidate) => fs.existsSync(candidate.directory));
  if (locations.length !== 1) {
    throw new Error(locations.length === 0
      ? `Track '${trackId}' was not found in pending or active`
      : `Track '${trackId}' has ambiguous pending and active authorities`);
  }
  const owner = locations[0];
  const directory = path.join(owner.directory, 'behavior_deltas', capability);
  const target = path.join(directory, 'delta.xnl');
  if (fs.existsSync(target) || fs.existsSync(path.join(directory, 'delta.xml'))) {
    throw new Error(`BehaviorPatch '${capability}' already exists for Track '${trackId}'`);
  }
  fs.mkdirSync(directory, { recursive: true });
  const apiVersion = GENERATED_KIND_DEFINITIONS.BehaviorPatch.currentApiVersion;
  fs.writeFileSync(target, behaviorPatchSkeleton(trackId, capability, apiVersion), 'utf8');
  return {
    kind: 'Track', id: trackId, stage: owner.stage, apiVersion, directory,
    files: ['delta.xnl'],
  };
}

function trackSkeleton(id: string, stage: ScaffoldStage, timestamp: string, apiVersion: string, gitHead?: string): string {
  const status = stage === 'active' ? 'in_progress' : 'new';
  const mergeBases = gitHead
    ? `  modeling_base_commit = "${gitHead}"\n  engineering_base_commit = "${gitHead}"\n`
    : '';
  return `<Track #${id} apiVersion="${apiVersion}" version="1" {
  status = "${status}"
  goal = "To be authored by codument-plan-track."
  description = "To be authored by codument-plan-track."
  question_mode = "decision-tree"
  question_severity = "auto"
  commit_mode = "manual"
  created_at = "${timestamp}"
  updated_at = "${timestamp}"
${mergeBases.trimEnd()}
} (
  <Ports { scope = "track" }>
  <TaskSpace #space_${id} { name = "${id}" version = "1" } (
    <SubNodes []>
  )>
  <Schedule []>
  <Hooks []>
)>
`;
}

function currentGitHead(): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || undefined;
  } catch {
    return undefined;
  }
}

function missionSkeleton(id: string, stage: ScaffoldStage, timestamp: string, apiVersion: string): string {
  return `<Mission #${id} apiVersion="${apiVersion}" version="1" {
  status = "${stage}"
  goal = "To be authored by codument-plan-mission."
  description = "To be authored by codument-plan-mission."
  question_mode = "decision-tree"
  question_severity = "auto"
  revision = 1
  created_at = "${timestamp}"
  updated_at = "${timestamp}"
} (
  <Ports { scope = "mission" }>
  <ProjectRefs [
    <ProjectRef #host { kind = "host" }>
  ]>
  <ActorSets { default = "default-control-loop" } [
    <ActorSet #default-control-loop [
      <Actor { role = "MissionPlanner" project_ref = "host" } (<Description ?>Plan tracks for ${id}.</?>)>
      <Actor { role = "MissionObserver" project_ref = "host" } (<Description ?>Observe project evidence for ${id}.</?>)>
      <Actor { role = "MissionReconciler" project_ref = "host" } (<Description ?>Reconcile mission state for ${id}.</?>)>
      <Actor { role = "MissionApplier" project_ref = "host" } (<Description ?>Apply mission operations for ${id}.</?>)>
    ]>
  ]>
  <TaskSpace #space_${id} { name = "${id}" version = "1" child_mode = "dag" } (
    <SubNodes []>
  )>
  <Schedule []>
  <Hooks []>
)>
`;
}
