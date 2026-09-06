import { describe, it, expect } from 'vitest';
import {
  resolveSongSectionType,
  splitTextIntoSlidesByLineCount,
  makeSongGroupLabel,
  parseSongGroupsFromLyrics,
} from '@/utils/songSections';

// Lyric parsing is how a volunteer's pasted text becomes slides on a screen.
// These tests characterize current behavior so the parser cannot drift silently.

describe('resolveSongSectionType', () => {
  it('normalizes the aliases the parser accepts', () => {
    expect(resolveSongSectionType('Pre-Chorus')).toBe('pre-chorus');
    expect(resolveSongSectionType('prechorus')).toBe('pre-chorus');
    expect(resolveSongSectionType('Turn')).toBe('turnaround');
    expect(resolveSongSectionType('T.A.')).toBe('turnaround');
    expect(resolveSongSectionType('Turnaround')).toBe('turnaround');
  });

  it('strips brackets, punctuation, case, and a trailing number', () => {
    expect(resolveSongSectionType('[Verse 2]')).toBe('verse');
    expect(resolveSongSectionType('CHORUS')).toBe('chorus');
    expect(resolveSongSectionType('bridge 3')).toBe('bridge');
  });

  it('returns an empty string for empty input', () => {
    expect(resolveSongSectionType('')).toBe('');
    expect(resolveSongSectionType()).toBe('');
  });
});

describe('splitTextIntoSlidesByLineCount', () => {
  it('chunks lines into slides of the requested size, in order', () => {
    const text = 'one\ntwo\nthree\nfour\nfive';
    // Order and count both matter: this is the slide order on screen.
    expect(splitTextIntoSlidesByLineCount(text, 2)).toEqual(['one\ntwo', 'three\nfour', 'five']);
  });

  it('defaults to two lines per slide', () => {
    expect(splitTextIntoSlidesByLineCount('a\nb\nc')).toEqual(['a\nb', 'c']);
  });

  it('drops blank lines and trims surrounding whitespace', () => {
    expect(splitTextIntoSlidesByLineCount('  a  \n\n\n  b  ', 2)).toEqual(['a\nb']);
  });

  it('normalizes CRLF line endings', () => {
    // Lyrics pasted from Windows apps arrive with \r\n.
    expect(splitTextIntoSlidesByLineCount('a\r\nb', 2)).toEqual(['a\nb']);
  });

  it('returns a single empty slide for empty input rather than an empty list', () => {
    // Callers rely on always getting at least one slide back.
    expect(splitTextIntoSlidesByLineCount('')).toEqual(['']);
    expect(splitTextIntoSlidesByLineCount('   \n  ')).toEqual(['']);
  });
});

describe('makeSongGroupLabel', () => {
  it('uses an explicit label when one is given, stripping brackets', () => {
    expect(makeSongGroupLabel('verse', '[My Label]')).toBe('My Label');
  });

  it('appends the number to the section label when one is given', () => {
    expect(makeSongGroupLabel('chorus', '', '2')).toBe('Chorus 2');
  });

  it('falls back to the section type label with no number', () => {
    expect(makeSongGroupLabel('bridge')).toBe('Bridge');
  });
});

describe('parseSongGroupsFromLyrics', () => {
  it('splits labeled sections into groups, preserving order', () => {
    const groups = parseSongGroupsFromLyrics(
      ['[Verse 1]', 'line a', 'line b', '', '[Chorus]', 'hook one'].join('\n')
    );

    // Structural floor: an empty parse means the parser failed, not that the
    // lyrics had no sections.
    expect(groups.length).toBeGreaterThan(0);
    // Count and order are both asserted — a dropped group must fail here.
    expect(groups.map((group) => group.label)).toEqual(['Verse 1', 'Chorus']);
    expect(groups.map((group) => group.type)).toEqual(['verse', 'chorus']);
  });

  it('gives every parsed group and slide a stable id', () => {
    const groups = parseSongGroupsFromLyrics('[Verse 1]\nline a');
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group.id).toEqual(expect.any(String));
      expect(group.id.length).toBeGreaterThan(0);
      for (const slide of group.slides) {
        expect(slide.id).toEqual(expect.any(String));
        expect(slide.id.length).toBeGreaterThan(0);
      }
    }
  });

  it('returns no groups for empty input', () => {
    expect(parseSongGroupsFromLyrics('')).toEqual([]);
    expect(parseSongGroupsFromLyrics()).toEqual([]);
  });
});

// Phase7 #3: characterization of resolveSongSectionType BEFORE the
// `no-useless-escape` fix in its character class, so the fix is provably
// behaviour-preserving. All five label shapes the app produces or imports.
describe('resolveSongSectionType — bracket/dash/dot stripping', () => {
  it.each([
    ['[Verse 1]', 'verse'],
    ['Chorus 2', 'chorus'],
    ['[Bridge]', 'bridge'],
    ['Pre-Chorus', 'pre-chorus'],
    ['T.A.', 'turnaround'],
    ['[Turn]', 'turnaround'],
  ])('%s → %s', (raw, expected) => {
    expect(resolveSongSectionType(raw)).toBe(expected);
  });
});
