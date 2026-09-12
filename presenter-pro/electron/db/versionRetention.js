// @ts-check
/**
 * How long version history is kept (plan A6) — pure policy, no I/O.
 *
 * CommonJS, not TypeScript, on purpose: `queries/versions.js` requires this and
 * IS unit-tested, and a CJS `require` of a .ts module cannot resolve under
 * Vitest (the same constraint `migrationList.ts` documents from the other
 * side). `// @ts-check` plus JSDoc keeps it type-checked anyway.
 *
 * Time-thinned rather than a flat count: every save from today, then one per
 * day going back, so "yesterday's version" and "last Sunday's version" survive
 * a busy editing session instead of being crushed out by it.
 *
 * `now` is injected so the calendar logic is testable without a clock, and the
 * decision is made here in JS rather than in SQL because local-day arithmetic
 * in SQLite would be unreadable and untestable.
 */

/** Days of history kept. Older versions are dropped — except see rule 4. */
const RETENTION_DAYS = 30;

/**
 * Ceiling on versions kept for a single day. "Keep everything from today" is
 * otherwise unbounded, and a real editing day with a genuine change every
 * couple of minutes reaches several hundred saves.
 */
const MAX_VERSIONS_PER_DAY = 50;

/** @typedef {{ id: number, saved_at: number }} VersionRef */

/** Local calendar day key. Local, not UTC: an 11pm save belongs to that day. */
/** @param {number} epochSeconds @returns {string} */
function dayKey(epochSeconds) {
  const d = new Date(epochSeconds * 1000);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Local midnight for an instant, as epoch ms. */
/** @param {number} ms @returns {number} */
function localMidnight(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Whole days between two instants, by local-midnight difference.
 *
 * Deliberately NOT `(a - b) / 86400`: a DST boundary makes some local days 23
 * or 25 hours long, so seconds arithmetic drifts by a day twice a year.
 * Rounding the midnight-to-midnight span absorbs that.
 */
/** @param {number} laterMs @param {number} earlierMs @returns {number} */
function daysBetween(laterMs, earlierMs) {
  return Math.round((localMidnight(laterMs) - localMidnight(earlierMs)) / 86_400_000);
}

/**
 * The ids to delete. See the plan's 8 rules; the order here mirrors them.
 *
 * Returns ids in ascending order so callers and tests can compare exactly.
 */
/**
 * @param {ReadonlyArray<VersionRef>} versions
 * @param {number} now
 * @returns {number[]}
 */
function versionsToPrune(versions, now) {
  if (versions.length === 0) return [];

  const nowSeconds = Math.floor(now / 1000);
  const todayKey = dayKey(nowSeconds);
  // Rule 5: "newest" is always by id. unixepoch() is second-resolution, so two
  // saves in one second tie on saved_at; ids are monotonic and never reused.
  const ordered = [...versions].sort((a, b) => a.id - b.id);
  const newest = ordered[ordered.length - 1];
  if (!newest) return [];
  const newestOverall = newest.id;

  /** @type {Set<number>} */ const prune = new Set();
  /** @type {VersionRef[]} */ const today = [];
  /** @type {Map<string, VersionRef[]>} */ const byEarlierDay = new Map();

  for (const version of ordered) {
    // Rule 0: a future-dated version (a clock that ran fast, then was corrected)
    // matches none of the rules below, so name it explicitly and keep it.
    if (version.saved_at >= nowSeconds) continue;

    const key = dayKey(version.saved_at);
    if (key === todayKey) {
      today.push(version);
      continue;
    }

    // Rule 3: outside the window. Compared in days, not seconds — see daysBetween.
    if (daysBetween(now, version.saved_at * 1000) > RETENTION_DAYS) {
      prune.add(version.id);
      continue;
    }

    const bucket = byEarlierDay.get(key);
    if (bucket) bucket.push(version);
    else byEarlierDay.set(key, [version]);
  }

  // Rule 1: keep today, capped. `ordered` is ascending, so the oldest go first.
  for (const version of today.slice(0, Math.max(0, today.length - MAX_VERSIONS_PER_DAY))) {
    prune.add(version.id);
  }

  // Rule 2 (with rule 6): one per earlier day, the highest id of that day.
  for (const bucket of byEarlierDay.values()) {
    for (const version of bucket.slice(0, -1)) prune.add(version.id);
  }

  // Rule 4: never leave a presentation with no restore point at all.
  prune.delete(newestOverall);

  return [...prune].sort((a, b) => a - b);
}

module.exports = { RETENTION_DAYS, MAX_VERSIONS_PER_DAY, versionsToPrune };
