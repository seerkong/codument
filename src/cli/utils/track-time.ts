import * as fs from 'fs';
import * as path from 'path';
import { ARCHIVED_TRACKS_DIR } from './index';

function parseDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readUpdatedAtFromTrack(trackXmlPath: string): Date | null {
  if (!fs.existsSync(trackXmlPath)) {
    return null;
  }
  const content = fs.readFileSync(trackXmlPath, 'utf-8');
  const meta = content.match(/<Metadata>([\s\S]*?)<\/Metadata>/)?.[1] ?? content;
  const updatedAt = meta.match(/<UpdatedAt>([\s\S]*?)<\/UpdatedAt>/)?.[1]?.trim();
  const createdAt = meta.match(/<CreatedAt>([\s\S]*?)<\/CreatedAt>/)?.[1]?.trim();
  return parseDate(updatedAt) ?? parseDate(createdAt);
}

function maxMtimeMs(dir: string): number {
  if (!fs.existsSync(dir)) {
    return 0;
  }

  const stat = fs.statSync(dir);
  if (stat.isFile()) {
    return stat.mtimeMs;
  }

  let max = stat.mtimeMs;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const childPath = path.join(dir, entry.name);
    const childMax = maxMtimeMs(childPath);
    if (childMax > max) {
      max = childMax;
    }
  }
  return max;
}

export function resolveTrackUpdatedDate(trackDir: string, now = new Date()): Date {
  const trackDate = readUpdatedAtFromTrack(path.join(trackDir, 'track.xml'));
  if (trackDate) {
    return trackDate;
  }

  const mtime = maxMtimeMs(trackDir);
  return mtime > 0 ? new Date(mtime) : now;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatLocalMinutePrefix(date: Date): { monthBucket: string; minutePrefix: string } {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  return {
    monthBucket: `${year}-${month}`,
    minutePrefix: `${year}-${month}-${day}-${hour}${minute}`,
  };
}

export function buildArchiveDestination(trackDir: string, trackId: string, archiveDir = ARCHIVED_TRACKS_DIR): string {
  const updatedDate = resolveTrackUpdatedDate(trackDir);
  const prefix = formatLocalMinutePrefix(updatedDate);
  return path.join(archiveDir, prefix.monthBucket, `${prefix.minutePrefix}-${trackId}`);
}
