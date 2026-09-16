import { describe, it, expect } from 'vitest';
import { formatVersionLabels, formatVersionTimestamp } from '@/utils/versionLabels';

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

  // BEHAVIOUR CHANGE (plan V1, audit SAVE-C6). This case used to assert the
  // day-2-to-6 label carried NO time at all, on the theory that "beyond
  // yesterday the exact minute is noise". That was wrong in practice: with no
  // time, every version saved on the same weekday — which is common under
  // autosave — renders identically, and there is no way to tell them apart.
  // The day is still the headline, but the time is what actually
  // distinguishes one row from the next. Fails on the old code (no time
  // present) and passes on the new.
  it('labels earlier this week by day, WITH the time', () => {
    const label = formatVersionTimestamp(secondsAt(-3, 16), NOW);
    expect(label).not.toMatch(/^(Today|Yesterday)/);
    expect(label).toContain('Sep');
    expect(label).toMatch(/\d{1,2}:\d{2}/);
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

// Plan VH1 (issue #159). BEHAVIOUR CHANGE from plan V1: the seconds
// disambiguator (`(9:31:48 AM)`) is removed — the user found it noise, and it
// could not even tell apart the same-second rows restore's before+after capture
// produces. `formatVersionLabels` now returns the plain per-row timestamp label.
// Same-minute rows may share a label; they stay distinguishable in the modal by
// slide count, order and the Current marker. Fails on the old code (which
// appended seconds), passes on the new.
describe('formatVersionLabels', () => {
  function secondsAtExact(dayOffset: number, hour: number, minute: number, second: number): number {
    const d = new Date(NOW);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, minute, second, 0);
    return Math.floor(d.getTime() / 1000);
  }

  it('returns exactly the plain per-row timestamps', () => {
    const rows = [
      { saved_at: secondsAt(0, 9) },
      { saved_at: secondsAt(-1, 16) },
      { saved_at: secondsAt(-3, 16) },
    ];
    expect(formatVersionLabels(rows, NOW)).toEqual(
      rows.map((r) => formatVersionTimestamp(r.saved_at, NOW))
    );
  });

  it('does NOT append seconds to same-minute rows — each stays the plain label', () => {
    const a = { saved_at: secondsAtExact(0, 9, 14, 5) };
    const b = { saved_at: secondsAtExact(0, 9, 14, 47) };
    const [labelA, labelB] = formatVersionLabels([a, b], NOW);

    // No parenthetical, no seconds component (H:MM:SS) — just the base label,
    // which for two same-minute rows is deliberately identical now.
    const base = formatVersionTimestamp(a.saved_at, NOW);
    expect(labelA).toBe(base);
    expect(labelB).toBe(base);
    expect(labelA).not.toMatch(/\d{1,2}:\d{2}:\d{2}/);
    expect(labelA).not.toContain('(');
  });
});
