import { describe, it, expect } from 'vitest';
import { PLACEHOLDER_TEXT_COLOR } from '@/utils/colorPalettes';
import { createTextBox } from '@/utils/textBoxes';
import {
  LEGIBILITY_TEXT_SHADOW,
  MEDIA_OVERLAY,
  textBoxContentStyle,
  textBoxFrameStyle,
} from '@/utils/slideRenderStyle';

// Plan ED36. These two functions are the ONE description of how a text box
// looks, shared by the thumbnails, the presenter, the projector and (slice 3)
// the editor canvas. Every value is native-scale px: the renderer scales the
// whole stage with a single transform, never the numbers.
//
// Whole-object equality on purpose: a key that appears or disappears is a
// change the congregation sees. If an assertion fails, the bug is elsewhere —
// never loosen the assertion to pass.

const STYLED = createTextBox({
  x: 100,
  y: 50,
  width: 800,
  height: 300,
  rotation: 5,
  opacity: 0.5,
  cornerRadius: 9,
  outlineWidth: 3,
  outlineColor: '#ff0000',
  shadowEnabled: true,
  shadowOffsetY: 4,
  shadowBlur: 6,
  shadowColor: 'rgba(0,0,0,0.5)',
  paddingTop: 0,
  paddingLeft: 7,
  textStyle: {
    size: 120,
    bold: true,
    italic: true,
    underline: true,
    align: 'left',
    valign: 'bottom',
    lineHeight: 1.2,
    color: '#00ff00',
    fontFamily: 'Georgia',
  },
});

const DEFAULT_CONTENT = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  paddingTop: 22,
  paddingRight: 28,
  paddingBottom: 22,
  paddingLeft: 28,
  textAlign: 'center',
  color: '#ffffff',
  fontSize: 100,
  fontWeight: 400,
  fontStyle: 'normal',
  textDecoration: 'none',
  lineHeight: 1,
  fontFamily: 'Arial, sans-serif',
  wordBreak: 'break-word',
  whiteSpace: 'normal',
  textShadow: LEGIBILITY_TEXT_SHADOW,
  background: 'transparent',
  border: 'none',
  borderRadius: 14,
  boxShadow: 'none',
  overflow: 'hidden',
  writingMode: 'horizontal-tb',
};

describe('the two constants are the projector’s literal values', () => {
  it('legibility text-shadow and media overlay', () => {
    expect(LEGIBILITY_TEXT_SHADOW).toBe('0 2px 16px rgba(0,0,0,0.9)');
    expect(MEDIA_OVERLAY).toBe('rgba(0,0,0,0.22)');
  });
});

describe('textBoxFrameStyle', () => {
  it('places, rotates and fades the box in native px', () => {
    expect(textBoxFrameStyle(STYLED)).toEqual({
      position: 'absolute',
      left: 100,
      top: 50,
      width: 800,
      height: 300,
      transform: 'rotate(5deg)',
      transformOrigin: 'center center',
      opacity: 0.5,
    });
  });

  it('a default box has no transform and full opacity', () => {
    const box = createTextBox();
    expect(textBoxFrameStyle(box)).toEqual({
      position: 'absolute',
      left: 110,
      top: 105,
      width: 1700,
      height: 870,
      transform: 'none',
      transformOrigin: 'center center',
      opacity: 1,
    });
  });
});

describe('textBoxContentStyle', () => {
  it('renders every stored style field, with the user’s shadow as a BOX shadow', () => {
    expect(textBoxContentStyle(STYLED)).toEqual({
      ...DEFAULT_CONTENT,
      justifyContent: 'flex-end',
      paddingTop: 0,
      paddingLeft: 7,
      textAlign: 'left',
      color: '#00ff00',
      fontSize: 120,
      fontWeight: 700,
      fontStyle: 'italic',
      textDecoration: 'underline',
      lineHeight: 1.2,
      fontFamily: 'Georgia',
      border: '3px solid #ff0000',
      borderRadius: 9,
      boxShadow: '0px 4px 6px rgba(0,0,0,0.5)',
    });
  });

  it('(a) a default box: no outline, no box shadow, default radius and padding', () => {
    expect(textBoxContentStyle(createTextBox())).toEqual(DEFAULT_CONTENT);
  });

  it('(b) a placeholder is grey and italic even when the style is not italic', () => {
    expect(textBoxContentStyle(createTextBox(), { placeholder: true })).toEqual({
      ...DEFAULT_CONTENT,
      color: PLACEHOLDER_TEXT_COLOR,
      fontStyle: 'italic',
    });
  });

  it('(c) wrapText false keeps the text on one line', () => {
    expect(textBoxContentStyle(createTextBox({ wrapText: false }))).toEqual({
      ...DEFAULT_CONTENT,
      whiteSpace: 'nowrap',
      wordBreak: 'normal',
    });
  });

  it('(d) vertical text direction', () => {
    expect(textBoxContentStyle(createTextBox({ textDirection: 'vertical' }))).toEqual({
      ...DEFAULT_CONTENT,
      writingMode: 'vertical-rl',
    });
  });

  it('(e) vertical alignment: top is flex-start, missing is center', () => {
    expect(
      textBoxContentStyle(createTextBox({ textStyle: { valign: 'top' } })).justifyContent
    ).toBe('flex-start');
    expect(textBoxContentStyle(createTextBox({ textStyle: {} })).justifyContent).toBe('center');
  });

  it('(f) an explicit background colour is the fill', () => {
    expect(textBoxContentStyle(createTextBox({ backgroundColor: '#112233' })).background).toBe(
      '#112233'
    );
  });
});
