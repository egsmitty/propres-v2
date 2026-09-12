/**
 * Text and style helpers lifted out of `Canvas.jsx` (plan F1).
 *
 * Each one turns a stored text-box style into the exact CSS string the canvas
 * and the live output render. They were pure already; they are here so they can
 * be tested without rendering — a silent change to any of these strings is a
 * change the congregation sees.
 *
 * `renderTextBody` stays in `Canvas.jsx` on purpose: it returns JSX, which
 * makes it a component rather than a helper, and it imports `baseHighlightStyle`
 * from here — the only logic it had.
 */

import { DEFAULT_TEXT_COLOR } from '@/utils/colorPalettes';

/** The stored style of a text box. Every field is optional by design: a style
 *  written by an older build simply has fewer of them. */
export interface TextBoxStyle {
  valign?: string;
  align?: string;
  underline?: boolean;
  strikethrough?: boolean;
  highlightColor?: string;
  outlineWidth?: number;
  outlineStyle?: string;
  outlineColor?: string;
  shadowEnabled?: boolean;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowBlur?: number;
  shadowColor?: string;
}

export interface HighlightStyle {
  display: string;
  maxWidth: string;
  backgroundColor: string;
  boxDecorationBreak: string;
  WebkitBoxDecorationBreak: string;
  padding: string;
}

export function resolveVerticalAlignment(textStyle: TextBoxStyle | null | undefined): string {
  if (textStyle?.valign === 'top') return 'flex-start';
  if (textStyle?.valign === 'bottom') return 'flex-end';
  return 'center';
}

export function renderOutline(box: TextBoxStyle): string {
  const width = box.outlineWidth || 0;
  if (!width || box.outlineColor === 'transparent') return 'none';
  return `${Math.max(1, width)}px ${box.outlineStyle || 'solid'} ${box.outlineColor || DEFAULT_TEXT_COLOR}`;
}

export function renderShadow(box: TextBoxStyle): string {
  if (!box.shadowEnabled) return 'none';
  return `${box.shadowOffsetX || 0}px ${box.shadowOffsetY || 10}px ${Math.max(2, box.shadowBlur || 18)}px ${box.shadowColor || 'rgba(0,0,0,0.35)'}`;
}

export function renderTextDecoration(style: TextBoxStyle | null | undefined): string {
  return (
    [style?.underline ? 'underline' : null, style?.strikethrough ? 'line-through' : null]
      .filter(Boolean)
      .join(' ') || 'none'
  );
}

export function baseHighlightStyle(style: TextBoxStyle | null | undefined): HighlightStyle | null {
  const color = style?.highlightColor;
  if (!color || color === 'transparent') return null;
  return {
    display: 'inline-block',
    maxWidth: '100%',
    backgroundColor: color,
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone',
    padding: '0 0.05em',
  };
}

export function cycleCase(text: string, index: number): string {
  const modes = ['sentence', 'lower', 'upper', 'title', 'toggle'];
  const mode = modes[index % modes.length];
  if (mode === 'lower') return text.toLowerCase();
  if (mode === 'upper') return text.toUpperCase();
  if (mode === 'title')
    return text.replace(
      /\w\S*/g,
      (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    );
  if (mode === 'toggle')
    return text
      .split('')
      .map((char) => (char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase()))
      .join('');
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}
