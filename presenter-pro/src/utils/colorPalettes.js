// Colour DATA: values the user picks from, and defaults that are persisted
// into slide styles. These are legitimately hex — a colour input needs hex and
// a saved slide must not depend on a CSS token that could be renamed. Every
// other colour a component paints with is a CSS custom property from
// src/styles/globals.css; an ESLint rule keeps raw hex out of JSX (plan E1).

/** Default text colour of a slide text box (persisted into textStyle). */
export const DEFAULT_TEXT_COLOR = '#ffffff';
/** Solid black, used as the "cleared" highlight colour and the output default background. */
export const DEFAULT_BLACK = '#000000';
/** Colour of placeholder text while a text box is empty. */
export const PLACEHOLDER_TEXT_COLOR = '#888888';

/** Swatches offered by the formatting toolbar's colour pickers. */
export const TEXT_PRESET_COLORS = [
  '#ffffff',
  '#eeeeee',
  '#cccccc',
  '#888888',
  '#555555',
  '#222222',
  '#000000',
  '#ff6b6b',
  '#ff922b',
  '#ffd43b',
  '#69db7c',
  '#4dabf7',
  '#748ffc',
  '#da77f2',
  '#f06595',
  '#a9e34b',
  '#38d9a9',
  '#74c0fc',
  '#91a7ff',
  '#ffa8a8',
  '#ffc9c9',
  'transparent',
];

/** Swatches offered by the main toolbar's colour picker button. */
export const TOOLBAR_SWATCH_COLORS = [
  '#ffffff',
  '#000000',
  '#ef4444',
  '#f59e0b',
  '#fde047',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  'transparent',
];

/** Checkerboard shown in place of a "transparent" swatch. */
export const TRANSPARENT_SWATCH_BACKGROUND =
  'repeating-linear-gradient(45deg, #bbb 0, #bbb 2px, #fff 0, #fff 4px)';

/** Thin checker shown on the underline/strike colour indicator for "transparent". */
export const TRANSPARENT_LINE_BACKGROUND =
  'repeating-linear-gradient(45deg, #aaa 0, #aaa 1px, transparent 0, transparent 3px)';
