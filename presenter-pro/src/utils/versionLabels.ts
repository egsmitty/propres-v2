/**
 * Human labels for version timestamps (plan A6) — pure, so the calendar logic
 * is testable without rendering and without a clock.
 *
 * `now` is injected for the same reason `versionRetention` injects it: a test
 * that depends on when it runs is a test that fails on a Tuesday.
 */

const TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const WEEKDAY = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const FULL = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** Local midnight for an instant, as epoch ms. */
function localMidnight(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Whole local days between two instants.
 *
 * Midnight-to-midnight rather than `(a - b) / 86400`: a DST boundary makes some
 * local days 23 or 25 hours long, so seconds arithmetic drifts twice a year.
 */
function daysAgo(now: number, thenMs: number): number {
  return Math.round((localMidnight(now) - localMidnight(thenMs)) / 86_400_000);
}

/**
 * `Today 9:14 AM` · `Yesterday 4:02 PM` · `Sun 7 Sep, 4:02 PM` · `7 Sep 2025`
 *
 * Every bucket except the oldest (a year or more back, where the exact time
 * is genuinely noise) carries a time, because the day alone is not enough to
 * tell two versions apart — under autosave, several can land on the same day
 * (plan V1, audit SAVE-C6; days 2-6 used to drop the time entirely).
 */
export function formatVersionTimestamp(savedAtSeconds: number, now: number): string {
  const ms = savedAtSeconds * 1000;
  const days = daysAgo(now, ms);
  const date = new Date(ms);

  if (days <= 0) return `Today ${TIME.format(date)}`;
  if (days === 1) return `Yesterday ${TIME.format(date)}`;
  if (days < 7) return `${WEEKDAY.format(date)}, ${TIME.format(date)}`;
  return FULL.format(date);
}

/**
 * Labels for a whole list of versions.
 *
 * Plan V1 once appended the exact time-with-seconds to any label that collided
 * with another in the list. Plan VH1 (issue #159) removes that: the seconds read
 * as noise, and restore's before+after capture can land two versions in the same
 * second anyway, where the disambiguator repeated identically and helped nothing.
 * Same-minute rows now share their plain label and stay distinguishable in the
 * modal by slide count, order and the Current marker.
 */
export function formatVersionLabels(
  versions: ReadonlyArray<{ saved_at: number }>,
  now: number
): string[] {
  return versions.map((v) => formatVersionTimestamp(v.saved_at, now));
}
