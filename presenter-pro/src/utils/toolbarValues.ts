/**
 * Toolbar value normalizers (plan F1, slice 2).
 *
 * These sit between what the browser reports about the current selection —
 * `rgb(255, 0, 0)`, `"Times New Roman", serif`, `start justify` — and what the
 * toolbar's controls can display. Each one is a translation the user sees the
 * result of: a font that falls back to Arial, a colour swatch that goes blank,
 * an alignment button that lights up the wrong way.
 *
 * They were pure already, inside `Toolbar.jsx`, where nothing could reach them.
 */

/** The fonts the toolbar offers. The dropdown, the matcher below and the
 *  fallback all read this list, so its order is load-bearing. */
export const FONT_OPTIONS = [
  'Arial',
  'Helvetica',
  'Georgia',
  'Times New Roman',
  'Trebuchet MS',
  'Avenir Next',
  'Gill Sans',
  'Courier New',
  'Verdana',
];

export function normalizeFontFamilyValue(
  value: string | null | undefined,
  fallback: string | undefined = FONT_OPTIONS[0]
): string {
  const family = String(value || fallback).replace(/["']/g, '');
  return (
    FONT_OPTIONS.find((option) => family.toLowerCase().includes(option.toLowerCase())) ||
    (FONT_OPTIONS[0] as string)
  );
}

export function rgbToHex(value: string | null | undefined): string | null | undefined {
  const match = String(value || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return value;
  const [, r, g, b] = match;
  return `#${[r, g, b].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`;
}

export function normalizeColorValue(
  value: string | null | undefined,
  fallback: string
): string | null | undefined {
  if (!value || value === 'transparent' || value === 'rgba(0, 0, 0, 0)') return fallback;
  return rgbToHex(value);
}

export function normalizeAlignValue(value: string | null | undefined, fallback = 'center'): string {
  const next = String(value || '').toLowerCase();
  if (next.includes('justify')) return 'justify';
  if (next.includes('right')) return 'right';
  if (next.includes('left')) return 'left';
  if (next.includes('center')) return 'center';
  return fallback;
}

export function getRenderedBodyFontSize(body: string | null | undefined, fallback: number): number {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined' || !body) return fallback;

  try {
    const doc = new DOMParser().parseFromString(`<div>${body}</div>`, 'text/html');
    const sizes = new Set<number>();

    doc.body.querySelectorAll('*').forEach((node) => {
      const fontSize = (node as HTMLElement).style?.fontSize;
      if (!fontSize || !fontSize.endsWith('px')) return;
      const numeric = Number.parseFloat(fontSize);
      if (Number.isFinite(numeric) && numeric > 0) sizes.add(Math.round(numeric));
    });

    return sizes.size === 1 ? ([...sizes][0] as number) : fallback;
  } catch {
    return fallback;
  }
}
