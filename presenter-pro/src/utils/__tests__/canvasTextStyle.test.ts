import { describe, it, expect } from 'vitest';
import { DEFAULT_TEXT_COLOR } from '@/utils/colorPalettes';
import {
  baseHighlightStyle,
  cycleCase,
  renderOutline,
  renderShadow,
  renderTextDecoration,
  resolveVerticalAlignment,
} from '@/utils/canvasTextStyle';

// Characterization tests (plan F1) for the text-style helpers lifted out of
// Canvas.jsx. Every expectation describes what the canvas already renders; a
// failure means the extraction is wrong, never that the number should move.
//
// These strings go straight into inline styles on the live output, so an
// invisible change here is a change the congregation sees.

// `renderTextBody` is deliberately NOT here. It returns JSX, which makes it a
// component by this repo's taxonomy, and moving it would drop Canvas.jsx below
// its exact inline-style ceiling (plan E4's ratchet fails in both directions).
// It stays in Canvas.jsx and imports `baseHighlightStyle` — the only logic it
// had — from this module, which IS tested below.
const EXPECTED_EXPORTS = [
  'baseHighlightStyle',
  'cycleCase',
  'renderOutline',
  'renderShadow',
  'renderTextDecoration',
  'resolveVerticalAlignment',
];

describe('canvasTextStyle module surface', () => {
  it('exports exactly the helpers this file tests', async () => {
    const textStyle = await import('@/utils/canvasTextStyle');
    expect(Object.keys(textStyle).sort()).toEqual(EXPECTED_EXPORTS);
  });
});

describe('resolveVerticalAlignment', () => {
  it('maps each vertical alignment to its flex value', () => {
    expect(resolveVerticalAlignment({ valign: 'top' })).toBe('flex-start');
    expect(resolveVerticalAlignment({ valign: 'bottom' })).toBe('flex-end');
    expect(resolveVerticalAlignment({ valign: 'center' })).toBe('center');
  });

  it('centres when the style is missing or says nothing', () => {
    expect(resolveVerticalAlignment(null)).toBe('center');
    expect(resolveVerticalAlignment(undefined)).toBe('center');
    expect(resolveVerticalAlignment({})).toBe('center');
  });
});

describe('renderOutline', () => {
  it('is none when there is no width', () => {
    expect(renderOutline({})).toBe('none');
    expect(renderOutline({ outlineWidth: 0 })).toBe('none');
  });

  it('is none when the colour is transparent, whatever the width', () => {
    expect(renderOutline({ outlineWidth: 4, outlineColor: 'transparent' })).toBe('none');
  });

  it('falls back to the default text colour and a solid style', () => {
    // Derived from the production constant, not a copy of its value.
    expect(renderOutline({ outlineWidth: 2 })).toBe(`2px solid ${DEFAULT_TEXT_COLOR}`);
  });

  it('never draws thinner than one pixel', () => {
    expect(renderOutline({ outlineWidth: 0.4 })).toBe(`1px solid ${DEFAULT_TEXT_COLOR}`);
  });

  it('uses the style and colour it is given', () => {
    expect(
      renderOutline({ outlineWidth: 3, outlineStyle: 'dashed', outlineColor: '#ff0000' })
    ).toBe('3px dashed #ff0000');
  });
});

describe('renderShadow', () => {
  it('is none unless the shadow is switched on', () => {
    expect(renderShadow({})).toBe('none');
    expect(renderShadow({ shadowEnabled: false, shadowBlur: 40 })).toBe('none');
  });

  it('uses the drop-shadow defaults when only the switch is set', () => {
    expect(renderShadow({ shadowEnabled: true })).toBe('0px 10px 18px rgba(0,0,0,0.35)');
  });

  it('never blurs less than two pixels', () => {
    expect(renderShadow({ shadowEnabled: true, shadowBlur: 1 })).toBe(
      '0px 10px 2px rgba(0,0,0,0.35)'
    );
  });

  it('uses every value it is given', () => {
    expect(
      renderShadow({
        shadowEnabled: true,
        shadowOffsetX: 4,
        shadowOffsetY: 6,
        shadowBlur: 12,
        shadowColor: '#000000',
      })
    ).toBe('4px 6px 12px #000000');
  });
});

describe('renderTextDecoration', () => {
  it('is none when nothing is decorated', () => {
    expect(renderTextDecoration({})).toBe('none');
    expect(renderTextDecoration(null)).toBe('none');
  });

  it('renders each decoration, and both together in a fixed order', () => {
    expect(renderTextDecoration({ underline: true })).toBe('underline');
    expect(renderTextDecoration({ strikethrough: true })).toBe('line-through');
    expect(renderTextDecoration({ underline: true, strikethrough: true })).toBe(
      'underline line-through'
    );
  });
});

describe('baseHighlightStyle', () => {
  it('is null when there is no highlight to draw', () => {
    expect(baseHighlightStyle({})).toBe(null);
    expect(baseHighlightStyle(null)).toBe(null);
    expect(baseHighlightStyle({ highlightColor: 'transparent' })).toBe(null);
  });

  it('builds the full highlight style, including both box-decoration spellings', () => {
    // boxDecorationBreak must be set twice — the unprefixed property is what
    // Chromium reads, the prefixed one is what it has historically honoured.
    expect(baseHighlightStyle({ highlightColor: '#ffff00' })).toEqual({
      display: 'inline-block',
      maxWidth: '100%',
      backgroundColor: '#ffff00',
      boxDecorationBreak: 'clone',
      WebkitBoxDecorationBreak: 'clone',
      padding: '0 0.05em',
    });
  });
});

describe('cycleCase', () => {
  const SOURCE = 'hELLo wORLD';

  it('applies each case mode in order', () => {
    expect(cycleCase(SOURCE, 0)).toBe('Hello world'); // sentence
    expect(cycleCase(SOURCE, 1)).toBe('hello world'); // lower
    expect(cycleCase(SOURCE, 2)).toBe('HELLO WORLD'); // upper
    expect(cycleCase(SOURCE, 3)).toBe('Hello World'); // title
    expect(cycleCase(SOURCE, 4)).toBe('HellO World'); // toggle
  });

  it('toggles each character individually', () => {
    // Spelled out rather than derived, because toggle is the one mode whose
    // result is not obvious: every upper becomes lower and vice versa, and a
    // space counts as upper (it equals its own uppercase).
    expect(cycleCase('aBc', 4)).toBe('AbC');
  });

  it('repeats every five steps, for every mode', () => {
    // The quantifier: all five modes wrap, not just the first.
    for (let index = 0; index < 5; index += 1) {
      expect(cycleCase(SOURCE, index + 5)).toBe(cycleCase(SOURCE, index));
    }
  });
});
