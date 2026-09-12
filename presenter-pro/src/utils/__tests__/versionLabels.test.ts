import { describe, it, expect } from 'vitest';
import { formatVersionTimestamp } from '@/utils/versionLabels';

// Plan A6. Pure, with `now` injected — a test that depends on when it runs is a
// test that fails on a Tuesday. Assertions check the DAY PREFIX rather than the
// formatted time, because the exact time string is locale-dependent and that is
// the platform's business, not ours.

const NOW = new Date(2026, 8, 11, 14, 30, 0, 0).getTime(); // 11 Sep 2026, 14:30

function secondsAt(dayOffset: number, hour: number): number {
  const d = new Date(NOW);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 2, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

describe('formatVersionTimestamp', () => {
  it('labels today with the time, because that is what distinguishes it', () => {
    const label = formatVersionTimestamp(secondsAt(0, 9), NOW);
    expect(label).toMatch(/^Today /);
    expect(label.length).toBeGreaterThan('Today '.length);
  });

  it('labels yesterday with the time', () => {
    expect(formatVersionTimestamp(secondsAt(-1, 16), NOW)).toMatch(/^Yesterday /);
  });

  it('labels earlier this week by day, without a time', () => {
    // Beyond yesterday the exact minute is noise; the day is what someone is
    // looking for.
    const label = formatVersionTimestamp(secondsAt(-3, 16), NOW);
    expect(label).not.toMatch(/^(Today|Yesterday)/);
    expect(label).toContain('Sep');
  });

  it('labels anything older with the year, so two Septembers cannot be confused', () => {
    const label = formatVersionTimestamp(secondsAt(-400, 10), NOW);
    expect(label).toContain('2025');
  });

  it('treats a future-dated version as today rather than producing a negative day', () => {
    // A clock that ran fast, then was corrected. Retention keeps these rows, so
    // the list has to render them.
    expect(formatVersionTimestamp(secondsAt(2, 10), NOW)).toMatch(/^Today /);
  });
});
