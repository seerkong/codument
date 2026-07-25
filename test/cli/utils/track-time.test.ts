import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildArchiveDestination, formatLocalMinutePrefix, resolveTrackUpdatedDate } from '../../../src/cli/utils/track-time';

function makeTempTrack(updatedAt?: string): string {
  const trackDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-track-time-'));
  fs.writeFileSync(path.join(trackDir, 'track.xml'), `<Track id="track-time-test">
  <Metadata>
    <Status>completed</Status>
    ${updatedAt ? '<CreatedAt>2026-05-30T01:00:00Z</CreatedAt>' : ''}
    ${updatedAt ? `<UpdatedAt>${updatedAt}</UpdatedAt>` : ''}
  </Metadata>
</Track>`);
  return trackDir;
}

describe('track updated time', () => {
  it('uses track.xml Metadata UpdatedAt before filesystem mtime', () => {
    const trackDir = makeTempTrack('2026-05-30T06:21:00Z');
    expect(resolveTrackUpdatedDate(trackDir).toISOString()).toBe('2026-05-30T06:21:00.000Z');
  });

  it('falls back to max file mtime for manually edited tracks', () => {
    const trackDir = makeTempTrack();
    const marker = path.join(trackDir, 'later.md');
    fs.writeFileSync(marker, 'x');
    const expected = new Date('2026-05-30T06:30:00Z');
    fs.utimesSync(marker, expected, expected);

    expect(resolveTrackUpdatedDate(trackDir).getTime()).toBeGreaterThanOrEqual(expected.getTime());
  });

  it('generates month bucket and minute-level archive path', () => {
    const date = new Date(2026, 4, 30, 14, 32, 45);
    expect(formatLocalMinutePrefix(date)).toEqual({
      monthBucket: '2026-05',
      minutePrefix: '2026-05-30-1432',
    });
  });

  it('builds archive destination from track updated time', () => {
    const trackDir = makeTempTrack('2026-05-30T14:32:00+08:00');
    const dest = buildArchiveDestination(trackDir, 'refactor-spec-xml-vfs', 'codument/tracks/archived');
    expect(dest).toContain(path.join('codument/tracks/archived', '2026-05'));
    expect(dest).toContain('refactor-spec-xml-vfs');
  });
});
