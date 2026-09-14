import { describe, it, expect } from 'vitest';
import { PRESENTATION_TEMPLATES } from '@/utils/presentationTemplates';

// HOME-12 (plan H2): a template's `description` must not promise sections
// its `buildPresentation()` doesn't create. Real hymn titles from
// shared/hymns.json:5,41,77,114 — buildPresentation reads `song.title`, so
// the fixture titles must match what the app actually seeds for a section
// title to come out meaningfully comparable.
const SONG_LIBRARY = [
  { id: 'song-amazing-grace', title: 'Amazing Grace', builtInKey: 'amazing-grace' },
  {
    id: 'song-all-creatures',
    title: 'All Creatures of Our God and King',
    builtInKey: 'all-creatures-of-our-god-and-king',
  },
  { id: 'song-how-great', title: 'How Great Thou Art', builtInKey: 'how-great-thou-art' },
  {
    id: 'song-great-is-thy',
    title: 'Great Is Thy Faithfulness',
    builtInKey: 'great-is-thy-faithfulness',
  },
];

// The exact section titles each template creates today (verified by hand
// against `buildPresentation` output before writing this table — see plan
// H2 "Measured"). This IS "what the description promises": each entry was
// authored to match the (corrected, for the two previously-broken
// templates) description text below. Order and count matter — sections
// play in this order, and the prose names them in that order.
const EXPECTED_SECTION_TITLES: Record<string, string[]> = {
  'sunday-service': [
    'Pre-Service Announcements',
    'Amazing Grace',
    'All Creatures of Our God and King',
    'How Great Thou Art',
    'Sermon',
    'Great Is Thy Faithfulness',
  ],
  'worship-set': ['Amazing Grace', 'All Creatures of Our God and King', 'How Great Thou Art'],
  'sermon-scripture': ['Sermon', 'Scripture Reading'],
  'featured-sunday-example': [
    'Pre-Service Announcements',
    'Amazing Grace',
    'Great Is Thy Faithfulness',
    'Scripture Reading',
    'Message',
  ],
  'announcement-loop': ['Pre-Service Announcements'],
  'student-night': ['Welcome', 'Game Moment', 'Message'],
  'prayer-night': ['Gathering', 'Guided Prayer'],
};

// Regression guard for the two templates whose description previously named
// sections that were never created. Word-boundary regexes so this can't
// false-positive on an unrelated substring.
const FORBIDDEN_DESCRIPTION_WORDS: Record<string, RegExp[]> = {
  'student-night': [/\bworship\b/i],
  'prayer-night': [/\bscripture\b/i, /\breflection\b/i, /\bclosing worship\b/i],
};

describe('PRESENTATION_TEMPLATES section/description accuracy', () => {
  // Exhaustiveness: every real template must have a table entry, and the
  // table must not silently drift from the template list either direction.
  it('has an EXPECTED_SECTION_TITLES entry for every template, and only those', () => {
    const templateIds = PRESENTATION_TEMPLATES.map((template) => template.id);
    expect(templateIds).toHaveLength(7);
    templateIds.forEach((id) => {
      expect(Object.prototype.hasOwnProperty.call(EXPECTED_SECTION_TITLES, id)).toBe(true);
    });
    expect(Object.keys(EXPECTED_SECTION_TITLES)).toHaveLength(7);
  });

  it.each(PRESENTATION_TEMPLATES.map((template) => [template.id, template] as const))(
    'builds exactly the sections its description promises: %s',
    async (id, template) => {
      // @ts-expect-error — presentationTemplates.js is untyped JS; TS infers
      // songLibrary as `never[]` from its `= []` default, which the real
      // fixture (real song shapes) correctly doesn't satisfy.
      const result = await template.buildPresentation({ songLibrary: SONG_LIBRARY });
      const actualTitles = result.sections.map((section: { title: string }) => section.title);
      // Exactness matters: order AND count AND content, not a subset check.
      expect(actualTitles).toEqual(EXPECTED_SECTION_TITLES[id]);
    }
  );

  it.each(Object.entries(FORBIDDEN_DESCRIPTION_WORDS))(
    "%s's description no longer promises a section it doesn't create",
    (id, forbiddenWords) => {
      const template = PRESENTATION_TEMPLATES.find((item) => item.id === id);
      expect(template).toBeDefined();
      forbiddenWords.forEach((pattern) => {
        expect(template?.description).not.toMatch(pattern);
      });
    }
  );
});
