import * as fs from 'fs';
import * as path from 'path';
import { getSpecXmlStats, loadSpecXml, parseSpecXmlContent, type SpecXmlNode } from './spec-xml';

// Workspace directory (can be changed via --workspace-dir)
let workspaceDir = process.cwd();

/**
 * Set the workspace directory
 */
export function setWorkspaceDir(dir: string): void {
  workspaceDir = path.resolve(dir);
  process.chdir(workspaceDir);
}

/**
 * Get the workspace directory
 */
export function getWorkspaceDir(): string {
  return workspaceDir;
}

export const CODUMENT_DIR = 'codument';
export const TRACKS_DIR = path.join(CODUMENT_DIR, 'tracks');
export const PENDING_TRACKS_DIR = path.join(TRACKS_DIR, 'pending');
export const ACTIVE_TRACKS_DIR = path.join(TRACKS_DIR, 'active');
export const ARCHIVED_TRACKS_DIR = path.join(TRACKS_DIR, 'archived');
export const SPECS_DIR = path.join(CODUMENT_DIR, 'specs');
export const BEHAVIORS_DIR = path.join(CODUMENT_DIR, 'behaviors');
export const ATTRACTORS_DIR = path.join(CODUMENT_DIR, 'attractors');
export const CONFIG_DIR = path.join(CODUMENT_DIR, 'config');
export const DECISIONS_DIR = path.join(CODUMENT_DIR, 'decisions');
export const MEMORY_DIR = path.join(CODUMENT_DIR, 'memory');
export const LEGACY_DIR = path.join(CODUMENT_DIR, 'legacy');

export interface TrackMetadata {
  track_id: string;
  type: 'feature' | 'bug' | 'chore' | 'refactor';
  status: 'new' | 'in_progress' | 'completed' | 'cancelled';
  commit_mode?: 'auto' | 'manual';
  track_name?: string;
  goal?: string;
  created_at: string;
  updated_at: string;
  description: string;
}

export interface TaskSummary {
  total_phases: number;
  total_tasks: number;
  total_subtasks: number;
  total_estimated_days: number;
  completed: number;
  in_progress: number;
  todo: number;
  blocked: number;
  commit_mode?: 'auto' | 'manual';
  execution_mode?: 'wave' | 'sequential';
}

export interface Track {
  id: string;
  metadata: TrackMetadata;
  taskSummary?: TaskSummary;
}

export interface Spec {
  id: string;
  path: string;
  requirements: number;
  scenarios: number;
  format?: 'markdown' | 'xml';
}

function getPlanTrackStatus(planPath: string): TrackMetadata['status'] | undefined {
  try {
    const content = fs.readFileSync(planPath, 'utf-8');
    const statusMatch = content.match(/<metadata>[\s\S]*?<status>(new|in_progress|completed|cancelled)<\/status>/);
    return statusMatch ? statusMatch[1] as TrackMetadata['status'] : undefined;
  } catch (e) {
    return undefined;
  }
}

function getTagText(content: string, tag: string): string | undefined {
  const match = content.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? match[1].trim() : undefined;
}

function getMetadataBlock(content: string): string | undefined {
  return content.match(/<metadata>([\s\S]*?)<\/metadata>/)?.[1];
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function insertMetadataField(content: string, tag: string, value: string): string {
  const metadataEndIdx = content.indexOf('</metadata>');
  if (metadataEndIdx === -1) {
    return content;
  }

  return content.slice(0, metadataEndIdx) + `    <${tag}>${xmlEscape(value)}</${tag}>\n` + content.slice(metadataEndIdx);
}

function mergeLegacyMetadataIntoPlan(planPath: string, metadataPath: string): void {
  if (!fs.existsSync(metadataPath)) {
    return;
  }

  try {
    const legacy = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as Partial<TrackMetadata>;
    let content = fs.readFileSync(planPath, 'utf-8');

    for (const field of ['track_id', 'type', 'created_at', 'updated_at', 'description'] as const) {
      const legacyValue = legacy[field];
      const metadataBlock = getMetadataBlock(content) || '';
      if (legacyValue && !getTagText(metadataBlock, field)) {
        content = insertMetadataField(content, field, String(legacyValue));
      }
    }

    fs.writeFileSync(planPath, content, 'utf-8');
  } catch (e) {
    // Invalid legacy metadata should not prevent reading plan.xml.
  }
}

export function parsePlanMetadata(planPath: string, trackIdFallback?: string): TrackMetadata | null {
  try {
    const content = fs.readFileSync(planPath, 'utf-8');
    const metadataBlock = content.match(/<metadata>([\s\S]*?)<\/metadata>/)?.[1];
    if (!metadataBlock) {
      return null;
    }

    const status = getTagText(metadataBlock, 'status');
    const type = getTagText(metadataBlock, 'type');
    const commitMode = getTagText(metadataBlock, 'commit_mode');
    const trackId = getTagText(metadataBlock, 'track_id') || trackIdFallback;
    const createdAt = getTagText(metadataBlock, 'created_at');
    const updatedAt = getTagText(metadataBlock, 'updated_at') || createdAt;
    const description = getTagText(metadataBlock, 'description') || getTagText(metadataBlock, 'goal');

    if (!trackId || !type || !status || !createdAt || !updatedAt || !description) {
      return null;
    }

    return {
      track_id: trackId,
      track_name: getTagText(metadataBlock, 'track_name'),
      goal: getTagText(metadataBlock, 'goal'),
      type: type as TrackMetadata['type'],
      status: status as TrackMetadata['status'],
      commit_mode: commitMode === 'auto' || commitMode === 'manual' ? commitMode : undefined,
      created_at: createdAt,
      updated_at: updatedAt,
      description,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Check if codument directory exists
 */
export function codumentExists(): boolean {
  return fs.existsSync(CODUMENT_DIR);
}

/**
 * Get track directory IDs that contain a track.xml.
 */
export function getTrackIds(): string[] {
  if (!fs.existsSync(ACTIVE_TRACKS_DIR)) {
    return [];
  }

  return fs.readdirSync(ACTIVE_TRACKS_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .filter(trackId => fs.existsSync(path.join(ACTIVE_TRACKS_DIR, trackId, 'track.xml')));
}

// ---- track.xml readers (new XML standard) ----------------------------------

const SPARROW_DONE = new Set(['DONE']);
const SPARROW_ACTIVE = new Set(['ACTIVE', 'DELEGATED', 'FORWARDED']);
const SPARROW_BLOCKED = new Set(['REFUSED', 'ABANDONED']);

export function getActiveTrackDir(trackId: string): string {
  return path.join(ACTIVE_TRACKS_DIR, trackId);
}

export function getPendingTrackDir(trackId: string): string {
  return path.join(PENDING_TRACKS_DIR, trackId);
}

function trackXmlPath(trackId: string): string {
  return path.join(getActiveTrackDir(trackId), 'track.xml');
}

function parseTrackRoot(file: string): SpecXmlNode | null {
  try {
    const root = parseSpecXmlContent(fs.readFileSync(file, 'utf-8'));
    return root.tag === 'Track' ? root : null;
  } catch {
    return null;
  }
}

function childOf(node: SpecXmlNode | undefined, tag: string): SpecXmlNode | undefined {
  return node?.children.find((c) => c.tag === tag);
}
function childTextOf(node: SpecXmlNode | undefined, tag: string): string | undefined {
  return childOf(node, tag)?.text?.trim() || undefined;
}
function findAll(node: SpecXmlNode, pred: (n: SpecXmlNode) => boolean, acc: SpecXmlNode[] = []): SpecXmlNode[] {
  for (const c of node.children) {
    if (pred(c)) acc.push(c);
    findAll(c, pred, acc);
  }
  return acc;
}

/** Read track.xml <Metadata> into TrackMetadata (track.xml has no `type`; defaults to feature). */
export function parseTrackMetadata(file: string, trackIdFallback?: string): TrackMetadata | null {
  const root = parseTrackRoot(file);
  if (!root) return null;

  const id = root.attrs['id'] || trackIdFallback;
  if (!id) return null;
  const meta = childOf(root, 'Metadata');
  const status = (childTextOf(meta, 'Status') as TrackMetadata['status']) || 'new';
  const commit = childTextOf(meta, 'CommitMode');

  return {
    track_id: id,
    track_name: childTextOf(meta, 'Goal'),
    goal: childTextOf(meta, 'Goal'),
    type: 'feature',
    status,
    commit_mode: commit === 'auto' || commit === 'manual' ? commit : undefined,
    created_at: childTextOf(meta, 'CreatedAt') || '',
    updated_at: childTextOf(meta, 'UpdatedAt') || childTextOf(meta, 'CreatedAt') || '',
    description: childTextOf(meta, 'Description') || childTextOf(meta, 'Goal') || '',
  };
}

/** Count phases (first-level TaskGroups) and leaf Tasks by sparrow status. */
export function parseTrackSummary(file: string): TaskSummary | undefined {
  const root = parseTrackRoot(file);
  if (!root) return undefined;
  const space = childOf(root, 'TaskSpace');
  if (!space) return undefined;

  const firstLevel = childOf(space, 'SubNodes') ?? space;
  const total_phases = firstLevel.children.filter((c) => c.tag === 'TaskGroup').length;
  const leaves = findAll(space, (n) => n.tag === 'Task');

  let completed = 0, in_progress = 0, todo = 0, blocked = 0;
  for (const t of leaves) {
    const s = t.attrs['status'] || 'NOT_STARTED';
    if (SPARROW_DONE.has(s)) completed++;
    else if (SPARROW_ACTIVE.has(s)) in_progress++;
    else if (SPARROW_BLOCKED.has(s)) blocked++;
    else todo++;
  }

  return {
    total_phases,
    total_tasks: leaves.length,
    total_subtasks: 0,
    total_estimated_days: 0,
    completed,
    in_progress,
    todo,
    blocked,
    commit_mode: parseTrackMetadata(file)?.commit_mode,
  };
}

export interface TrackTaskInfo {
  phaseName: string;
  name: string;
  status: string;
}
/** Flat list of leaf tasks with their phase + sparrow status (for status display). */
export function walkTrackTasks(file: string): TrackTaskInfo[] {
  const root = parseTrackRoot(file);
  if (!root) return [];
  const space = childOf(root, 'TaskSpace');
  if (!space) return [];
  const firstLevel = childOf(space, 'SubNodes') ?? space;
  const out: TrackTaskInfo[] = [];
  for (const phase of firstLevel.children.filter((c) => c.tag === 'TaskGroup')) {
    const phaseName = phase.attrs['name'] || phase.attrs['id'] || '';
    for (const t of findAll(phase, (n) => n.tag === 'Task')) {
      out.push({ phaseName, name: t.attrs['name'] || t.attrs['id'] || '', status: t.attrs['status'] || 'NOT_STARTED' });
    }
  }
  return out;
}

/**
 * Get all tracks from tracks directory
 */
export function getTracks(): Track[] {
  const tracks: Track[] = [];
  for (const trackId of getTrackIds()) {
    const file = trackXmlPath(trackId);
    const metadata = parseTrackMetadata(file, trackId);
    if (metadata) {
      tracks.push({ id: trackId, metadata, taskSummary: parseTrackSummary(file) });
    }
  }
  return tracks;
}

/**
 * Get all specs from specs directory
 */
export function getSpecs(): Spec[] {
  if (!fs.existsSync(SPECS_DIR)) {
    return [];
  }

  const specs: Spec[] = [];

  for (const entry of fs.readdirSync(SPECS_DIR, { withFileTypes: true })) {
    const specId = entry.isFile() && entry.name.endsWith('.xml')
      ? entry.name.slice(0, -'.xml'.length)
      : entry.name;
    const entryPath = path.join(SPECS_DIR, entry.name);
    const markdownSpecPath = path.join(entryPath, 'spec.md');
    const folderXmlPath = path.join(entryPath, 'index.xml');

    if (entry.isDirectory() && fs.existsSync(markdownSpecPath)) {
      const content = fs.readFileSync(markdownSpecPath, 'utf-8');
      const requirements = (content.match(/^### Requirement:/gm) || []).length;
      const scenarios = (content.match(/^#### Scenario:/gm) || []).length;

      specs.push({
        id: specId,
        path: markdownSpecPath,
        requirements,
        scenarios,
        format: 'markdown',
      });
      continue;
    }

    if ((entry.isFile() && entry.name.endsWith('.xml')) || (entry.isDirectory() && fs.existsSync(folderXmlPath))) {
      try {
        const xmlPath = entry.isFile() ? entryPath : entryPath;
        const stats = getSpecXmlStats(loadSpecXml(xmlPath));
        specs.push({
          id: specId,
          path: entry.isFile() ? entryPath : folderXmlPath,
          requirements: stats.requirements,
          scenarios: stats.scenarios,
          format: 'xml',
        });
      } catch {
        specs.push({
          id: specId,
          path: entry.isFile() ? entryPath : folderXmlPath,
          requirements: 0,
          scenarios: 0,
          format: 'xml',
        });
      }
    }
  }

  return specs;
}

/**
 * Parse plan.xml summary section (supports new XML format)
 */
export function parsePlanSummary(planPath: string): TaskSummary | undefined {
  try {
    const content = fs.readFileSync(planPath, 'utf-8');

    // Helper to get tag value from summary section
    const getTagValue = (tag: string): number => {
      const tagMatch = content.match(new RegExp(`<${tag}>(\\d+)</${tag}>`));
      return tagMatch ? parseInt(tagMatch[1], 10) : 0;
    };

    // Helper to get commit_mode from metadata
    const getCommitMode = (): 'auto' | 'manual' | undefined => {
      const modeMatch = content.match(/<commit_mode>(auto|manual)<\/commit_mode>/);
      return modeMatch ? modeMatch[1] as 'auto' | 'manual' : undefined;
    };

    // Helper to get execution_mode
    const getExecutionMode = (): 'wave' | 'sequential' => {
      const modeMatch = content.match(/<execution_mode>(wave|sequential)<\/execution_mode>/);
      return modeMatch ? modeMatch[1] as 'wave' | 'sequential' : 'sequential';
    };

    // If summary section exists, use it
    if (content.includes('<summary>')) {
      return {
        total_phases: getTagValue('total_phases'),
        total_tasks: getTagValue('total_tasks'),
        total_subtasks: getTagValue('total_subtasks'),
        total_estimated_days: getTagValue('total_estimated_days'),
        completed: getTagValue('completed'),
        in_progress: getTagValue('in_progress'),
        todo: getTagValue('todo'),
        blocked: getTagValue('blocked'),
        commit_mode: getCommitMode(),
        execution_mode: getExecutionMode(),
      };
    }

    // Otherwise, compute from task attributes (new format: status in attributes)
    const taskStatusMatches = content.matchAll(/<task[^>]+status="([^"]+)"[^>]*>/g);
    const subtaskStatusMatches = content.matchAll(/<subtask\s+[^>]*status="([^"]+)"[^>]*(?:\/>|>)/g);
    const phaseMatches = content.matchAll(/<phase[^>]+id="[^"]+"[^>]*>/g);

    let completed = 0;
    let in_progress = 0;
    let todo = 0;
    let blocked = 0;
    let total_tasks = 0;
    let total_subtasks = 0;

    // Count tasks
    for (const taskStatusMatch of taskStatusMatches) {
      total_tasks++;
      const status = taskStatusMatch[1];
      if (status === 'DONE') completed++;
      else if (status === 'IN_PROGRESS') in_progress++;
      else if (status === 'TODO') todo++;
      else if (status === 'BLOCKED') blocked++;
    }

    // Count subtasks
    total_subtasks = [...subtaskStatusMatches].length;

    // Count phases
    const total_phases = [...phaseMatches].length;

    return {
      total_phases,
      total_tasks,
      total_subtasks,
      total_estimated_days: 0, // Cannot compute without parsing estimated_days attributes
      completed,
      in_progress,
      todo,
      blocked,
      commit_mode: getCommitMode(),
      execution_mode: getExecutionMode(),
    };
  } catch (e) {
    return undefined;
  }
}

/**
 * Get track by ID (reads track.xml).
 */
export function getTrack(trackId: string): Track | null {
  const file = trackXmlPath(trackId);
  if (!fs.existsSync(file)) {
    return null;
  }
  const metadata = parseTrackMetadata(file, trackId);
  if (!metadata) {
    return null;
  }
  return {
    id: trackId,
    metadata,
    taskSummary: parseTrackSummary(file),
  };
}

/**
 * Parse command line arguments
 */
export function parseOptions(args: string[]): { positional: string[]; options: Record<string, string | boolean> } {
  const positional: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const equalsIndex = arg.indexOf('=');
      if (equalsIndex !== -1) {
        const key = arg.slice(2, equalsIndex);
        options[key] = arg.slice(equalsIndex + 1);
        continue;
      }

      const key = arg.slice(2);
      const nextArg = args[i + 1];

      if (nextArg && !nextArg.startsWith('-')) {
        options[key] = nextArg;
        i++;
      } else {
        options[key] = true;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      options[key] = true;
    } else {
      positional.push(arg);
    }
  }

  return { positional, options };
}

/**
 * Format status badge
 */
export function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'new': '[ ]',
    'in_progress': '[~]',
    'completed': '[x]',
    'cancelled': '[-]',
    'TODO': '[ ]',
    'IN_PROGRESS': '[~]',
    'DONE': '[x]',
    'BLOCKED': '[!]',
  };
  return statusMap[status] || `[${status}]`;
}

/**
 * Task detail interface
 */
export interface TaskDetail {
  id: string;
  name: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED' | 'CANCELLED';
  priority: 'P0' | 'P1' | 'P2';
  description: string;
  estimated_days?: number;
  commit?: string;
  wave?: string;
  acceptance_criteria?: { id: string; text: string; checked: boolean }[];
  subtasks?: SubtaskDetail[];
}

export interface SubtaskDetail {
  id: string;
  name: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED' | 'CANCELLED';
  estimated_hours?: number;
  detail_ref?: string;
  children?: SubtaskDetail[];
}

export interface WaveInfo {
  id: string;
  depends_on: string[];
}

export interface PhaseDetail {
  id: string;
  name: string;
  goal: string;
  milestone?: string;
  estimated_days?: number;
  tasks: TaskDetail[];
  gate_criteria?: string[];
  waves?: WaveInfo[];
  context_files?: string[];
}

interface ParsedSubtaskNode {
  attrs: string;
  innerContent?: string;
}

function findFirstBalancedTag(
  content: string,
  tagName: string,
): { start: number; end: number; inner: string } | undefined {
  const openTag = `<${tagName}>`;
  const closeTag = `</${tagName}>`;

  const start = content.indexOf(openTag);
  if (start === -1) {
    return undefined;
  }

  let depth = 1;
  let cursor = start + openTag.length;

  while (depth > 0) {
    const nextOpen = content.indexOf(openTag, cursor);
    const nextClose = content.indexOf(closeTag, cursor);

    if (nextClose === -1) {
      return undefined;
    }

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      cursor = nextOpen + openTag.length;
      continue;
    }

    depth--;
    if (depth === 0) {
      const closeEnd = nextClose + closeTag.length;
      return {
        start,
        end: closeEnd,
        inner: content.slice(start + openTag.length, nextClose),
      };
    }

    cursor = nextClose + closeTag.length;
  }

  return undefined;
}

function parseSubtaskNodes(subtasksContent: string): ParsedSubtaskNode[] {
  const nodes: ParsedSubtaskNode[] = [];
  let cursor = 0;

  const findNextSubtaskOpen = (from: number): number => {
    let idx = subtasksContent.indexOf('<subtask', from);
    while (idx !== -1) {
      const nextChar = subtasksContent[idx + '<subtask'.length];
      if (nextChar === ' ' || nextChar === '\t' || nextChar === '\n' || nextChar === '\r') {
        return idx;
      }
      idx = subtasksContent.indexOf('<subtask', idx + 1);
    }
    return -1;
  };

  while (true) {
    const openIdx = findNextSubtaskOpen(cursor);
    if (openIdx === -1) {
      break;
    }

    const tagEndIdx = subtasksContent.indexOf('>', openIdx);
    if (tagEndIdx === -1) {
      break;
    }

    const openingTag = subtasksContent.slice(openIdx, tagEndIdx + 1);
    const attrsMatch = openingTag.match(/<subtask\s+([^>]*?)(?:\/)?\s*>/);
    const attrs = attrsMatch ? attrsMatch[1] : '';
    const selfClosing = /\/\s*>$/.test(openingTag);

    if (selfClosing) {
      nodes.push({ attrs });
      cursor = tagEndIdx + 1;
      continue;
    }

    let depth = 1;
    let searchFrom = tagEndIdx + 1;
    let closeIdx = -1;

    while (depth > 0) {
      const nextOpen = findNextSubtaskOpen(searchFrom);
      const nextClose = subtasksContent.indexOf('</subtask>', searchFrom);

      if (nextClose === -1) {
        break;
      }

      if (nextOpen !== -1 && nextOpen < nextClose) {
        const nextOpenEnd = subtasksContent.indexOf('>', nextOpen);
        if (nextOpenEnd === -1) {
          break;
        }

        const nextOpenTag = subtasksContent.slice(nextOpen, nextOpenEnd + 1);
        const nextSelfClosing = /\/\s*>$/.test(nextOpenTag);
        if (!nextSelfClosing) {
          depth++;
        }

        searchFrom = nextOpenEnd + 1;
        continue;
      }

      depth--;
      closeIdx = nextClose;
      searchFrom = nextClose + '</subtask>'.length;
    }

    if (closeIdx === -1 || depth !== 0) {
      cursor = tagEndIdx + 1;
      continue;
    }

    nodes.push({
      attrs,
      innerContent: subtasksContent.slice(tagEndIdx + 1, closeIdx),
    });

    cursor = closeIdx + '</subtask>'.length;
  }

  return nodes;
}

/**
 * Recursively parse subtasks (supports both self-closing and open/close tags)
 */
function parseSubtasks(subtasksContent: string): SubtaskDetail[] {
  const results: SubtaskDetail[] = [];

  const subtaskNodes = parseSubtaskNodes(subtasksContent);

  for (const node of subtaskNodes) {
    const attrs = node.attrs;
    const innerContent = node.innerContent; // undefined for self-closing

    const id = attrs.match(/id="([^"]+)"/)?.[1] ?? '';
    const name = attrs.match(/name="([^"]+)"/)?.[1] ?? '';
    const status = attrs.match(/status="([^"]+)"/)?.[1] ?? 'TODO';
    const estHours = attrs.match(/estimated_hours="(\d+)"/)?.[1];

    const subtask: SubtaskDetail = {
      id,
      name,
      status: status as SubtaskDetail['status'],
      estimated_hours: estHours ? parseInt(estHours, 10) : undefined,
    };

    if (innerContent) {
      // Extract nested subtasks (balanced)
      const nestedSubtasksTag = findFirstBalancedTag(innerContent, 'subtasks');

      // Extract detail_ref from current level (exclude nested subtasks content)
      const detailRefSearchContent = nestedSubtasksTag
        ? innerContent.slice(0, nestedSubtasksTag.start) + innerContent.slice(nestedSubtasksTag.end)
        : innerContent;
      const detailRefMatch = detailRefSearchContent.match(/<detail_ref>([^<]+)<\/detail_ref>/);
      if (detailRefMatch) {
        subtask.detail_ref = detailRefMatch[1].trim();
      }

      // Recursively parse nested subtasks
      if (nestedSubtasksTag) {
        const children = parseSubtasks(nestedSubtasksTag.inner);
        if (children.length > 0) {
          subtask.children = children;
        }
      }
    }

    results.push(subtask);
  }

  return results;
}

/**
 * Parse task details from plan.xml
 */
export function parseTaskDetails(planPath: string): PhaseDetail[] {
  try {
    const content = fs.readFileSync(planPath, 'utf-8');
    const phases: PhaseDetail[] = [];

    // Match all phase elements
    const phaseRegex = /<phase\s+id="([^"]+)"\s+name="([^"]+)"(?:\s+milestone="([^"]+)")?[^>]*>([\s\S]*?)<\/phase>/g;
    let phaseMatch;

    while ((phaseMatch = phaseRegex.exec(content)) !== null) {
      const [, phaseId, phaseName, milestone, phaseContent] = phaseMatch;

      // Extract phase goal
      const goalMatch = phaseContent.match(/<goal>([\s\S]*?)<\/goal>/);
      const goal = goalMatch ? goalMatch[1].trim() : '';

      // Extract estimated_days
      const estDaysMatch = phaseContent.match(/<estimated_days>(\d+)<\/estimated_days>/);
      const estimated_days = estDaysMatch ? parseInt(estDaysMatch[1], 10) : undefined;

      // Extract gate criteria
      const gateMatch = phaseContent.match(/<gate_criteria>([\s\S]*?)<\/gate_criteria>/);
      let gate_criteria: string[] | undefined;
      if (gateMatch) {
        const criterionMatches = gateMatch[1].matchAll(/<criterion>([^<]+)<\/criterion>/g);
        gate_criteria = [...criterionMatches].map(m => m[1].trim());
      }

      // Extract waves DAG
      const wavesMatch = phaseContent.match(/<waves>([\s\S]*?)<\/waves>/);
      let waves: WaveInfo[] | undefined;
      if (wavesMatch) {
        const waveMatches = wavesMatch[1].matchAll(/<wave\s+id="([^"]+)"(?:\s+depends_on="([^"]*)")?[^/]*\/>/g);
        waves = [...waveMatches].map(m => ({
          id: m[1],
          depends_on: m[2] ? m[2].split(',').map(d => d.trim()).filter(Boolean) : [],
        }));
      }

      // Extract context_files
      const ctxMatch = phaseContent.match(/<context_files>([\s\S]*?)<\/context_files>/);
      let context_files: string[] | undefined;
      if (ctxMatch) {
        const fileMatches = ctxMatch[1].matchAll(/<file>([^<]+)<\/file>/g);
        context_files = [...fileMatches].map(m => m[1].trim());
      }

      // Parse tasks
      const tasks: TaskDetail[] = [];
      const taskRegex = /<task\s+([^>]+)>([\s\S]*?)<\/task>/g;
      let taskMatch;

      while ((taskMatch = taskRegex.exec(phaseContent)) !== null) {
        const [, taskAttrs, taskContent] = taskMatch;

        // Extract task attributes
        const taskId = taskAttrs.match(/id="([^"]+)"/)?.[1] ?? '';
        const taskName = taskAttrs.match(/name="([^"]+)"/)?.[1] ?? '';
        const taskStatus = taskAttrs.match(/status="([^"]+)"/)?.[1] ?? 'TODO';
        const taskPriority = taskAttrs.match(/priority="([^"]+)"/)?.[1] ?? 'P2';
        const taskWave = taskAttrs.match(/wave="([^"]+)"/)?.[1];
        const commitAttr = taskAttrs.match(/commit="([^"]+)"/)?.[1];
        const estDaysAttr = taskAttrs.match(/estimated_days="([^"]+)"/)?.[1];

        // Extract description
        // Preferred: <description>...</description>
        // Backward-compatible: raw text content before first child element
        const descriptionTagMatch = taskContent.match(/<description>([\s\S]*?)<\/description>/);
        let description = '';
        if (descriptionTagMatch) {
          description = descriptionTagMatch[1].trim();
        } else {
          const descMatch = taskContent.match(/^\s*([^<]+)/);
          description = descMatch ? descMatch[1].trim() : '';
        }

        // Extract acceptance criteria
        const acMatch = taskContent.match(/<acceptance_criteria>([\s\S]*?)<\/acceptance_criteria>/);
        let acceptance_criteria: { id: string; text: string; checked: boolean }[] | undefined;
        if (acMatch) {
          const criterionMatches = acMatch[1].matchAll(/<criterion\s+id="([^"]+)"\s+checked="([^"]+)">([^<]+)<\/criterion>/g);
          acceptance_criteria = [...criterionMatches].map(m => ({
            id: m[1],
            text: m[3].trim(),
            checked: m[2] === 'true',
          }));
        }

        // Extract subtasks (use balanced matching for nested subtasks)
        const subtasksStartIdx = taskContent.indexOf('<subtasks>');
        let subtasks: SubtaskDetail[] | undefined;
        if (subtasksStartIdx !== -1) {
          const subtasksEndIdx = taskContent.lastIndexOf('</subtasks>');
          if (subtasksEndIdx > subtasksStartIdx) {
            const subtasksInner = taskContent.slice(subtasksStartIdx + '<subtasks>'.length, subtasksEndIdx);
            subtasks = parseSubtasks(subtasksInner);
          }
        }

        tasks.push({
          id: taskId,
          name: taskName,
          status: taskStatus as TaskDetail['status'],
          priority: taskPriority as TaskDetail['priority'],
          description,
          estimated_days: estDaysAttr ? parseInt(estDaysAttr, 10) : undefined,
          commit: commitAttr,
          wave: taskWave,
          acceptance_criteria,
          subtasks,
        });
      }

      phases.push({
        id: phaseId,
        name: phaseName,
        goal,
        milestone,
        estimated_days,
        tasks,
        gate_criteria,
        waves,
        context_files,
      });
    }

    return phases;
  } catch (e) {
    return [];
  }
}

/**
 * Find in-progress task (for interruption recovery)
 */
export function findInProgressTask(planPath: string): TaskDetail | null {
  const phases = parseTaskDetails(planPath);
  for (const phase of phases) {
    for (const task of phase.tasks) {
      if (task.status === 'IN_PROGRESS') {
        return task;
      }
    }
  }
  return null;
}

/**
 * Get track commit mode from plan.xml
 */
export function getCommitMode(planPath: string): 'auto' | 'manual' | null {
  try {
    const content = fs.readFileSync(planPath, 'utf-8');
    const modeMatch = content.match(/<commit_mode>(auto|manual)<\/commit_mode>/);
    return modeMatch ? modeMatch[1] as 'auto' | 'manual' : null;
  } catch (e) {
    return null;
  }
}

/**
 * Get execution mode from plan.xml (defaults to 'sequential')
 */
export function getExecutionMode(planPath: string): 'wave' | 'sequential' {
  try {
    const content = fs.readFileSync(planPath, 'utf-8');
    const modeMatch = content.match(/<execution_mode>(wave|sequential)<\/execution_mode>/);
    return modeMatch ? modeMatch[1] as 'wave' | 'sequential' : 'sequential';
  } catch (e) {
    return 'sequential';
  }
}
