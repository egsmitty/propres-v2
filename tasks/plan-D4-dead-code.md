# Executable Plan D4 — `no-unused-vars` (34 findings): dead code out

**Workstream:** D · **Category:** one — symbols the linter proves are never read.
**Charter rule:** individually verified, `eslint-suppressions.json` only shrinks.

## Triage

Every one of the 34 was checked for references outside its file before removal
(`grep` across `src/`, `electron/`, `e2e/`). All were dead. By kind:

| Kind                                    | Count | Examples                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unused imports                          | 7     | `shell` (main), `getPresentationAspectRatio` (Canvas), `Film` (FilmstripSlide), `getSectionTypeLabel` (Toolbar), `useEditorStore` (SongLibraryPanel), `alertDialog` (presentationCommands)                                                                                                                                           |
| Unused store selectors / derived consts | 15    | `setSelectedSlide` (Filmstrip, SongCard), `setEditingSlide`/`duplicateSlideTextBoxes`/`removeSlideTextBoxes`/`panelOpen`/`section`/`hideSecondaryLabels`/`isWindowsPlatform` (Toolbar), `liveSlideId` (StatusBar), `previewSection` (PresenterPanel), `libraryPanelOpen` (Editor), `mediaOnly` (FilmstripSlide)                      |
| Dead functions / components             | 9     | `InlineMeta`, `InlineChoiceButton`, `InlineSelect`, `ColorDot` (Toolbar); `nextGroupLabel` (SongEditorModal); `isGenericLabel` (FilmstripSlide); `closeLibraryPanels` (Editor); `selectOnly` (Canvas); `ensureGroup` (songSections); `getPresentationBackgroundId` (backgrounds — an export that always returned `null`, no callers) |
| Unused parameters                       | 3     | `PreviewInsert({ slide, width, presentation })` used none of them → `PreviewInsert()`; callers still pass props, which React ignores                                                                                                                                                                                                 |
| Dead main-process state                 | 1     | `presentationSessionActive` was written by `setPresentationSessionActive` and read by nothing since S1; both removed with the one remaining call                                                                                                                                                                                     |

Removing them exposed three more that only existed to serve the dead code
(`isMediaSlide` import in FilmstripSlide; `setSongLibraryOpen` /
`setMediaLibraryOpen` selectors in Editor) — removed in the same pass.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

## Verification

Dead symbols cannot change behaviour, so the proof is the existing net: gate,
`format:check`, build, the full E2E suite, and the linter reporting zero
`no-unused-vars` with the suppressions file bypassed.

## Blast radius

14 files under `src/` and `electron/main/index.js`, deletions only (one
signature simplified). `eslint-suppressions.json` → `{}`.

## Todos

- [x] 1. Removals; linter reports zero of the rule; suppressions pruned to empty.
- [x] 2. Gate; build; E2E; record; PR.

## Findings (2026-09-06)

- 34 + 3 cascade removals; `eslint` with the suppressions file bypassed reports
  **zero** `no-unused-vars`; `eslint-suppressions.json` is now `{}` — the
  ratchet that started at 71 entries is exhausted.
- Gate 35 files / 298 tests; 0 errors / 11 warnings (all `exhaustive-deps`, D3);
  E2E 20/20. Coverage 15.23/13.04/14.43/16.02; thresholds raised.
