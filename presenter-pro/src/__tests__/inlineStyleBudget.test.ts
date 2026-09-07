import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Plan E4. A ratchet on inline `style={{ … }}` objects in JSX, per file.
//
// The static ones (a colour token, a border, a size) are being moved to
// classes behind the screenshot baseline; the dynamic ones (a computed width,
// a per-slide colour, a drag position) belong inline and stay. Each slice
// lowers a file's ceiling to what is left. The test fails in both directions:
// a file over its ceiling (a static style crept back in) and a file under it
// (the ceiling was not lowered with the work — ratchets only turn one way).

const SRC = join(__dirname, '..');

/** Ceiling per file, relative to src/. Files not listed have a ceiling of 0. */
const BUDGET: Record<string, number> = {
  'components/editor/FormattingToolbar.jsx': 24,
  'components/layout/Toolbar.jsx': 23,
  'components/presenter/PresenterPanel.jsx': 23,
  'components/editor/Canvas.jsx': 19,
  'components/editor/Filmstrip.jsx': 17,
  'components/presenter/OutputRenderer.jsx': 13,
  'components/library/SongEditorModal.jsx': 11,
  'pages/Home.jsx': 9,
  'components/editor/PresentationSettingsModal.jsx': 7,
  'components/library/MediaLibraryPanel.jsx': 7,
  'components/shared/Dialog.jsx': 7,
  'components/layout/MenuBar.jsx': 5,
  'components/shared/ErrorBoundary.jsx': 5,
  'components/shared/OnboardingTutorial.jsx': 5,
  'components/editor/OutputSettingsModal.jsx': 3,
  'components/layout/TitleBar.jsx': 3,
  'components/shared/ScaledSlideText.jsx': 3,
  'components/editor/FilmstripSlide.jsx': 2,
  'components/editor/SlideTextEditor.jsx': 2,
  'components/presenter/StageDisplayRenderer.jsx': 2,
  'components/shared/ContextMenu.jsx': 2,
  'components/shared/SlidePreviewSurface.jsx': 2,
  'components/editor/SectionHeader.jsx': 1,
  'components/library/SongCard.jsx': 1,
  'pages/Editor.jsx': 1,
};

function componentFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules' || / \d(\.|$)/.test(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...componentFiles(full));
    else if (/\.(jsx|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

function countInlineStyles(file: string): number {
  // Any inline style prop counts — an object literal, a helper call, a
  // passed-through prop — so a `style={fn()}` cannot slip under the ratchet.
  return readFileSync(file, 'utf8').match(/\bstyle=\{/g)?.length ?? 0;
}

/**
 * Plan E4b. Mouse-enter handlers that paint a hover look belong in `hover:`
 * classes; the ones left are the two that set React state, the collapsed
 * slivers (no capture reaches them the same way on every machine), a divider
 * that must stay highlighted while dragging, and the unreachable
 * FormattingToolbar. Ceiling 0 everywhere else.
 */
const HOVER_HANDLER_BUDGET: Record<string, number> = {
  'components/editor/FormattingToolbar.jsx': 5,
  'components/presenter/PresenterPanel.jsx': 2,
  'components/layout/MenuBar.jsx': 1,
  'pages/Editor.jsx': 1,
  'pages/Home.jsx': 1,
};

function countHoverHandlers(file: string): number {
  return readFileSync(file, 'utf8').match(/\bonMouseEnter=/g)?.length ?? 0;
}

describe('hover handler budget (plan E4b)', () => {
  const counts = new Map<string, number>();
  for (const file of componentFiles(SRC)) {
    const n = countHoverHandlers(file);
    if (n > 0) counts.set(relative(SRC, file), n);
  }

  it('no file has more mouse-enter handlers than its ceiling', () => {
    const over = [...counts]
      .filter(([file, n]) => n > (HOVER_HANDLER_BUDGET[file] ?? 0))
      .map(([file, n]) => `${file}: ${n} > ${HOVER_HANDLER_BUDGET[file] ?? 0}`);
    expect(over, 'hover handlers over budget — use hover: classes').toEqual([]);
  });

  it('every hover ceiling is exact', () => {
    const stale = Object.entries(HOVER_HANDLER_BUDGET)
      .filter(([file, ceiling]) => (counts.get(file) ?? 0) !== ceiling)
      .map(([file, ceiling]) => `${file}: ceiling ${ceiling}, actual ${counts.get(file) ?? 0}`);
    expect(stale, 'HOVER_HANDLER_BUDGET is out of date').toEqual([]);
  });
});

describe('inline style budget (plan E4)', () => {
  const counts = new Map<string, number>();
  for (const file of componentFiles(SRC)) {
    const n = countInlineStyles(file);
    if (n > 0) counts.set(relative(SRC, file), n);
  }

  it('no file has more inline style objects than its ceiling', () => {
    const over = [...counts]
      .filter(([file, n]) => n > (BUDGET[file] ?? 0))
      .map(([file, n]) => `${file}: ${n} > ${BUDGET[file] ?? 0}`);
    expect(over, 'inline styles over budget — move the static ones to classes').toEqual([]);
  });

  it('every ceiling is exact (lower it when a slice lands)', () => {
    const stale = Object.entries(BUDGET)
      .filter(([file, ceiling]) => (counts.get(file) ?? 0) !== ceiling)
      .map(([file, ceiling]) => `${file}: ceiling ${ceiling}, actual ${counts.get(file) ?? 0}`);
    expect(stale, 'BUDGET is out of date').toEqual([]);
  });
});
