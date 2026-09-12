import { describe, it, expect } from 'vitest';
import { MAX_VERSIONS_PER_DAY, RETENTION_DAYS, versionsToPrune } from '../versionRetention';

// Plan A6. Time-thinned retention: every save from today, one per earlier day
// for RETENTION_DAYS, and never nothing. Pure, with `now` injected, so the
// calendar logic is testable without a clock or a database.

/** Local-midnight epoch seconds for a day `offset` days from `now`, at `hour`. */
function at(nowMs: number, dayOffset: number, hour: number, minute = 0): number {
  const d = new Date(nowMs);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

// A fixed instant so these never depend on when they run.
const NOW = new Date(2026, 8, 11, 14, 30, 0, 0).getTime(); // 11 Sep 2026, 14:30 local

function v(id: number, savedAt: number) {
  return { id, saved_at: savedAt };
}

describe('versionsToPrune', () => {
  it('keeps every version saved today', () => {
    const versions = [
      v(1, at(NOW, 0, 8)),
      v(2, at(NOW, 0, 9)),
      v(3, at(NOW, 0, 10)),
      v(4, at(NOW, 0, 11)),
      v(5, at(NOW, 0, 12)),
    ];
    expect(versionsToPrune(versions, NOW)).toEqual([]);
  });

  it('caps today at MAX_VERSIONS_PER_DAY, dropping the oldest of today first', () => {
    const extra = 10;
    const versions = Array.from({ length: MAX_VERSIONS_PER_DAY + extra }, (_, i) =>
      v(i + 1, at(NOW, 0, 6, i))
    );
    // "Keep everything today" is unbounded without this; a real editing day can
    // reach several hundred saves.
    expect(versionsToPrune(versions, NOW)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('keeps only the newest version of an earlier day', () => {
    const versions = [v(1, at(NOW, -1, 9)), v(2, at(NOW, -1, 13)), v(3, at(NOW, -1, 17))];
    expect(versionsToPrune(versions, NOW)).toEqual([1, 2]);
  });

  it('drops versions older than the retention window', () => {
    const versions = [v(1, at(NOW, -(RETENTION_DAYS + 10), 9)), v(2, at(NOW, 0, 9))];
    expect(versionsToPrune(versions, NOW)).toEqual([1]);
  });

  it('never drops the only version, however old', () => {
    // A presentation untouched for a year must still have a restore point, and
    // Revert to Last Save depends on one existing.
    const versions = [v(1, at(NOW, -400, 9))];
    expect(versionsToPrune(versions, NOW)).toEqual([]);
  });

  it('keeps a future-dated version', () => {
    // A laptop that woke with a fast clock, then had it corrected by NTP.
    // Without an explicit rule these match nothing and fall through to deletion.
    const versions = [v(1, at(NOW, 0, 9)), v(2, at(NOW, 3, 9))];
    expect(versionsToPrune(versions, NOW)).toEqual([]);
  });

  it('resolves same-second ties on an earlier day by id, not by saved_at order', () => {
    const sameSecond = at(NOW, -2, 11);
    const versions = [v(7, sameSecond), v(8, sameSecond)];
    // unixepoch() is second-resolution; id is monotonic.
    expect(versionsToPrune(versions, NOW)).toEqual([7]);
  });

  it('lets id decide when the clock moved backwards mid-day', () => {
    // id 9 was written after id 8, but carries an earlier saved_at.
    const versions = [v(8, at(NOW, -3, 15)), v(9, at(NOW, -3, 9))];
    expect(versionsToPrune(versions, NOW)).toEqual([8]);
  });

  it('handles a mixed history exactly', () => {
    const versions = [
      v(1, at(NOW, -60, 9)), // outside the window
      v(2, at(NOW, -7, 9)), // last week, older of that day
      v(3, at(NOW, -7, 18)), // last week, newest of that day
      v(4, at(NOW, -1, 9)), // yesterday, older
      v(5, at(NOW, -1, 20)), // yesterday, newest
      v(6, at(NOW, 0, 8)), // today
      v(7, at(NOW, 0, 13)), // today
    ];
    // Count, membership and order all matter.
    expect(versionsToPrune(versions, NOW)).toEqual([1, 2, 4]);
  });

  it('returns an empty list for no versions', () => {
    expect(versionsToPrune([], NOW)).toEqual([]);
  });
});
