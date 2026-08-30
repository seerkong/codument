#!/usr/bin/env bun
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

export type ResourceKind = 'track' | 'mission';
export type ResourceFormat = 'xnl' | 'xml' | 'plan-xml' | 'tasks-xml';
export type GroupBy = 'quarter' | 'month' | 'week' | 'day';

export interface TimelineResource {
  id: string;
  kind: ResourceKind;
  format: ResourceFormat;
  lifecycle: string;
  repository: string;
  sourcePath: string;
  createdAt: string | null;
  updatedAt: string | null;
  warnings: string[];
}

export interface TimelineBucket {
  period: string;
  track: { created: number; updated: number; cumulativeCreated: number };
  mission: { created: number; updated: number; cumulativeCreated: number };
  total: { created: number; updated: number; cumulativeCreated: number };
}

export interface RepositoryTotal {
  remoteRepository: string;
  repositories: string[];
  tracks: number;
  missions: number;
  total: number;
}

export interface TimelineReport {
  generatedAt: string;
  home: string;
  groupBy: GroupBy;
  remoteHost?: string;
  repositories: string[];
  repositoryLabels: Record<string, string>;
  repositoryTotals: RepositoryTotal[];
  resources: TimelineResource[];
  timeline: { buckets: TimelineBucket[] };
  warnings: string[];
}

export interface TimelineOptions {
  home?: string;
  outputDir?: string;
  groupBy?: GroupBy;
  remoteHost?: string;
  writeHtml?: boolean;
}

interface Candidate {
  file: string;
  format: ResourceFormat;
}

const TRACK_CANDIDATES: readonly Candidate[] = [
  { file: 'track.xnl', format: 'xnl' },
  { file: 'track.xml', format: 'xml' },
  { file: 'plan.xml', format: 'plan-xml' },
  { file: 'tasks.xml', format: 'tasks-xml' },
];

const MISSION_CANDIDATES: readonly Candidate[] = [
  { file: 'mission.xnl', format: 'xnl' },
  { file: 'mission.xml', format: 'xml' },
];

/**
 * Discover only Git roots. Once a .git marker is found, children are not
 * traversed: a nested Git checkout belongs to that checkout, not this scan.
 */
export function discoverRepositories(home: string, warnings: string[] = []): string[] {
  const root = canonicalDirectory(home, warnings, 'scan root');
  if (!root) return [];
  const repositories: string[] = [];
  const seen = new Set<string>();

  const visit = (directory: string): void => {
    const marker = path.join(directory, '.git');
    if (exists(marker)) {
      const canonical = canonicalDirectory(directory, warnings, 'Git root');
      if (canonical && !seen.has(canonical)) {
        seen.add(canonical);
        repositories.push(canonical);
      }
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      warnings.push(`cannot read ${directory}: ${message(error)}`);
      return;
    }
    for (const entry of entries) {
      // Symlink traversal can create loops and makes the actual repository
      // ownership ambiguous. A symlinked codument directory is still read
      // after its real Git root has been discovered.
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      visit(path.join(directory, entry.name));
    }
  };

  visit(root);
  return repositories.sort();
}

export function runTimeline(options: TimelineOptions = {}): TimelineReport {
  const warnings: string[] = [];
  const home = canonicalDirectory(expandHome(options.home ?? os.homedir()), warnings, 'scan root')
    ?? path.resolve(expandHome(options.home ?? os.homedir()));
  const groupBy = options.groupBy ?? 'week';
  if (!['quarter', 'month', 'week', 'day'].includes(groupBy)) {
    throw new Error(`invalid --group-by '${groupBy}': expected quarter, month, week, or day`);
  }

  const remoteHost = normalizeHost(options.remoteHost);
  const discoveredRepositories = discoverRepositories(home, warnings);
  const repositoryRemotes = new Map(discoveredRepositories.map((repository) => [repository, repositoryRemoteUrls(repository)]));
  const repositories = remoteHost
    ? discoveredRepositories.filter((repository) => (repositoryRemotes.get(repository) ?? []).some((remote) => normalizeHost(remote) === remoteHost))
    : discoveredRepositories;
  const repositoryLabels = Object.fromEntries(repositories.map((repository) => [
    repository,
    repositoryDisplayLabel(repository, repositoryRemotes.get(repository) ?? [], remoteHost),
  ]));
  const resources = repositories.flatMap((repository) => scanRepository(repository, warnings));
  resources.sort((left, right) => left.repository.localeCompare(right.repository)
    || left.sourcePath.localeCompare(right.sourcePath));
  const repositoryTotals = buildRepositoryTotals(resources, repositoryLabels);
  const timeline = { buckets: buildTimeline(resources, groupBy) };
  const report: TimelineReport = {
    generatedAt: new Date().toISOString(), home, groupBy, ...(remoteHost ? { remoteHost } : {}), repositories, repositoryLabels, repositoryTotals, resources, timeline, warnings,
  };

  const outputDir = path.resolve(options.outputDir ?? path.join(process.cwd(), 'codument-timeline'));
  writeReport(outputDir, report, options.writeHtml !== false);
  return report;
}

function repositoryRemoteUrls(repository: string): string[] {
  try {
    const config = execFileSync('git', ['-C', repository, 'config', '--get-regexp', '^remote\\..*\\.url$'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    return [...new Set(config.split(/\r?\n/).flatMap((line) => line.trim().split(/\s+/, 2)[1] ? [line.trim().split(/\s+/, 2)[1]!] : []))];
  } catch {
    return [];
  }
}

function repositoryDisplayLabel(repository: string, remotes: string[], remoteHost: string | undefined): string {
  return remotes.find((remote) => normalizeHost(remote) === remoteHost) ?? remotes[0] ?? repository;
}

function normalizeHost(remote: string | undefined): string | undefined {
  const value = remote?.trim();
  if (!value) return undefined;
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return new URL(value).hostname.toLowerCase() || undefined;
  } catch {
    return undefined;
  }
  if (/^[a-z0-9.-]+$/i.test(value)) return value.toLowerCase();
  // SCP-like Git remotes, for example git@host:group/repository.git.
  return /^(?:[^@\s]+@)?([^:/\s]+):/.exec(value)?.[1]?.toLowerCase();
}

function scanRepository(repository: string, warnings: string[]): TimelineResource[] {
  const codument = path.join(repository, 'codument');
  if (!isDirectory(codument)) return [];
  return [
    ...scanResourceTree(path.join(codument, 'tracks'), 'track', repository, 'active', warnings),
    ...scanResourceTree(path.join(codument, 'archive'), 'track', repository, 'archived', warnings),
    ...scanResourceTree(path.join(codument, 'missions'), 'mission', repository, 'active', warnings),
  ];
}

function scanResourceTree(
  root: string,
  kind: ResourceKind,
  repository: string,
  defaultLifecycle: string,
  warnings: string[],
): TimelineResource[] {
  if (!isDirectory(root)) return [];
  const found: TimelineResource[] = [];
  const candidates = kind === 'track' ? TRACK_CANDIDATES : MISSION_CANDIDATES;

  const visit = (directory: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      warnings.push(`cannot read ${directory}: ${message(error)}`);
      return;
    }
    const names = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
    const matches = candidates.filter((candidate) => names.has(candidate.file));
    if (matches.length > 0) {
      found.push(parseResource(directory, kind, repository, defaultLifecycle, matches, warnings));
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.isSymbolicLink()) visit(path.join(directory, entry.name));
    }
  };

  visit(root);
  return found;
}

function parseResource(
  directory: string,
  kind: ResourceKind,
  repository: string,
  defaultLifecycle: string,
  candidates: Candidate[],
  warnings: string[],
): TimelineResource {
  const selected = candidates[0]!;
  const localWarnings: string[] = [];
  if (candidates.length > 1) {
    localWarnings.push(`multiple ${kind === 'track' ? 'Track' : 'Mission'} authority candidates: ${candidates.map((c) => c.file).join(', ')}; selected ${selected.file}`);
  }

  const source = path.join(directory, selected.file);
  let content = '';
  try {
    content = fs.readFileSync(source, 'utf8');
  } catch (error) {
    localWarnings.push(`cannot read source: ${message(error)}`);
  }
  const metadata = readMetadata(content, selected.format, directory, localWarnings);
  const id = metadata.id ?? path.basename(directory);
  const lifecycle = lifecycleFor(directory, repository, defaultLifecycle);
  const resource: TimelineResource = {
    id,
    kind,
    format: selected.format,
    lifecycle,
    repository,
    sourcePath: path.relative(repository, source),
    createdAt: normalizeTimestamp(metadata.createdAt, `created time for ${source}`, localWarnings),
    updatedAt: normalizeTimestamp(metadata.updatedAt ?? metadata.createdAt, `updated time for ${source}`, localWarnings),
    warnings: localWarnings,
  };
  if (!resource.createdAt) localWarnings.push('missing or invalid created time; excluded from created curve');
  if (!resource.updatedAt) localWarnings.push('missing or invalid updated time; excluded from updated curve');
  warnings.push(...localWarnings.map((warning) => `${repository}/${resource.sourcePath}: ${warning}`));
  return resource;
}

function readMetadata(
  content: string,
  format: ResourceFormat,
  directory: string,
  warnings: string[],
): { id?: string; createdAt?: string; updatedAt?: string } {
  const jsonMetadata = readLegacyJsonMetadata(directory, warnings);
  const fromXnl = format === 'xnl';
  const rootId = fromXnl
    ? match(content, /<(?:Track|Mission)\s+#([A-Za-z0-9_.-]+)/)
    : match(content, /<(?:Track|Mission)\b[^>]*\bid\s*=\s*["']([^"']+)["']/i);
  const xmlMetadata = match(content, /<metadata\b[^>]*>([\s\S]*?)<\/metadata>/i) ?? '';
  const pick = (...values: Array<string | undefined>): string | undefined => values.find(Boolean);
  const field = (name: 'created' | 'updated'): string | undefined => {
    const names = name === 'created'
      ? ['created_at', 'createdAt', 'CreatedAt', 'created']
      : ['updated_at', 'updatedAt', 'UpdatedAt', 'updated'];
    return pick(
      ...names.map((key) => fromXnl ? xnlProperty(content, key) : undefined),
      ...names.map((key) => xmlTag(xmlMetadata, key)),
      ...names.map((key) => xmlTag(content, key)),
      ...names.map((key) => jsonMetadata[key]),
    );
  };
  return {
    id: pick(rootId, xmlTag(xmlMetadata, 'track_id'), xmlTag(xmlMetadata, 'mission_id'), jsonMetadata.track_id, jsonMetadata.mission_id, jsonMetadata.id),
    createdAt: field('created'),
    updatedAt: field('updated'),
  };
}

function readLegacyJsonMetadata(directory: string, warnings: string[]): Record<string, string> {
  const file = path.join(directory, 'metadata.json');
  if (!exists(file)) return {};
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([key, value]) =>
      typeof value === 'string' || typeof value === 'number' ? [[key, String(value)]] : [],
    ));
  } catch (error) {
    warnings.push(`cannot parse metadata.json: ${message(error)}`);
    return {};
  }
}

function xnlProperty(content: string, property: string): string | undefined {
  const escaped = escapeRegExp(property);
  return match(content, new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']+)["']`, 'i'));
}

function xmlTag(content: string, tag: string): string | undefined {
  const escaped = escapeRegExp(tag);
  return match(content, new RegExp(`<${escaped}\\b[^>]*>\\s*([\\s\\S]*?)\\s*<\\/${escaped}>`, 'i'));
}

function lifecycleFor(directory: string, repository: string, defaultLifecycle: string): string {
  const parts = path.relative(path.join(repository, 'codument'), directory).split(path.sep);
  const collection = parts[0];
  if (collection === 'archive') return 'archived';
  if (parts[1] === 'pending' || parts[1] === 'active' || parts[1] === 'archived') return parts[1];
  return defaultLifecycle;
}

function normalizeTimestamp(value: string | undefined, label: string, warnings: string[]): string | null {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    warnings.push(`invalid ${label}: ${JSON.stringify(value)}`);
    return null;
  }
  return date.toISOString();
}

function buildTimeline(resources: TimelineResource[], groupBy: GroupBy): TimelineBucket[] {
  const indexed = new Map<string, TimelineBucket>();
  for (const resource of resources) {
    addEvent(indexed, resource.kind, resource.createdAt, 'created', groupBy);
    addEvent(indexed, resource.kind, resource.updatedAt, 'updated', groupBy);
  }
  const periods = [...indexed.keys()].sort();
  fillMissingPeriods(periods, indexed, groupBy);
  let tracks = 0;
  let missions = 0;
  return [...indexed.keys()].sort().map((period) => {
    const bucket = indexed.get(period)!;
    tracks += bucket.track.created;
    missions += bucket.mission.created;
    bucket.track.cumulativeCreated = tracks;
    bucket.mission.cumulativeCreated = missions;
    bucket.total.created = bucket.track.created + bucket.mission.created;
    bucket.total.updated = bucket.track.updated + bucket.mission.updated;
    bucket.total.cumulativeCreated = tracks + missions;
    return bucket;
  });
}

function buildRepositoryTotals(resources: TimelineResource[], repositoryLabels: Record<string, string>): RepositoryTotal[] {
  const totals = new Map<string, RepositoryTotal>();
  for (const resource of resources) {
    const remoteRepository = repositoryLabels[resource.repository] ?? resource.repository;
    const total = totals.get(remoteRepository) ?? {
      remoteRepository, repositories: [], tracks: 0, missions: 0, total: 0,
    };
    if (!total.repositories.includes(resource.repository)) total.repositories.push(resource.repository);
    if (resource.kind === 'track') total.tracks++;
    else total.missions++;
    total.total++;
    totals.set(remoteRepository, total);
  }
  return [...totals.values()]
    .map((total) => ({ ...total, repositories: total.repositories.sort() }))
    .sort((left, right) => right.total - left.total || left.remoteRepository.localeCompare(right.remoteRepository));
}

function addEvent(
  indexed: Map<string, TimelineBucket>,
  kind: ResourceKind,
  value: string | null,
  field: 'created' | 'updated',
  groupBy: GroupBy,
): void {
  if (!value) return;
  const period = periodFor(new Date(value), groupBy);
  const bucket = indexed.get(period) ?? emptyBucket(period);
  bucket[kind][field]++;
  indexed.set(period, bucket);
}

function fillMissingPeriods(periods: string[], indexed: Map<string, TimelineBucket>, groupBy: GroupBy): void {
  if (periods.length < 2) return;
  let date = dateFromPeriod(periods[0]!, groupBy);
  const end = dateFromPeriod(periods[periods.length - 1]!, groupBy);
  while (date < end) {
    const period = periodFor(date, groupBy);
    if (!indexed.has(period)) indexed.set(period, emptyBucket(period));
    date = nextPeriod(date, groupBy);
  }
}

function emptyBucket(period: string): TimelineBucket {
  return {
    period,
    track: { created: 0, updated: 0, cumulativeCreated: 0 },
    mission: { created: 0, updated: 0, cumulativeCreated: 0 },
    total: { created: 0, updated: 0, cumulativeCreated: 0 },
  };
}

function periodFor(date: Date, groupBy: GroupBy): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  if (groupBy === 'quarter') return `${year}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  if (groupBy === 'month') return `${year}-${month}`;
  const day = new Date(Date.UTC(year, date.getUTCMonth(), date.getUTCDate()));
  if (groupBy === 'week') {
    const offset = (day.getUTCDay() + 6) % 7;
    day.setUTCDate(day.getUTCDate() - offset);
  }
  return `${day.getUTCFullYear()}-${`${day.getUTCMonth() + 1}`.padStart(2, '0')}-${`${day.getUTCDate()}`.padStart(2, '0')}`;
}

function dateFromPeriod(period: string, groupBy: GroupBy): Date {
  if (groupBy === 'quarter') {
    const match = /^(\d{4})-Q([1-4])$/.exec(period);
    if (!match) throw new Error(`invalid quarter period: ${period}`);
    return new Date(Date.UTC(Number(match[1]), (Number(match[2]) - 1) * 3, 1));
  }
  return new Date(groupBy === 'month' ? `${period}-01T00:00:00.000Z` : `${period}T00:00:00.000Z`);
}

function nextPeriod(date: Date, groupBy: GroupBy): Date {
  const next = new Date(date);
  if (groupBy === 'day') next.setUTCDate(next.getUTCDate() + 1);
  else if (groupBy === 'week') next.setUTCDate(next.getUTCDate() + 7);
  else next.setUTCMonth(next.getUTCMonth() + (groupBy === 'quarter' ? 3 : 1));
  return next;
}

function writeReport(outputDir: string, report: TimelineReport, writeHtml: boolean): void {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'resources.json'), JSON.stringify({
    generatedAt: report.generatedAt, home: report.home, groupBy: report.groupBy, remoteHost: report.remoteHost,
    repositories: report.repositories, repositoryLabels: report.repositoryLabels, repositoryTotals: report.repositoryTotals, resources: report.resources, warnings: report.warnings,
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(outputDir, 'resources.csv'), resourcesCsv(report.resources));
  fs.writeFileSync(path.join(outputDir, 'timeline.json'), JSON.stringify({
    generatedAt: report.generatedAt, groupBy: report.groupBy, remoteHost: report.remoteHost, repositoryLabels: report.repositoryLabels, repositoryTotals: report.repositoryTotals, buckets: report.timeline.buckets,
  }, null, 2) + '\n');
  if (writeHtml) fs.writeFileSync(path.join(outputDir, 'timeline.html'), timelineHtml(report));
}

function resourcesCsv(resources: TimelineResource[]): string {
  const headings = ['kind', 'id', 'format', 'lifecycle', 'repository', 'source_path', 'created_at', 'updated_at', 'warnings'];
  const rows = resources.map((resource) => [
    resource.kind, resource.id, resource.format, resource.lifecycle, resource.repository, resource.sourcePath,
    resource.createdAt ?? '', resource.updatedAt ?? '', resource.warnings.join(' | '),
  ].map(csv).join(','));
  return `${headings.join(',')}\n${rows.join('\n')}\n`;
}

function timelineHtml(report: TimelineReport): string {
  return `<!doctype html>
<html lang="en"><meta charset="utf-8"><title>Codument timeline</title>
<style>body{font:14px system-ui,sans-serif;margin:32px;color:#172033;max-width:1040px}header{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}select{font:inherit;padding:6px 10px;border:1px solid #98a2b3;border-radius:6px;background:#fff}.chart-area{position:relative}svg{width:100%;height:auto;border:1px solid #d9e0ea;border-radius:8px;touch-action:none}.grid{stroke:#e5e7eb}.hover-line{stroke:#475467;stroke-dasharray:4 4;pointer-events:none}.axis{fill:#667085;font-size:11px}.chart-tooltip{display:none;position:absolute;z-index:1;pointer-events:none;white-space:pre-line;background:#101828;color:#fff;border-radius:6px;padding:8px 10px;font-size:12px;line-height:1.45;box-shadow:0 4px 12px #10182833}.legend{display:flex;gap:16px;flex-wrap:wrap;margin:14px 0}.legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px}.repository-report{margin-top:40px;padding-top:8px;border-top:1px solid #d9e0ea}table{border-collapse:collapse;width:100%;margin-top:28px}td,th{padding:7px;border-bottom:1px solid #e5e7eb;text-align:right}thead tr:first-child th:not(:first-child){text-align:center;background:#f8fafc}td:first-child,th:first-child{text-align:left}</style>
<header><div><h1>Codument timeline</h1><p id="summary"></p></div><label>Group by <select id="group-by"><option value="quarter">Quarter</option><option value="month">Month</option><option value="week">Week</option><option value="day">Day</option></select></label></header>
<div class="legend"><span><i style="background:#2563eb"></i>Track created</span><span><i style="background:#9333ea"></i>Track updated</span><span><i style="background:#16a34a"></i>Mission created</span><span><i style="background:#ea580c"></i>Mission updated</span></div>
<div class="chart-area" id="chart-area"><svg id="chart" viewBox="0 0 960 420" role="img" aria-label="Codument Track and Mission timeline"></svg><div id="chart-tooltip" class="chart-tooltip"></div></div>
<table><thead><tr><th rowspan="2">Period</th><th colspan="3">Tracks</th><th colspan="3">Missions</th></tr><tr><th>Created</th><th>Updated</th><th>Cumulative Tracks</th><th>Created</th><th>Updated</th><th>Cumulative Missions</th></tr></thead><tbody id="data-rows"></tbody></table>
<section class="repository-report" aria-labelledby="repository-report-title"><h2 id="repository-report-title">Totals by Git repository</h2><p>One row per Git remote repository, ordered by total resources. Multiple local checkouts of the same remote are combined.</p><table><thead><tr><th>Git repository</th><th>Tracks</th><th>Missions</th><th>Total</th></tr></thead><tbody id="repository-total-rows"></tbody></table></section>
<noscript>This report needs JavaScript enabled to switch its time grouping.</noscript>
<script>
const resources = ${safeJson(report.resources)};
const repositoryTotals = ${safeJson(report.repositoryTotals)};
const initialGroupBy = ${JSON.stringify(report.groupBy)};
const reportScope = ${JSON.stringify(report.remoteHost ? `Remote host filter: ${report.remoteHost}` : '')};
const groupBy = document.getElementById('group-by');
const summary = document.getElementById('summary');
const chart = document.getElementById('chart');
const chartArea = document.getElementById('chart-area');
const chartTooltip = document.getElementById('chart-tooltip');
const rows = document.getElementById('data-rows');
const repositoryTotalRows = document.getElementById('repository-total-rows');
const svg = 'http://www.w3.org/2000/svg';
let displayedBuckets = [];
let chartX = () => 0;
let hoverLine;

function periodFor(iso, grouping) {
  const date = new Date(iso);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  if (grouping === 'quarter') return year + '-Q' + (Math.floor(date.getUTCMonth() / 3) + 1);
  if (grouping === 'month') return year + '-' + month;
  const day = new Date(Date.UTC(year, date.getUTCMonth(), date.getUTCDate()));
  if (grouping === 'week') day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.getUTCFullYear() + '-' + String(day.getUTCMonth() + 1).padStart(2, '0') + '-' + String(day.getUTCDate()).padStart(2, '0');
}

function emptyBucket(period) { return { period, track:{created:0,updated:0,cumulativeCreated:0}, mission:{created:0,updated:0,cumulativeCreated:0}, total:{created:0,updated:0,cumulativeCreated:0} }; }
function dateFromPeriod(period, grouping) {
  if (grouping === 'quarter') { const match = /^(\\d{4})-Q([1-4])$/.exec(period); return new Date(Date.UTC(Number(match[1]), (Number(match[2]) - 1) * 3, 1)); }
  return new Date((grouping === 'month' ? period + '-01' : period) + 'T00:00:00.000Z');
}
function nextPeriod(date, grouping) {
  const next = new Date(date);
  if (grouping === 'day') next.setUTCDate(next.getUTCDate() + 1);
  else if (grouping === 'week') next.setUTCDate(next.getUTCDate() + 7);
  else next.setUTCMonth(next.getUTCMonth() + (grouping === 'quarter' ? 3 : 1));
  return next;
}
function buildBuckets(grouping, scopedResources) {
  const indexed = new Map();
  for (const resource of scopedResources) {
    for (const event of ['created', 'updated']) {
      const date = event === 'created' ? resource.createdAt : resource.updatedAt;
      if (!date) continue;
      const period = periodFor(date, grouping);
      const bucket = indexed.get(period) || emptyBucket(period);
      bucket[resource.kind][event]++;
      indexed.set(period, bucket);
    }
  }
  const periods = [...indexed.keys()].sort();
  if (periods.length > 1) {
    let cursor = dateFromPeriod(periods[0], grouping);
    const end = dateFromPeriod(periods[periods.length - 1], grouping);
    while (cursor < end) { const period = periodFor(cursor, grouping); if (!indexed.has(period)) indexed.set(period, emptyBucket(period)); cursor = nextPeriod(cursor, grouping); }
  }
  let tracks = 0, missions = 0;
  return [...indexed.keys()].sort().map((period) => {
    const bucket = indexed.get(period);
    tracks += bucket.track.created; missions += bucket.mission.created;
    bucket.track.cumulativeCreated = tracks; bucket.mission.cumulativeCreated = missions;
    bucket.total.created = bucket.track.created + bucket.mission.created;
    bucket.total.updated = bucket.track.updated + bucket.mission.updated;
    bucket.total.cumulativeCreated = tracks + missions;
    return bucket;
  });
}

function element(tag, attributes, text) {
  const node = document.createElementNS(svg, tag);
  for (const [name, value] of Object.entries(attributes || {})) node.setAttribute(name, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

function drawChart(buckets) {
  chart.replaceChildren();
  const width = 960, height = 420, inset = {left:56,right:22,top:32,bottom:64};
  const series = [
    { color:'#2563eb', values:buckets.map((bucket) => bucket.track.created) },
    { color:'#9333ea', values:buckets.map((bucket) => bucket.track.updated) },
    { color:'#16a34a', values:buckets.map((bucket) => bucket.mission.created) },
    { color:'#ea580c', values:buckets.map((bucket) => bucket.mission.updated) },
  ];
  const max = Math.max(1, ...series.flatMap((line) => line.values));
  const usableWidth = width - inset.left - inset.right, usableHeight = height - inset.top - inset.bottom;
  const x = (index) => buckets.length <= 1 ? inset.left + usableWidth / 2 : inset.left + index * usableWidth / (buckets.length - 1);
  const y = (value) => inset.top + usableHeight - value / max * usableHeight;
  chart.append(element('line', {class:'grid',x1:inset.left,y1:inset.top,x2:inset.left,y2:height-inset.bottom}), element('line', {class:'grid',x1:inset.left,y1:height-inset.bottom,x2:width-inset.right,y2:height-inset.bottom}), element('text', {class:'axis',x:12,y:inset.top+5}, max), element('text', {class:'axis',x:18,y:height-inset.bottom+4}, '0'));
  for (const line of series) chart.append(element('polyline', {fill:'none',stroke:line.color,'stroke-width':2.5,points:line.values.map((value, index) => x(index) + ',' + y(value)).join(' ')}));
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 10));
  buckets.forEach((bucket, index) => { if (index % labelEvery === 0) chart.append(element('text', {class:'axis',x:x(index),y:height-26,'text-anchor':'end',transform:'rotate(-35 ' + x(index) + ' ' + (height-26) + ')'}, bucket.period)); });
  hoverLine = element('line', {class:'hover-line',x1:0,x2:0,y1:inset.top,y2:height-inset.bottom,visibility:'hidden'});
  chart.append(hoverLine);
  chartX = x;
}

function renderTimeline() {
  const buckets = buildBuckets(groupBy.value, resources);
  displayedBuckets = buckets;
  summary.textContent = resources.length + ' resources. Grouped by ' + groupBy.value + ' (UTC); switching does not rescan repositories.' + (reportScope ? ' ' + reportScope : '');
  drawChart(buckets);
  rows.replaceChildren();
  for (const bucket of buckets) {
    const row = document.createElement('tr');
    for (const value of [bucket.period,bucket.track.created,bucket.track.updated,bucket.track.cumulativeCreated,bucket.mission.created,bucket.mission.updated,bucket.mission.cumulativeCreated]) { const cell = document.createElement('td'); cell.textContent = String(value); row.append(cell); }
    rows.append(row);
  }
}

function renderRepositoryTotals() {
  repositoryTotalRows.replaceChildren();
  for (const repository of repositoryTotals) {
    const row = document.createElement('tr');
    row.title = repository.repositories.join('\\n');
    for (const value of [repository.remoteRepository, repository.tracks, repository.missions, repository.total]) {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      row.append(cell);
    }
    repositoryTotalRows.append(row);
  }
}
groupBy.value = initialGroupBy;
groupBy.addEventListener('change', renderTimeline);
chart.addEventListener('pointermove', (event) => {
  if (displayedBuckets.length === 0) return;
  const bounds = chart.getBoundingClientRect();
  const viewX = (event.clientX - bounds.left) / bounds.width * 960;
  const index = displayedBuckets.length === 1 ? 0 : Math.max(0, Math.min(displayedBuckets.length - 1, Math.round((viewX - 56) / 882 * (displayedBuckets.length - 1))));
  const bucket = displayedBuckets[index];
  hoverLine.setAttribute('x1', chartX(index)); hoverLine.setAttribute('x2', chartX(index)); hoverLine.setAttribute('visibility', 'visible');
  chartTooltip.textContent = bucket.period + '\\nTracks created: ' + bucket.track.created + '\\nTracks updated: ' + bucket.track.updated + '\\nMissions created: ' + bucket.mission.created + '\\nMissions updated: ' + bucket.mission.updated;
  const area = chartArea.getBoundingClientRect();
  chartTooltip.style.left = Math.min(event.clientX - area.left + 12, area.width - 190) + 'px';
  chartTooltip.style.top = Math.max(8, event.clientY - area.top + 12) + 'px';
  chartTooltip.style.display = 'block';
});
chart.addEventListener('pointerleave', () => { if (hoverLine) hoverLine.setAttribute('visibility', 'hidden'); chartTooltip.style.display = 'none'; });
renderTimeline();
renderRepositoryTotals();
</script>
</html>`;
}

function canonicalDirectory(directory: string, warnings: string[], label: string): string | null {
  try {
    return fs.realpathSync(directory);
  } catch (error) {
    warnings.push(`cannot resolve ${label} ${directory}: ${message(error)}`);
    return null;
  }
}

function exists(file: string): boolean {
  return fs.existsSync(file);
}

function isDirectory(directory: string): boolean {
  try {
    return fs.statSync(directory).isDirectory();
  } catch {
    return false;
  }
}

function match(content: string, pattern: RegExp): string | undefined {
  return pattern.exec(content)?.[1]?.trim() || undefined;
}

function csv(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function expandHome(value: string): string {
  return value === '~' ? os.homedir() : value.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : value;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseCli(argv: string[]): TimelineOptions {
  const options: TimelineOptions = {};
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (argument === '--home' || argument === '--out' || argument === '--group-by' || argument === '--remote-host') {
      const value = argv[++index];
      if (!value) throw new Error(`${argument} requires a value`);
      if (argument === '--home') options.home = value;
      if (argument === '--out') options.outputDir = value;
      if (argument === '--group-by') options.groupBy = value as GroupBy;
      if (argument === '--remote-host') options.remoteHost = value;
    } else if (argument === '--json') {
      options.writeHtml = false;
    } else if (argument === '--help' || argument === '-h') {
      console.log('Usage: bun run codument:timeline -- [--home <dir>] [--out <dir>] [--group-by quarter|month|week|day] [--remote-host <host>] [--json]');
      process.exit(0);
    } else {
      throw new Error(`unknown option: ${argument}`);
    }
  }
  return options;
}

if (import.meta.main) {
  try {
    const options = parseCli(process.argv.slice(2));
    const report = runTimeline(options);
    const output = path.resolve(options.outputDir ?? path.join(process.cwd(), 'codument-timeline'));
    console.log(`Scanned ${report.repositories.length} Git repositories and ${report.resources.length} resources.`);
    console.log(`Wrote timeline data to ${output}`);
    if (report.warnings.length > 0) console.log(`${report.warnings.length} warning(s); see resources.json.`);
  } catch (error) {
    console.error(`codument timeline: ${message(error)}`);
    process.exitCode = 1;
  }
}
