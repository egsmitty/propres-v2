import { describe, it, expect } from 'vitest';
import { FIRST_RUN_PRESENTATION } from '../firstRunSeed';

// SONG-28 (legal, P1): the first-run sample presentation must ship only
// public-domain lyrics. `FIRST_RUN_PRESENTATION` is pure data (no electron,
// no better-sqlite3), so it is exercised directly rather than through
// `seed(db)`. See tasks/plan-S1-first-run-seed.md for the full write-up.

const BANNED_PHRASES = [
  'my chains are gone',
  'how great is our god',
  'worthy of every song',
  'holy there is no one like you',
  'the splendor of the king',
] as const;

// Deliberately broad by design (case-insensitive substring), never narrowed —
// this must catch a re-wording, not just the exact removed string. See the
// plan's "Comparisons" note.
function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
  } else if (value && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      collectStrings((value as Record<string, unknown>)[key], out);
    }
  }
  return out;
}

// Exact key check, not a sample: every key at every depth is visited.
function collectCcliEntries(
  value: unknown,
  out: Array<{ key: string; value: unknown }> = []
): Array<{ key: string; value: unknown }> {
  if (Array.isArray(value)) {
    for (const item of value) collectCcliEntries(item, out);
  } else if (value && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const entryValue = (value as Record<string, unknown>)[key];
      if (/^ccli$/i.test(key) && entryValue) {
        out.push({ key, value: entryValue });
      }
      collectCcliEntries(entryValue, out);
    }
  }
  return out;
}

describe('FIRST_RUN_PRESENTATION', () => {
  it('contains none of the 5 banned copyrighted phrases, in any string, anywhere', () => {
    const strings = collectStrings(FIRST_RUN_PRESENTATION);
    // Structural precondition for the sweep itself: if there is nothing to
    // scan, the harness is broken, not passing.
    expect(strings.length).toBeGreaterThan(0);

    const hits: Array<{ phrase: string; in: string }> = [];
    for (const phrase of BANNED_PHRASES) {
      for (const s of strings) {
        if (s.toLowerCase().includes(phrase)) {
          hits.push({ phrase, in: s });
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('carries no CCLI number on any seeded item', () => {
    const ccliEntries = collectCcliEntries(FIRST_RUN_PRESENTATION);
    expect(ccliEntries).toEqual([]);
  });

  it('has a structural floor: at least one section and at least one slide', () => {
    expect(FIRST_RUN_PRESENTATION.sections.length).toBeGreaterThanOrEqual(1);
    const totalSlides = FIRST_RUN_PRESENTATION.sections.reduce(
      (sum, section) => sum + section.slides.length,
      0
    );
    expect(totalSlides).toBeGreaterThanOrEqual(1);
  });
});
