/**
 * Human labels for version timestamps (plan A6) — pure, so the calendar logic
 * is testable without rendering and without a clock.
 *
 * `now` is injected for the same reason `versionRetention` injects it: a test
 * that depends on when it runs is a test that fails on a Tuesday.
 */

const TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const TIME_WITH_SECONDS = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
});
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
 * Labels for a WHOLE list of versions at once (plan V1, audit SAVE-C6).
 * `formatVersionTimestamp` alone renders at minute precision (or, for the
 * oldest bucket, day precision only), so several restore points captured
 * close together — routine under autosave — can render as indistinguishable
 * duplicates: fifty rows all reading "Today 9:14 AM". Any label that collides
 * with another one in THIS list gets its exact time (with seconds) appended
 * so the two rows are never identical on screen; a label with no collision is
 * left untouched.
 */
export function formatVersionLabels(
  versions: ReadonlyArray<{ saved_at: number }>,
  now: number
): string[] {
  const base = versions.map((v) => formatVersionTimestamp(v.saved_at, now));
  const counts = new Map<string, number>();
  for (const label of base) counts.set(label, (counts.get(label) ?? 0) + 1);

  return versions.map((v, i) => {
    const label = base[i]!;
    if ((counts.get(label) ?? 0) <= 1) return label;
    return `${label} (${TIME_WITH_SECONDS.format(new Date(v.saved_at * 1000))})`;
  });
}
