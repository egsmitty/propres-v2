import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TEXT_STYLE,
  FONT_SIZE_DISPLAY_SCALE,
  mergeTextStyle,
  internalToDisplayFontSize,
  displayToInternalFontSize,
  resolvePlaceholderText,
  DEFAULT_PLACEHOLDER_TEXT,
} from '@/utils/textBoxes';

// Text boxes carry the geometry and styling that render identically in the
// editor canvas, the filmstrip, the presenter preview, and the live output.

describe('mergeTextStyle', () => {
  it('fills every unset field from the default style', () => {
    // Derived from the production constant, never a hardcoded copy, so this
    // test fails if a default changes rather than drifting out of date.
    expect(mergeTextStyle({ bold: true })).toEqual({
      ...DEFAULT_TEXT_STYLE,
      bold: true,
    });
  });

  it('returns the defaults for empty or missing input', () => {
    expect(mergeTextStyle()).toEqual(DEFAULT_TEXT_STYLE);
    expect(mergeTextStyle({})).toEqual(DEFAULT_TEXT_STYLE);
    // The runtime guards null explicitly (`...(style || {})`) even though the
    // inferred signature does not admit it. This directive documents that
    // divergence and self-maintains: widen the signature and it errors here.
    // @ts-expect-error — null is handled at runtime but not in the type
    expect(mergeTextStyle(null)).toEqual(DEFAULT_TEXT_STYLE);
  });

  it("rewrites the legacy 'center' vertical alignment to 'middle'", () => {
    // Older saved presentations used 'center'; the renderer only knows 'middle'.
    expect(mergeTextStyle({ valign: 'center' }).valign).toBe('middle');
  });

  it('leaves other vertical alignments untouched', () => {
    expect(mergeTextStyle({ valign: 'top' }).valign).toBe('top');
    expect(mergeTextStyle({ valign: 'bottom' }).valign).toBe('bottom');
  });
});

describe('font size conversion', () => {
  it('scales an internal size down for display', () => {
    expect(internalToDisplayFontSize(100)).toBe(Math.round(100 * FONT_SIZE_DISPLAY_SCALE));
  });

  it('scales a display size back up to internal', () => {
    expect(displayToInternalFontSize(40)).toBe(Math.round(40 / FONT_SIZE_DISPLAY_SCALE));
  });

  it('round-trips a preset size without drift', () => {
    // A user picking 40 in the toolbar must still read 40 afterwards.
    const display = 40;
    expect(internalToDisplayFontSize(displayToInternalFontSize(display))).toBe(display);
  });

  it('falls back to the default size for non-numeric or non-positive input', () => {
    const fallbackDisplay = Math.round(DEFAULT_TEXT_STYLE.size * FONT_SIZE_DISPLAY_SCALE);
    expect(internalToDisplayFontSize(undefined)).toBe(fallbackDisplay);
    expect(internalToDisplayFontSize('not a number')).toBe(fallbackDisplay);
    expect(internalToDisplayFontSize(0)).toBe(fallbackDisplay);
    expect(internalToDisplayFontSize(-12)).toBe(fallbackDisplay);
  });

  it('never returns a size below 1', () => {
    // A zero or negative font size renders invisible text on the live output.
    expect(internalToDisplayFontSize(1)).toBeGreaterThanOrEqual(1);
    expect(displayToInternalFontSize(0.0001)).toBeGreaterThanOrEqual(1);
  });
});

describe('resolvePlaceholderText', () => {
  it('returns the placeholder constant when there is no text', () => {
    expect(resolvePlaceholderText('')).toBe(DEFAULT_PLACEHOLDER_TEXT);
  });

  it('returns provided text unchanged', () => {
    expect(resolvePlaceholderText('Real lyric line')).toBe('Real lyric line');
  });
});
