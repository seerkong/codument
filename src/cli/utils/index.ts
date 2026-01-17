import * as fs from 'fs';
import * as path from 'path';

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
export const SPECS_DIR = path.join(CODUMENT_DIR, 'specs');
export const ARCHIVE_DIR = path.join(CODUMENT_DIR, 'archive');

export interface TrackMetadata {
  track_id: string;
  type: 'feature' | 'bug' | 'chore' | 'refactor';
  status: 'new' | 'in_progress' | 'completed' | 'cancelled';
  commit_mode: 'auto' | 'manual';
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
}

/**
 * Check if codument directory exists
 */
export function codumentExists(): boolean {
  return fs.existsSync(CODUMENT_DIR);
}

/**
 * Get all tracks from tracks directory
 */
export function getTracks(): Track[] {
  if (!fs.existsSync(TRACKS_DIR)) {
    return [];
  }

  const trackDirs = fs.readdirSync(TRACKS_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  const tracks: Track[] = [];

  for (const trackId of trackDirs) {
    const metadataPath = path.join(TRACKS_DIR, trackId, 'metadata.json');
    if (fs.existsSync(metadataPath)) {
      try {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as TrackMetadata;
        const track: Track = { id: trackId, metadata };

        const planPath = path.join(TRACKS_DIR, trackId, 'plan.xml');
        if (fs.existsSync(planPath)) {
          track.taskSummary = parsePlanSummary(planPath);
        }

        tracks.push(track);
      } catch (e) {
        // Skip invalid tracks
      }
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

  const specDirs = fs.readdirSync(SPECS_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  const specs: Spec[] = [];

  for (const specId of specDirs) {
    const specPath = path.join(SPECS_DIR, specId, 'spec.md');
    if (fs.existsSync(specPath)) {
      const content = fs.readFileSync(specPath, 'utf-8');
      const requirements = (content.match(/^### Requirement:/gm) || []).length;
      const scenarios = (content.match(/^#### Scenario:/gm) || []).length;

      specs.push({
        id: specId,
        path: specPath,
        requirements,
        scenarios,
      });
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
      };
    }

    // Otherwise, compute from task attributes (new format: status in attributes)
    const taskStatusMatches = content.matchAll(/<task[^>]+status="([^"]+)"[^>]*>/g);
    const subtaskStatusMatches = content.matchAll(/<subtask[^>]+status="([^"]+)"[^>]*\/>/g);
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
    };
  } catch (e) {
    return undefined;
  }
}

/**
 * Get track by ID
 */
export function getTrack(trackId: string): Track | null {
  const trackDir = path.join(TRACKS_DIR, trackId);
  const metadataPath = path.join(trackDir, 'metadata.json');

  if (!fs.existsSync(metadataPath)) {
    return null;
  }

  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as TrackMetadata;
    const track: Track = { id: trackId, metadata };

    const planPath = path.join(trackDir, 'plan.xml');
    if (fs.existsSync(planPath)) {
      track.taskSummary = parsePlanSummary(planPath);
    }

    return track;
  } catch (e) {
    return null;
  }
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
  dependencies?: string[];
  acceptance_criteria?: { id: string; text: string; checked: boolean }[];
  subtasks?: SubtaskDetail[];
}

export interface SubtaskDetail {
  id: string;
  name: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED' | 'CANCELLED';
  estimated_hours?: number;
}

export interface PhaseDetail {
  id: string;
  name: string;
  goal: string;
  milestone?: string;
  estimated_days?: number;
  tasks: TaskDetail[];
  gate_criteria?: string[];
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

      // Parse tasks
      const tasks: TaskDetail[] = [];
      const taskRegex = /<task\s+id="([^"]+)"\s+name="([^"]+)"\s+status="([^"]+)"\s+priority="([^"]+)"(?:[^>]*)>([\s\S]*?)<\/task>/g;
      let taskMatch;

      while ((taskMatch = taskRegex.exec(phaseContent)) !== null) {
        const [, taskId, taskName, taskStatus, taskPriority, taskContent] = taskMatch;

        // Extract description (text content before first child element)
        const descMatch = taskContent.match(/^\s*([^<]+)/);
        const description = descMatch ? descMatch[1].trim() : '';

        // Extract dependencies
        const depsMatch = taskContent.match(/<dependencies>([^<]*)<\/dependencies>/);
        const dependencies = depsMatch && depsMatch[1].trim()
          ? depsMatch[1].trim().split(',').map(d => d.trim())
          : undefined;

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

        // Extract subtasks
        const subtasksMatch = taskContent.match(/<subtasks>([\s\S]*?)<\/subtasks>/);
        let subtasks: SubtaskDetail[] | undefined;
        if (subtasksMatch) {
          const subtaskMatches = subtasksMatch[1].matchAll(/<subtask\s+id="([^"]+)"\s+name="([^"]+)"\s+status="([^"]+)"(?:\s+estimated_hours="(\d+)")?[^/]*\/>/g);
          subtasks = [...subtaskMatches].map(m => ({
            id: m[1],
            name: m[2],
            status: m[3] as SubtaskDetail['status'],
            estimated_hours: m[4] ? parseInt(m[4], 10) : undefined,
          }));
        }

        // Extract commit SHA
        const commitMatch = taskContent.match(/commit="([^"]+)"/);
        const commit = commitMatch ? commitMatch[1] : undefined;

        // Extract estimated_days from task attributes
        const taskEstMatch = taskContent.match(/estimated_days="(\d+)"/);
        const taskEstDays = taskEstMatch ? parseInt(taskEstMatch[1], 10) : undefined;

        tasks.push({
          id: taskId,
          name: taskName,
          status: taskStatus as TaskDetail['status'],
          priority: taskPriority as TaskDetail['priority'],
          description,
          estimated_days: taskEstDays,
          commit,
          dependencies,
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
