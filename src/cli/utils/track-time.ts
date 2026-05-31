import * as fs from 'fs';
import * as path from 'path';
import { ARCHIVE_DIR } from './index';

function parseDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readUpdatedAtFromPlan(planPath: string): Date | null {
  if (!fs.existsSync(planPath)) {
    return null;
  }
  const content = fs.readFileSync(planPath, 'utf-8');
  const metadataBlock = content.match(/<metadata>([\s\S]*?)<\/metadata>/)?.[1] ?? '';
  const updatedAt = metadataBlock.match(/<updated_at>([\s\S]*?)<\/updated_at>/)?.[1]?.trim();
  const updatedAtCamel = metadataBlock.match(/<updatedAt>([\s\S]*?)<\/updatedAt>/)?.[1]?.trim();
  return parseDate(updatedAt) ?? parseDate(updatedAtCamel);
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
  const planDate = readUpdatedAtFromPlan(path.join(trackDir, 'plan.xml'));
  if (planDate) {
    return planDate;
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

export function buildArchiveDestination(trackDir: string, trackId: string, archiveDir = ARCHIVE_DIR): string {
  const updatedDate = resolveTrackUpdatedDate(trackDir);
  const prefix = formatLocalMinutePrefix(updatedDate);
  return path.join(archiveDir, prefix.monthBucket, `${prefix.minutePrefix}-${trackId}`);
}
