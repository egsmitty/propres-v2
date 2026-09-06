import { describe, it, expect } from 'vitest';
import {
  getEffectiveBackgroundId,
  withEffectiveBackground,
  normalizePresentation,
  fileUrlForPath,
} from '@/utils/backgrounds';

// Section background is the primary background model (Phase 5C): a background
// persists underneath text across slide changes within a section until it is
// changed. `getEffectiveBackgroundId` is the single place that resolution
// happens, so its precedence order is load-bearing for live output.

const presentation = {
  aspectRatio: '16:9',
  sections: [
    {
      id: 'sec-song',
      type: 'song',
      backgroundId: 'bg-section',
      slides: [],
    },
    { id: 'sec-bare', type: 'announcement', backgroundId: null, slides: [] },
  ],
};

describe('getEffectiveBackgroundId precedence', () => {
  // Order matters and is the whole point of this function: an explicitly
  // resolved id beats a slide override, which beats the section background.
  it('prefers an already-resolved effectiveBackgroundId above all else', () => {
    const slide = {
      id: 's1',
      type: 'text',
      effectiveBackgroundId: 'bg-resolved',
      backgroundId: 'bg-slide',
    };
    expect(getEffectiveBackgroundId(presentation, 'sec-song', slide)).toBe('bg-resolved');
  });

  it('prefers a slide-level override over the section background', () => {
    const slide = { id: 's1', type: 'text', backgroundId: 'bg-slide' };
    expect(getEffectiveBackgroundId(presentation, 'sec-song', slide)).toBe('bg-slide');
  });

  it('inherits the section background when the slide has no override', () => {
    const slide = { id: 's1', type: 'text', backgroundId: null };
    expect(getEffectiveBackgroundId(presentation, 'sec-song', slide)).toBe('bg-section');
  });

  it('resolves to null when neither slide nor section carries a background', () => {
    const slide = { id: 's1', type: 'text', backgroundId: null };
    expect(getEffectiveBackgroundId(presentation, 'sec-bare', slide)).toBeNull();
  });

  it('resolves to null for an unknown section id', () => {
    const slide = { id: 's1', type: 'text', backgroundId: null };
    expect(getEffectiveBackgroundId(presentation, 'sec-does-not-exist', slide)).toBeNull();
  });

  it('returns null when there is no slide at all', () => {
    expect(getEffectiveBackgroundId(presentation, 'sec-song', null)).toBeNull();
    expect(getEffectiveBackgroundId(presentation, 'sec-song', undefined)).toBeNull();
  });
});

describe('getEffectiveBackgroundId for media slides', () => {
  // Phase 5F: a media slide takes over the output cleanly and the section
  // background must NOT continue behind it.
  it('returns null for a media slide even when the section has a background', () => {
    const mediaSlide = { id: 's1', type: 'media', mediaId: 'media-1' };
    expect(getEffectiveBackgroundId(presentation, 'sec-song', mediaSlide)).toBeNull();
  });

  it('does not treat a media-typed slide without a mediaId as a media slide', () => {
    // isMediaSlide requires BOTH type and mediaId; a half-formed slide falls
    // back to normal background inheritance rather than going transparent.
    const halfFormed = { id: 's1', type: 'media', mediaId: null };
    expect(getEffectiveBackgroundId(presentation, 'sec-song', halfFormed)).toBe('bg-section');
  });
});

describe('withEffectiveBackground', () => {
  it('stamps the resolved background and owning section onto the slide', () => {
    const slide = { id: 's1', type: 'text', backgroundId: null };
    expect(withEffectiveBackground(presentation, 'sec-song', slide)).toEqual({
      id: 's1',
      type: 'text',
      backgroundId: null,
      sectionId: 'sec-song',
      effectiveBackgroundId: 'bg-section',
    });
  });

  it('passes a missing slide straight through', () => {
    expect(withEffectiveBackground(presentation, 'sec-song', null)).toBeNull();
  });
});

describe('normalizePresentation', () => {
  it('fills defaults without dropping sections or slides', () => {
    const normalized = normalizePresentation({
      sections: [{ id: 'sec-1', type: 'song', slides: [{ id: 'sl-1', body: 'line' }] }],
    });

    // Structural floor: a normalizer that silently empties its input is the
    // failure mode this test exists to catch.
    expect(normalized.sections).toHaveLength(1);
    expect(normalized.sections[0].slides).toHaveLength(1);

    expect(normalized.aspectRatio).toBe('16:9');
    expect(normalized.sections[0].backgroundId).toBeNull();
    expect(normalized.sections[0].slides[0].backgroundId).toBeNull();
    expect(normalized.sections[0].slides[0].mediaId).toBeNull();
  });

  it('coerces an unrecognized section type to announcement', () => {
    const normalized = normalizePresentation({
      sections: [{ id: 'sec-1', type: 'not-a-real-type', slides: [] }],
    });
    expect(normalized.sections[0].type).toBe('announcement');
  });

  it('passes a falsy presentation straight through', () => {
    expect(normalizePresentation(null)).toBeNull();
    expect(normalizePresentation(undefined)).toBeUndefined();
  });
});

describe('fileUrlForPath', () => {
  it('returns an empty string for a missing path', () => {
    expect(fileUrlForPath('')).toBe('');
    expect(fileUrlForPath(null)).toBe('');
    expect(fileUrlForPath(undefined)).toBe('');
  });

  it('passes an already-custom-scheme url through untouched', () => {
    const url = 'presenterpro-media://abc123';
    expect(fileUrlForPath(url)).toBe(url);
  });
});
