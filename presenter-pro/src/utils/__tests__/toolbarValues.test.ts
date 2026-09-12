// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  FONT_OPTIONS,
  getRenderedBodyFontSize,
  normalizeAlignValue,
  normalizeColorValue,
  normalizeFontFamilyValue,
  rgbToHex,
} from '@/utils/toolbarValues';

// Characterization tests (plan F1, slice 2) for the value normalizers lifted
// out of Toolbar.jsx. They sit between what the browser reports about the
// current selection (`rgb(255, 0, 0)`, `"Times New Roman", serif`) and what the
// toolbar's controls can display, so every one of them is a translation the
// user sees the result of.
//
// jsdom is required, not decorative: `getRenderedBodyFontSize` bails out early
// unless `window` and `DOMParser` exist, so under the default node environment
// every case would silently assert the fallback branch.

const EXPECTED_EXPORTS = [
  'FONT_OPTIONS',
  'getRenderedBodyFontSize',
  'normalizeAlignValue',
  'normalizeColorValue',
  'normalizeFontFamilyValue',
  'rgbToHex',
];

describe('toolbarValues module surface', () => {
  it('exports exactly the helpers this file tests', async () => {
    const values = await import('@/utils/toolbarValues');
    expect(Object.keys(values).sort()).toEqual(EXPECTED_EXPORTS);
  });
});

describe('FONT_OPTIONS', () => {
  it('is the exact font list the toolbar offers', () => {
    // Pinned in full: the dropdown, the fallback and the matcher all read this
    // list, so a reorder silently changes the default font.
    expect(FONT_OPTIONS).toEqual([
      'Arial',
      'Helvetica',
      'Georgia',
      'Times New Roman',
      'Trebuchet MS',
      'Avenir Next',
      'Gill Sans',
      'Courier New',
      'Verdana',
    ]);
  });
});

describe('normalizeFontFamilyValue', () => {
  it('recognises every offered font, however the browser quotes it', () => {
    // The quantifier: all nine, not a sample — each one round-trips through the
    // quoted CSS form the browser actually reports.
    FONT_OPTIONS.forEach((font) => {
      expect(normalizeFontFamilyValue(`"${font}", sans-serif`)).toBe(font);
      expect(normalizeFontFamilyValue(font)).toBe(font);
    });
  });

  it('matches case-insensitively', () => {
    expect(normalizeFontFamilyValue('times new roman')).toBe('Times New Roman');
  });

  it('falls back to the first option for a font it does not offer', () => {
    // Derived from the list, not a hardcoded 'Arial'.
    expect(normalizeFontFamilyValue('Comic Sans MS')).toBe(FONT_OPTIONS[0]);
  });

  it('uses the supplied fallback when the value is empty', () => {
    expect(normalizeFontFamilyValue('', 'Georgia')).toBe('Georgia');
    expect(normalizeFontFamilyValue(null, 'Georgia')).toBe('Georgia');
  });

  it('ignores a supplied fallback that is not itself an offered font', () => {
    // The fallback goes through the same matcher, so an unknown one lands on
    // the first option rather than escaping the list.
    expect(normalizeFontFamilyValue('', 'Papyrus')).toBe(FONT_OPTIONS[0]);
  });
});

describe('rgbToHex', () => {
  it('converts rgb and rgba to a padded six-digit hex', () => {
    expect(rgbToHex('rgb(255, 0, 0)')).toBe('#ff0000');
    expect(rgbToHex('rgba(0, 128, 255, 0.5)')).toBe('#0080ff');
  });

  it('pads single-digit channels', () => {
    expect(rgbToHex('rgb(1, 2, 3)')).toBe('#010203');
  });

  it('returns anything that is not an rgb string untouched', () => {
    expect(rgbToHex('#abcdef')).toBe('#abcdef');
    expect(rgbToHex('transparent')).toBe('transparent');
  });
});

describe('normalizeColorValue', () => {
  it('falls back for the three ways a colour can be absent', () => {
    expect(normalizeColorValue('', '#ffffff')).toBe('#ffffff');
    expect(normalizeColorValue('transparent', '#ffffff')).toBe('#ffffff');
    // Chromium reports a fully transparent colour in exactly this spelling.
    expect(normalizeColorValue('rgba(0, 0, 0, 0)', '#ffffff')).toBe('#ffffff');
  });

  it('converts a real colour through rgbToHex', () => {
    expect(normalizeColorValue('rgb(255, 0, 0)', '#ffffff')).toBe('#ff0000');
  });
});

describe('normalizeAlignValue', () => {
  it('maps every alignment the browser reports', () => {
    expect(normalizeAlignValue('justify')).toBe('justify');
    expect(normalizeAlignValue('right')).toBe('right');
    expect(normalizeAlignValue('left')).toBe('left');
    expect(normalizeAlignValue('center')).toBe('center');
  });

  it('reads the alignment out of a compound CSS value', () => {
    // `justify` is tested first in production, so it wins in a compound value.
    expect(normalizeAlignValue('start justify')).toBe('justify');
  });

  it('uses the fallback for anything unrecognised, and centres by default', () => {
    expect(normalizeAlignValue('start', 'right')).toBe('right');
    expect(normalizeAlignValue('')).toBe('center');
    expect(normalizeAlignValue(null)).toBe('center');
  });
});

describe('getRenderedBodyFontSize', () => {
  it('reports the size when every styled node agrees', () => {
    const body = '<span style="font-size: 42px">a</span><span style="font-size: 42px">b</span>';
    expect(getRenderedBodyFontSize(body, 10)).toBe(42);
  });

  it('rounds a fractional size', () => {
    expect(getRenderedBodyFontSize('<span style="font-size: 41.6px">a</span>', 10)).toBe(42);
  });

  it('falls back when the sizes disagree', () => {
    const body = '<span style="font-size: 42px">a</span><span style="font-size: 20px">b</span>';
    expect(getRenderedBodyFontSize(body, 10)).toBe(10);
  });

  it('falls back when nothing carries a pixel size', () => {
    expect(getRenderedBodyFontSize('<span>plain</span>', 10)).toBe(10);
    // Non-px units are ignored rather than converted.
    expect(getRenderedBodyFontSize('<span style="font-size: 2em">a</span>', 10)).toBe(10);
  });

  it('falls back for an empty body', () => {
    expect(getRenderedBodyFontSize('', 10)).toBe(10);
    expect(getRenderedBodyFontSize(null, 10)).toBe(10);
  });
});
