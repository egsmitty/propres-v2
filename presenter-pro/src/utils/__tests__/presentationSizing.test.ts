import { describe, it, expect } from 'vitest';
import {
  getPresentationDimensions,
  getPresentationAspectRatio,
  getPresentationScale,
} from '@/utils/presentationSizing';

// Slide rendering scales from these numbers everywhere — canvas, filmstrip,
// presenter preview, and the output window. A silent change here rescales text
// on the live output mid-service, so exactness matters on every value below.

describe('getPresentationDimensions', () => {
  it('returns exactly the declared size for each named ratio', () => {
    // Exhaustive: these four cases are the complete set of branches.
    expect(getPresentationDimensions({ aspectRatio: '16:9' })).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(getPresentationDimensions({ aspectRatio: '4:3' })).toEqual({
      width: 1440,
      height: 1080,
    });
    expect(getPresentationDimensions({ aspectRatio: '16:10' })).toEqual({
      width: 1920,
      height: 1200,
    });
    expect(getPresentationDimensions({ aspectRatio: 'custom' })).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it('defaults to 16:9 when the presentation is missing or has no ratio', () => {
    const expected = { width: 1920, height: 1080 };
    expect(getPresentationDimensions(undefined)).toEqual(expected);
    expect(getPresentationDimensions(null)).toEqual(expected);
    expect(getPresentationDimensions({})).toEqual(expected);
  });

  it('uses custom width and height when the ratio is custom', () => {
    expect(
      getPresentationDimensions({
        aspectRatio: 'custom',
        customAspectWidth: 1280,
        customAspectHeight: 720,
      })
    ).toEqual({ width: 1280, height: 720 });
  });

  it('coerces numeric strings and floors custom dimensions at 1', () => {
    expect(
      getPresentationDimensions({
        aspectRatio: 'custom',
        customAspectWidth: '800',
        customAspectHeight: '600',
      })
    ).toEqual({ width: 800, height: 600 });

    // Zero and negative values would produce a divide-by-zero scale.
    expect(
      getPresentationDimensions({
        aspectRatio: 'custom',
        customAspectWidth: 0,
        customAspectHeight: -50,
      })
    ).toEqual({ width: 1920, height: 1 });
  });
});

describe('getPresentationAspectRatio', () => {
  it('formats dimensions as a CSS aspect-ratio string', () => {
    expect(getPresentationAspectRatio({ aspectRatio: '4:3' })).toBe('1440/1080');
    expect(getPresentationAspectRatio({})).toBe('1920/1080');
  });
});

describe('getPresentationScale', () => {
  it('picks the smaller axis so the slide always fits its container', () => {
    // 16:9 slide in a container that is relatively too tall: width constrains.
    expect(getPresentationScale({ aspectRatio: '16:9' }, 960, 1080)).toBe(0.5);
    // Container relatively too wide: height constrains.
    expect(getPresentationScale({ aspectRatio: '16:9' }, 1920, 540)).toBe(0.5);
  });

  it('returns 1 when either container dimension is missing or zero', () => {
    // A zero here would otherwise produce a scale of 0 and render nothing.
    expect(getPresentationScale({}, 0, 1080)).toBe(1);
    expect(getPresentationScale({}, 1920, 0)).toBe(1);
    expect(getPresentationScale({}, undefined, undefined)).toBe(1);
  });
});
