import * as fs from 'fs';
import * as path from 'path';

import {
  ACTIVE_TRACKS_DIR,
  ARCHIVED_TRACKS_DIR,
  CODUMENT_DIR,
  codumentExists,
  parseOptions,
} from '../utils';

type ExecutionMode = 'wave' | 'sequential';

function safeTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function ensureParentDir(filePath: string): void {
  ensureDir(path.dirname(filePath));
}

function copyRecursive(src: string, dest: string): void {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dest);
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyRecursive(s, d);
      } else if (entry.isFile()) {
        ensureParentDir(d);
        fs.copyFileSync(s, d);
      }
    }
    return;
  }
  ensureParentDir(dest);
  fs.copyFileSync(src, dest);
}

function backupPath(backupRoot: string, relativePath: string): string {
  const normalized = relativePath.replace(/^\/+/, '');
  return path.join(backupRoot, normalized);
}

function backupIfExists(src: string, backupRoot: string): void {
  if (!fs.existsSync(src)) {
    return;
  }
  copyRecursive(src, backupPath(backupRoot, src));
}

function findTrackDir(identifier: string): { kind: 'track' | 'archive'; dir: string; id: string } | null {
  const trackDir = path.join(ACTIVE_TRACKS_DIR, identifier);
  if (fs.existsSync(trackDir) && fs.statSync(trackDir).isDirectory()) {
    return { kind: 'track', dir: trackDir, id: identifier };
  }

  // Identifier may be an archive id (YYYY-MM-DD-<track-id>) or a track id inside archive.
  if (!fs.existsSync(ARCHIVED_TRACKS_DIR)) {
    return null;
  }

  const archiveCandidates: Array<{ id: string; dir: string }> = [];
  const visitArchiveDir = (dir: string, depth: number): void => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const entryDir = path.join(dir, entry.name);
      const name = entry.name;
      if (fs.existsSync(path.join(entryDir, 'plan.xml')) && isArchiveIdMatch(identifier, name)) {
        archiveCandidates.push({ id: name, dir: entryDir });
        continue;
      }

      // New archive layout nests archive IDs one level under YYYY-MM buckets.
      if (depth < 1 && /^\d{4}-\d{2}$/.test(name)) {
        visitArchiveDir(entryDir, depth + 1);
      }
    }
  };

  visitArchiveDir(ARCHIVED_TRACKS_DIR, 0);

  if (archiveCandidates.length === 1) {
    const archive = archiveCandidates[0];
    return { kind: 'archive', dir: archive.dir, id: archive.id };
  }

  return null;
}

function isArchiveIdMatch(identifier: string, name: string): boolean {
  return name === identifier || name.endsWith(`-${identifier}`);
}

function escapeXmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function ensureExecutionMode(content: string, mode: ExecutionMode): string {
  if (content.match(/<execution_mode>[^<]*<\/execution_mode>/)) {
    return content.replace(/<execution_mode>[^<]*<\/execution_mode>/, `<execution_mode>${mode}</execution_mode>`);
  }

  // Insert under <metadata> (preferred: after <commit_mode> if present)
  const commitModeIdx = content.indexOf('</commit_mode>');
  if (commitModeIdx !== -1) {
    const insertAt = commitModeIdx + '</commit_mode>'.length;
    return content.slice(0, insertAt) + `\n    <execution_mode>${mode}</execution_mode>` + content.slice(insertAt);
  }

  const metadataEndIdx = content.indexOf('</metadata>');
  if (metadataEndIdx !== -1) {
    return content.slice(0, metadataEndIdx) + `    <execution_mode>${mode}</execution_mode>\n` + content.slice(metadataEndIdx);
  }

  return content;
}

function stripDependenciesTag(taskInner: string): { inner: string; dependencies: string[] } {
  const deps: string[] = [];
  const depRegex = /<dependencies>([\s\S]*?)<\/dependencies>/g;
  let match;
  while ((match = depRegex.exec(taskInner)) !== null) {
    const raw = match[1].trim();
    if (raw) {
      deps.push(...raw.split(',').map((s) => s.trim()).filter(Boolean));
    }
  }
  const without = taskInner.replace(depRegex, '');
  return { inner: without, dependencies: deps };
}

function wrapTaskDescriptionIfNeeded(taskInner: string): string {
  if (taskInner.includes('<description>')) {
    // If a <description> already exists, strip any leading mixed text before the first tag.
    const firstTagIdx = taskInner.indexOf('<');
    if (firstTagIdx <= 0) {
      return taskInner;
    }
    const prefix = taskInner.slice(0, firstTagIdx);
    if (prefix.trim().length === 0) {
      return taskInner.slice(firstTagIdx);
    }
    return taskInner.slice(firstTagIdx);
  }

  const firstTagIdx = taskInner.indexOf('<');
  const prefix = firstTagIdx === -1 ? taskInner : taskInner.slice(0, firstTagIdx);
  const rest = firstTagIdx === -1 ? '' : taskInner.slice(firstTagIdx);
  const descText = prefix.trim();
  if (!descText) {
    return taskInner;
  }

  // Use indentation of the next tag if available
  const indentMatch = rest.match(/\n(\s*)</);
  const indent = indentMatch ? indentMatch[1] : '          ';

  const descLine = `\n${indent}<description>${escapeXmlText(descText)}</description>\n`;
  return descLine + rest;
}

function upgradePhaseToWaves(phaseId: string, phaseInner: string): { phaseInner: string } {
  if (phaseInner.includes('<waves>')) {
    return { phaseInner };
  }

  // Parse tasks within this phase
  const taskRegex = /<task\s+([^>]+)>([\s\S]*?)<\/task>/g;
  type TaskInfo = {
    attrs: string;
    inner: string;
    taskId: string;
    dependencies: string[];
  };
  const tasks: TaskInfo[] = [];

  let match;
  while ((match = taskRegex.exec(phaseInner)) !== null) {
    const attrs = match[1];
    const inner = match[2];
    const taskId = attrs.match(/id="([^"]+)"/)?.[1] ?? '';
    const { inner: withoutDeps, dependencies } = stripDependenciesTag(inner);
    tasks.push({ attrs, inner: withoutDeps, taskId, dependencies });
  }

  // If no tasks, nothing to do
  if (tasks.length === 0) {
    return { phaseInner };
  }

  // One wave per task, deterministic order
  const taskToWave = new Map<string, string>();
  tasks.forEach((t, idx) => {
    const seq = String(idx + 1).padStart(2, '0');
    taskToWave.set(t.taskId, `WAVE-${phaseId}-${seq}`);
  });

  const waveLines: string[] = [];
  for (const t of tasks) {
    const waveId = taskToWave.get(t.taskId) || `WAVE-${phaseId}-01`;
    const depWaves = t.dependencies
      .map((depTaskId) => taskToWave.get(depTaskId))
      .filter((w): w is string => Boolean(w));
    const dependsAttr = depWaves.length > 0 ? ` depends_on="${depWaves.join(',')}"` : ' depends_on=""';
    waveLines.push(`        <wave id="${waveId}"${dependsAttr} />`);
  }

  const wavesBlock = `\n      <waves>\n${waveLines.join('\n')}\n      </waves>\n`;

  // Insert waves after </context_files> if present, else after </goal>
  const ctxEndIdx = phaseInner.indexOf('</context_files>');
  if (ctxEndIdx !== -1) {
    const insertAt = ctxEndIdx + '</context_files>'.length;
    phaseInner = phaseInner.slice(0, insertAt) + wavesBlock + phaseInner.slice(insertAt);
  } else {
    const goalEndIdx = phaseInner.indexOf('</goal>');
    if (goalEndIdx !== -1) {
      const insertAt = goalEndIdx + '</goal>'.length;
      phaseInner = phaseInner.slice(0, insertAt) + wavesBlock + phaseInner.slice(insertAt);
    } else {
      phaseInner = wavesBlock + phaseInner;
    }
  }

  // Rewrite tasks: add wave attr + wrap description + ensure dependencies removed
  phaseInner = phaseInner.replace(taskRegex, (_full, attrs: string, inner: string) => {
    const taskId = attrs.match(/id="([^"]+)"/)?.[1] ?? '';
    const waveId = taskToWave.get(taskId);
    let newAttrs = attrs;
    if (waveId && !newAttrs.includes('wave=')) {
      newAttrs = `${newAttrs} wave="${waveId}"`;
    }

    const { inner: withoutDeps } = stripDependenciesTag(inner);
    const wrapped = wrapTaskDescriptionIfNeeded(withoutDeps);
    return `<task ${newAttrs}>${wrapped}</task>`;
  });

  return { phaseInner };
}

function upgradePlanXml(original: string, mode: ExecutionMode): string {
  let content = original;

  // Convert references -> context_files (best-effort)
  content = content
    .replace(/<references>/g, '<context_files>')
    .replace(/<\/references>/g, '</context_files>')
    .replace(/<reference>/g, '<file>')
    .replace(/<\/reference>/g, '</file>');

  // Ensure execution_mode
  content = ensureExecutionMode(content, mode);

  // Phase-level upgrade
  const phaseRegex = /<phase\s+id="([^"]+)"\s+name="([^"]+)"(?:\s+milestone="([^"]+)")?[^>]*>([\s\S]*?)<\/phase>/g;
  content = content.replace(phaseRegex, (full, phaseId: string, name: string, milestone: string | undefined, inner: string) => {
    void name;
    void milestone;
    if (mode !== 'wave') {
      // Still remove <dependencies> and wrap <description> in sequential mode
      const taskRegex = /<task\s+([^>]+)>([\s\S]*?)<\/task>/g;
      const upgradedInner = inner.replace(taskRegex, (_tFull, attrs: string, taskInner: string) => {
        const { inner: withoutDeps } = stripDependenciesTag(taskInner);
        const wrapped = wrapTaskDescriptionIfNeeded(withoutDeps);
        return `<task ${attrs}>${wrapped}</task>`;
      });
      return full.replace(inner, upgradedInner);
    }

    const { phaseInner } = upgradePhaseToWaves(phaseId, inner);
    return full.replace(inner, phaseInner);
  });

  // As a final pass, strip any remaining <dependencies>
  content = content.replace(/\s*<dependencies>[\s\S]*?<\/dependencies>\s*/g, '\n');

  return content;
}

function ensureWaveSupportFiles(trackDir: string, waveMode: boolean): void {
  if (!waveMode) {
    return;
  }
  const contextPath = path.join(trackDir, 'context.md');
  const statePath = path.join(trackDir, 'state.md');
  if (!fs.existsSync(contextPath)) {
    fs.writeFileSync(contextPath, '# Context\n', 'utf-8');
  }
  if (!fs.existsSync(statePath)) {
    fs.writeFileSync(statePath, '# State\n', 'utf-8');
  }
  ensureDir(path.join(trackDir, 'phases'));
  ensureDir(path.join(trackDir, 'waves'));
}

export async function upgradeTrackCommand(args: string[]): Promise<void> {
  if (!codumentExists()) {
    console.error('Codument is not initialized. Run codument init first.');
    process.exit(1);
  }

  const { positional, options } = parseOptions(args);
  const identifier = positional[0];
  if (!identifier) {
    console.error('Please specify a track-id or archive-id.');
    console.log('Usage: codument upgrade-track <track-id|archive-id> [--mode wave|sequential] [--backup-dir <path>] [--no-backup]');
    process.exit(1);
  }

  const mode = (typeof options['mode'] === 'string' ? String(options['mode']) : 'wave') as ExecutionMode;
  if (mode !== 'wave' && mode !== 'sequential') {
    console.error(`Invalid --mode: ${mode}`);
    process.exit(1);
  }

  const noBackup = options['no-backup'] === true;
  const backupRoot = typeof options['backup-dir'] === 'string'
    ? path.resolve(String(options['backup-dir']))
    : path.join('.tmp', 'codument', `upgrade-track-${safeTimestamp()}`);

  const found = findTrackDir(identifier);
  if (!found) {
    console.error(`Track not found: ${identifier}`);
    console.log('Searched:');
    console.log(`- ${path.join(ACTIVE_TRACKS_DIR, identifier)}`);
    console.log(`- ${path.join(ARCHIVED_TRACKS_DIR, `*-${identifier}`)}`);
    process.exit(1);
  }

  const trackDir = found.dir;
  const planPath = path.join(trackDir, 'plan.xml');
  if (!fs.existsSync(planPath)) {
    console.error(`plan.xml not found in: ${trackDir}`);
    process.exit(1);
  }

  console.log('🔧 Codument Upgrade Track');
  console.log(`Workspace: ${process.cwd()}`);
  console.log(`Target:    ${trackDir}`);
  console.log(`Mode:      ${mode}`);
  if (!noBackup) {
    console.log(`Backup:    ${backupRoot}`);
  }
  console.log('');

  if (!noBackup) {
    // Backup the entire track directory for rollback
    backupIfExists(trackDir, backupRoot);
  }

  const original = fs.readFileSync(planPath, 'utf-8');
  const upgraded = upgradePlanXml(original, mode);
  fs.writeFileSync(planPath, upgraded, 'utf-8');
  console.log('✓ Updated plan.xml');

  ensureWaveSupportFiles(trackDir, mode === 'wave');
  if (mode === 'wave') {
    console.log('✓ Ensured wave support files (context.md, state.md, phases/, waves/)');
  }

  console.log('');
  if (!noBackup) {
    console.log(`Done. Backup saved at: ${backupRoot}`);
  } else {
    console.log('Done. (no backup)');
  }
}
