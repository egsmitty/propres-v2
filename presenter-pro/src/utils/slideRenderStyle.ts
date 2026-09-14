/**
 * Plan ED36 — the one description of how a slide's text box looks.
 *
 * Every renderer (filmstrip thumbnails, Home cards, the presenter panel, the
 * projector and the editor canvas) lays the slide out at the presentation's
 * native size and scales the whole stage with a single CSS transform. So every
 * value here is a native-scale pixel number or a CSS string that the browser
 * will scale for us — nothing is multiplied by a scale factor, and there are no
 * "minimum screen pixels" floors. Those floors were why a thumbnail wrapped its
 * lines differently from the wall.
 *
 * Two values used to differ between the editor and the projector. The projector
 * is what the congregation sees, so its values are the truth:
 *   - every text box carries a legibility text-shadow;
 *   - a media background is darkened by a fixed overlay.
 * The user's own "Shadow" setting is a *box* shadow (it lives beside fill,
 * outline and corner radius — PowerPoint's shape effects), rendered by
 * `renderShadow` from `canvasTextStyle`, the F1-characterized helper.
 */

import type { CSSProperties } from 'react';
import { DEFAULT_TEXT_COLOR, PLACEHOLDER_TEXT_COLOR } from '@/utils/colorPalettes';
import { DEFAULT_TEXT_BOX, DEFAULT_TEXT_STYLE } from '@/utils/textBoxes';
import {
  renderOutline,
  renderShadow,
  renderTextDecoration,
  resolveTextBoxPadding,
  resolveVerticalAlignment,
} from '@/utils/canvasTextStyle';

export const LEGIBILITY_TEXT_SHADOW = '0 2px 16px rgba(0,0,0,0.9)';
export const MEDIA_OVERLAY = 'rgba(0,0,0,0.22)';

interface TextStyleFields {
  size?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  align?: string;
  valign?: string;
  lineHeight?: number;
  fontFamily?: string;
  highlightColor?: string;
}

/** A normalized text box (`getSlideTextBoxes`); every frame field is present. */
export interface RenderableTextBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  cornerRadius?: number;
  backgroundColor?: string;
  wrapText?: boolean;
  textDirection?: string;
  outlineWidth?: number;
  outlineStyle?: string;
  outlineColor?: string;
  shadowEnabled?: boolean;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowBlur?: number;
  shadowColor?: string;
  paddingTop?: number | null;
  paddingRight?: number | null;
  paddingBottom?: number | null;
  paddingLeft?: number | null;
  textStyle?: TextStyleFields | null;
}

export interface ContentStyleOptions {
  /** The box shows its placeholder rather than a body: grey and italic. */
  placeholder?: boolean;
}

/** Where the box sits on the native-size stage. */
export function textBoxFrameStyle(box: RenderableTextBox): CSSProperties {
  return {
    position: 'absolute',
    left: box.x,
    top: box.y,
    width: box.width,
    height: box.height,
    transform: box.rotation ? `rotate(${box.rotation}deg)` : 'none',
    transformOrigin: 'center center',
    opacity: box.opacity ?? 1,
  };
}

/** How the box and its text look, filling the frame. */
export function textBoxContentStyle(
  box: RenderableTextBox,
  { placeholder = false }: ContentStyleOptions = {}
): CSSProperties {
  const style = box.textStyle || {};
  const padding = resolveTextBoxPadding(box, DEFAULT_TEXT_BOX);
  return {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: resolveVerticalAlignment(style),
    paddingTop: padding.paddingTop,
    paddingRight: padding.paddingRight,
    paddingBottom: padding.paddingBottom,
    paddingLeft: padding.paddingLeft,
    textAlign: (style.align || 'center') as CSSProperties['textAlign'],
    color: placeholder ? PLACEHOLDER_TEXT_COLOR : style.color || DEFAULT_TEXT_COLOR,
    fontSize: style.size || DEFAULT_TEXT_STYLE.size,
    fontWeight: style.bold ? 700 : 400,
    fontStyle: placeholder ? 'italic' : style.italic ? 'italic' : 'normal',
    textDecoration: renderTextDecoration(style),
    lineHeight: style.lineHeight || DEFAULT_TEXT_STYLE.lineHeight,
    fontFamily: style.fontFamily || DEFAULT_TEXT_STYLE.fontFamily,
    wordBreak: box.wrapText === false ? 'normal' : 'break-word',
    whiteSpace: box.wrapText === false ? 'nowrap' : 'normal',
    textShadow: LEGIBILITY_TEXT_SHADOW,
    background: box.backgroundColor || 'transparent',
    border: renderOutline(box),
    borderRadius: box.cornerRadius ?? DEFAULT_TEXT_BOX.cornerRadius,
    boxShadow: renderShadow(box),
    overflow: 'hidden',
    writingMode: box.textDirection === 'vertical' ? 'vertical-rl' : 'horizontal-tb',
  };
}
