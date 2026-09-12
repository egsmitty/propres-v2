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
 * `Today 9:14 AM` · `Yesterday 4:02 PM` · `Sun 7 Sep` · `7 Sep 2025`
 *
 * Times only for today and yesterday — beyond that the exact minute is noise,
 * and the day is what someone is actually looking for.
 */
export function formatVersionTimestamp(savedAtSeconds: number, now: number): string {
  const ms = savedAtSeconds * 1000;
  const days = daysAgo(now, ms);
  const date = new Date(ms);

  if (days <= 0) return `Today ${TIME.format(date)}`;
  if (days === 1) return `Yesterday ${TIME.format(date)}`;
  if (days < 7) return WEEKDAY.format(date);
  return FULL.format(date);
}
