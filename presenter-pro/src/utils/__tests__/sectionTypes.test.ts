import { describe, it, expect } from 'vitest';
import {
  SECTION_TYPE_META,
  SONG_PART_TYPES,
  normalizeSectionType,
  isKnownSectionType,
  getSectionTypeLabel,
  getSectionContentLabel,
  isMediaSlide,
} from '@/utils/sectionTypes';

// This module holds TWO vocabularies. They used to have confusingly similar
// names — `SECTION_TYPES` for song parts against `SECTION_TYPE_META` for
// presentation sections — which plan F0 renamed apart:
//
//   SONG_PART_TYPES   — song *part* labels (verse, chorus, bridge, …), used by
//                       the song editor and the lyric parser.
//   SECTION_TYPE_META — presentation *section* kinds (song, announcement,
//                       sermon), which is what normalizeSectionType speaks.
//
// The names no longer collide, but the coercion still exists:
// normalizeSectionType('verse') returns 'announcement', not 'verse'. That is
// current behavior and these tests pin it; see tasks/phase7-remediation.md
// before "fixing" it.

describe('normalizeSectionType', () => {
  it('passes through every known presentation section kind', () => {
    // Self-enforcing: iterates the real registry, so a new kind that is not
    // handled fails here instead of being missed by a hardcoded list.
    const kinds = Object.keys(SECTION_TYPE_META);
    expect(kinds.length).toBeGreaterThan(0);
    for (const kind of kinds) {
      expect(normalizeSectionType(kind)).toBe(kind);
    }
  });

  it('coerces anything unknown to announcement', () => {
    expect(normalizeSectionType('custom')).toBe('announcement');
    expect(normalizeSectionType('not-a-real-type')).toBe('announcement');
    expect(normalizeSectionType(undefined)).toBe('announcement');
    expect(normalizeSectionType(null)).toBe('announcement');
  });

  it('coerces song-part labels to announcement, since they are a different vocabulary', () => {
    // Documents the landmine above rather than asserting it is correct.
    expect(normalizeSectionType('verse')).toBe('announcement');
    expect(normalizeSectionType('chorus')).toBe('announcement');
  });
});

describe('isKnownSectionType', () => {
  it('is true for exactly the presentation section kinds', () => {
    for (const kind of Object.keys(SECTION_TYPE_META)) {
      expect(isKnownSectionType(kind)).toBe(true);
    }
    expect(isKnownSectionType('verse')).toBe(false);
    expect(isKnownSectionType('nope')).toBe(false);
  });
});

describe('church-facing labels', () => {
  it('uses the content label each section kind speaks (Phase 5A)', () => {
    // Lyrics / Text / Notes — the terminology volunteers see.
    expect(getSectionContentLabel('song')).toBe('Lyrics');
    expect(getSectionContentLabel('announcement')).toBe('Text');
    expect(getSectionContentLabel('sermon')).toBe('Notes');
  });

  it('gives every section kind a non-empty label and content label', () => {
    const kinds = Object.keys(SECTION_TYPE_META);
    expect(kinds.length).toBeGreaterThan(0);
    for (const kind of kinds) {
      expect(getSectionTypeLabel(kind)).toBeTruthy();
      expect(getSectionContentLabel(kind)).toBeTruthy();
    }
  });
});

describe('SONG_PART_TYPES (song part vocabulary)', () => {
  it('gives every song part a unique id, label, abbreviation, and color', () => {
    expect(SONG_PART_TYPES.length).toBeGreaterThan(0);

    const ids = SONG_PART_TYPES.map((type) => type.id);
    // Exactness: a duplicated id would make getSongPart return the wrong
    // part, so compare the deduplicated count to the full count.
    expect(new Set(ids).size).toBe(ids.length);

    for (const type of SONG_PART_TYPES) {
      expect(type.label).toBeTruthy();
      expect(type.abbr).toBeTruthy();
      expect(type.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('isMediaSlide', () => {
  it('requires both a media type and a mediaId', () => {
    expect(isMediaSlide({ type: 'media', mediaId: 'm-1' })).toBe(true);
    // A half-formed media slide must not be treated as one, or the section
    // background would be suppressed behind nothing.
    expect(isMediaSlide({ type: 'media', mediaId: null })).toBe(false);
    expect(isMediaSlide({ type: 'text', mediaId: 'm-1' })).toBe(false);
  });

  it('is false for a missing slide', () => {
    expect(isMediaSlide(null)).toBe(false);
    expect(isMediaSlide(undefined)).toBe(false);
  });
});
