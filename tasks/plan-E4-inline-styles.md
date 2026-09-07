# Executable Plan E4 — Inline styles → classes (behind the screenshot net)

**Workstream:** E · **Charter row:** "E4 inline styles → classes — behind the E2 net".
**Category:** one — presentation code that is _identical on screen_ before and after.

## Measured (2026-09-07, `main` at #68)

| Fact                                 | Value                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `style={{ … }}` objects in JSX       | **490** across 28 files                                                                                                                                                                                                                                                                                                                                  |
| … static (every value a literal)     | **375** — a token colour, a border, a radius, a size: convertible to classes                                                                                                                                                                                                                                                                             |
| … dynamic (an identifier, a ternary) | **115** — a computed width, a per-slide colour, a drag position, a `selected ? … : …`: these belong inline and stay                                                                                                                                                                                                                                      |
| Most common static properties        | `color` 240 · `background` 141 · `border` 87 · `width` 42 · `height` 37 · `fontSize` 36 · `padding` 33 · `position` 30 · `borderRadius` 25 · `boxShadow` 20                                                                                                                                                                                              |
| `rgba(…)` literals in JSX            | 149 (88 distinct) — E1 banned hex, not rgba; most are the accent at some alpha. **Not this plan** (recorded as E1b below)                                                                                                                                                                                                                                |
| Tailwind theme                       | empty (`extend: {}`) — no class could name a token; the only way to a token was `style={{ color: 'var(--…)' }}`, which is _why_ there are 490 of them                                                                                                                                                                                                    |
| Hover styles                         | many are `onMouseEnter`/`onMouseLeave` handlers mutating `e.currentTarget.style` — the screenshot net cannot see hover, so they are **out of scope**                                                                                                                                                                                                     |
| Screenshot net (E2)                  | covers Home, editor (canvas, filmstrip, toolbar, menu bar, presenter panel, status bar), output window, both library panels, both settings modals, tutorial, context menu, shortcuts overlay, editor-while-presenting. **Not covered:** `SongEditorModal` (63), `FormattingToolbar` (32), `Dialog` (10), `StageDisplayRenderer` (7), `ErrorBoundary` (5) |

## Decisions

1. **Tokens get names in Tailwind, verbatim.** `tailwind.config.js` maps every
   colour token from `globals.css` under its own name: `bg-bg-surface`,
   `text-text-primary`, `border-border-subtle`, `text-accent`. Ugly on purpose:
   zero mapping to learn, and a grep for a token finds its classes. The
   stylesheet remains the single source of truth (the E1 guard test pins the
   values); the config is regenerated from it, not hand-edited. `--white` /
   `--black` are value-identical to Tailwind's built-ins, so overriding them
   changes nothing on screen.
2. **Only static style objects convert.** A dynamic value stays inline; a mixed
   object is split (static part → classes, dynamic part stays). Nothing is
   "simplified" on the way — the value on screen is the constraint, not taste.
   Numbers that are not on Tailwind's scale become arbitrary values
   (`rounded-[28px]`, `text-[15px]`), never rounded to the nearest step.
3. **A ratchet, per file.** `src/__tests__/inlineStyleBudget.test.ts` holds a
   ceiling per file equal to the count today; a file over its ceiling fails
   (a static style crept back), and a file _under_ it fails too (the ceiling
   was not lowered with the work). Files not listed have a ceiling of 0.
4. **Proof is pixel-exact, laptop-vs-laptop.** Local captures go to a
   gitignored `e2e/.local-snapshots/` (`snapshotPathTemplate` outside CI), so
   a laptop baseline can never be committed. Per slice: on the base commit,
   `VISUAL=1 npx playwright test e2e/visual*.spec.ts --update-snapshots`;
   apply the slice; `VISUAL=1 VISUAL_STRICT=1 npx playwright test
e2e/visual*.spec.ts` must report **0 differing pixels** on all 11 captures.
   CI then compares against its own baselines at 1 %.
5. **Net first, then convert.** A component the net cannot see is not
   converted until it can: slice 6 adds captures for the song editor modal,
   the formatting toolbar, the unsaved-changes dialog and the stage display
   (baselines from CI via `update_baselines`) _before_ those files are touched.
   `ErrorBoundary` (5 objects) has no honest capture path and is left as is.
6. **Hover handlers are out of scope** (decision above). A follow-up can move
   them to `hover:` classes once a hover capture exists.

## Slices (one PR each; a slice is a file or a group that shares a capture)

| #   | Files                                                                                                                         | Objects | Capture(s)                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------- |
| 0   | Tailwind token colours · budget ratchet · local snapshot dir                                                                  | —       | infrastructure, no pixel change           |
| 1   | `pages/Home.jsx`                                                                                                              | 49      | home, home-context-menu, tutorial         |
| 2   | `MediaLibraryPanel`, `SongLibraryPanel`, `SongCard`                                                                           | 67      | editor-song-library, editor-media-library |
| 3   | `Canvas`, `Filmstrip`, `FilmstripSlide`, `SectionHeader`, `SlideTextEditor`, `SlidePreviewSurface`                            | 80      | editor, editor-presenting                 |
| 4   | `PresenterPanel`, `Toolbar`, `MenuBar`, `TitleBar`, `StatusBar`, `pages/Editor.jsx`                                           | 84      | editor, editor-presenting                 |
| 5   | `OutputSettingsModal`, `PresentationSettingsModal`, `ShortcutsOverlay`, `OnboardingTutorial`, `ContextMenu`, `OutputRenderer` | 91      | the modal/overlay captures, output        |
| 6   | net extension: song editor modal, formatting toolbar, dialog, stage display (E2 addendum)                                     | —       | 4 new CI baselines                        |
| 7   | `SongEditorModal`, `FormattingToolbar`, `Dialog`, `StageDisplayRenderer`                                                      | 112     | the slice-6 captures                      |

Left inline by design at the end: the 115 dynamic objects (ceilings stay at
those numbers) and `ErrorBoundary`'s 5.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

A strict compare that is not 0 pixels means the conversion is wrong, not that
the tolerance is. Find the property.

## Blast radius

Per slice: the listed files' `style`/`className` attributes only; the budget
test's ceilings for those files. Slice 0: `tailwind.config.js`,
`playwright.config.ts`, `.gitignore`, the new test. No behavior, no markup
structure, no handler changes.

### Sanctioned escape hatch — none.

## Todos

- [x] 0. Slice 0: token colours in Tailwind; ratchet test red (a ceiling one
      too low fails, naming the file) then green; local snapshot dir; gate; build.
- [ ] 1–5. Each: local capture on base → convert → strict 0 px on 11 captures →
      ceilings lowered → gate → PR with the pixel proof in its findings.
- [ ] 6. Net extension (4 captures, CI baselines) as an E2 addendum PR.
- [ ] 7. The last four files behind the new captures.
- [ ] Record: E1b (rgba literals → alpha tokens) and hover handlers → `hover:`
      classes as recommended follow-ups in the charter.

## Findings

(filled per slice)
