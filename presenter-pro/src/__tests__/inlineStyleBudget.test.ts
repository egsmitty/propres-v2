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
  'components/library/SongEditorModal.jsx': 63,
  'pages/Home.jsx': 49,
  'components/library/MediaLibraryPanel.jsx': 47,
  'components/editor/Canvas.jsx': 43,
  'components/presenter/PresenterPanel.jsx': 33,
  'components/editor/FormattingToolbar.jsx': 32,
  'components/layout/Toolbar.jsx': 32,
  'components/editor/OutputSettingsModal.jsx': 31,
  'components/editor/Filmstrip.jsx': 21,
  'components/presenter/OutputRenderer.jsx': 16,
  'components/shared/OnboardingTutorial.jsx': 16,
  'components/editor/PresentationSettingsModal.jsx': 13,
  'components/library/SongLibraryPanel.jsx': 13,
  'components/shared/ShortcutsOverlay.jsx': 11,
  'components/shared/Dialog.jsx': 10,
  'components/layout/TitleBar.jsx': 8,
  'components/editor/SectionHeader.jsx': 7,
  'components/library/SongCard.jsx': 7,
  'components/presenter/StageDisplayRenderer.jsx': 7,
  'components/layout/MenuBar.jsx': 6,
  'components/editor/FilmstripSlide.jsx': 5,
  'components/shared/ErrorBoundary.jsx': 5,
  'components/shared/ContextMenu.jsx': 4,
  'pages/Editor.jsx': 3,
  'components/editor/SlideTextEditor.jsx': 2,
  'components/layout/StatusBar.jsx': 2,
  'components/shared/ScaledSlideText.jsx': 2,
  'components/shared/SlidePreviewSurface.jsx': 2,
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
  return readFileSync(file, 'utf8').match(/style=\{\{/g)?.length ?? 0;
}

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
