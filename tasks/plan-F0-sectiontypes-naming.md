# Executable Plan F0 — the `sectionTypes` naming collision

**Workstream:** F (Structure) · **Not blocked by F's coverage gate:** this is a
pure identifier rename with no restructuring, so the "characterization tests
before decomposition" rule does not apply. It is the one F item that can land
before the large files have tests under them.

Written per `.cursor/rules/writing-executable-plans.mdc`.

---

## The problem

`src/utils/sectionTypes.js` holds **two different vocabularies with confusingly
similar names**, recorded as a gotcha since the phase 6 port:

| Symbol | Means | Values |
|---|---|---|
| `SECTION_TYPES`, `getSectionType`, `getSectionColor` | song **parts** | verse, chorus, bridge, pre-chorus, intro, outro, tag, turnaround, blank, custom |
| `SECTION_TYPE_META`, `normalizeSectionType`, `getSectionTypeMeta` | presentation **sections** | song, announcement, sermon |

The trap, already pinned by `src/utils/__tests__/sectionTypes.test.ts`:
**`normalizeSectionType('verse')` returns `'announcement'`** — a song part fed to
the presentation-section vocabulary is silently coerced, not rejected.

Only the first group's names lie: a verse is not a "section type" in the sense
every other use of that phrase means. Renaming that group makes the collision
impossible to trip over.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

## The rename — all 3, exhaustive

| Old | New | Sites (word-boundary, measured) |
|---|---|---|
| `SECTION_TYPES` | `SONG_PART_TYPES` | 11 |
| `getSectionType` | `getSongPart` | 6 |
| `getSectionColor` | `getSongPartColor` | 10 |

`withColorAlpha` keeps its name — it is a generic colour helper, not part of
either vocabulary. The presentation-section group keeps its names: those are
accurate.

**`getSectionType` is a PREFIX of `getSectionTypeMeta`.** A naive substitution
corrupts the latter — the same class of mistake that renamed a `.blur()` call
during U3. Every replacement uses `\b` word boundaries and is verified by count.

## Bounded blast radius

| File | Why |
|---|---|
| `presenter-pro/src/utils/sectionTypes.js` | the definitions |
| `presenter-pro/src/utils/songSections.js` | `getSongPart` consumer |
| `presenter-pro/src/components/library/SongEditorModal.jsx` | `SONG_PART_TYPES`, `getSongPartColor` |
| `presenter-pro/src/components/presenter/PresenterPanel.jsx` | `getSongPartColor` |
| `presenter-pro/src/components/editor/Canvas.jsx` | `getSongPartColor` — import + call sites ONLY |
| `presenter-pro/src/utils/__tests__/sectionTypes.test.ts` | the existing characterization test |

**Do NOT** change any logic, any value, any colour, or the presentation-section
vocabulary. **Do NOT** rename the file or split it. If anything beyond an
identifier needs to change, STOP and report.

## Todos

- [x] **1.** Rename with word boundaries; assert the per-symbol site counts match
      the table above, and that `getSectionTypeMeta` still occurs the same number
      of times before and after.
      *Verify:* `grep -rnw` counts; `grep -c getSectionTypeMeta` unchanged.
- [x] **2.** `npm run gate`. ESLint `no-undef` is the mechanical net here: the
      `.jsx` files are not type-checked (`checkJs: false`), and `no-undef` is
      exactly what caught two real ReferenceErrors in this repo before.
- [x] **3.** The existing `sectionTypes.test.ts` must pass **unchanged in
      substance** — only the imported names change. It already documents the
      collision; update its comments to use the new names.
- [x] **4.** Push and let CI judge. The 52 screenshot baselines must not move:
      a rename cannot change a pixel, so any movement is a finding, not a
      recapture. **No local Playwright run — Ethan is at the machine.**

## Compliance Manifest

### `writing-executable-plans.mdc`

| Item | Disposition |
|---|---|
| Assertion weakening | Clause verbatim; the rename is verified by exact site counts, not by "looks right" |
| List sampling | The rename table is 3 rows with measured counts; todo 1 checks each |
| Quantifier erosion | Counts are asserted per symbol, and `getSectionTypeMeta`'s count must be unchanged — the prefix trap made mechanical |
| Sanctioned escape hatch | `N/A — a rename has no partial-completion state to allowlist` |
| Bounded blast radius | 6-file table; explicit "no logic, no values, no file split" |
| File-specific pitfall notes | The `getSectionType` / `getSectionTypeMeta` prefix trap, with the U3 precedent |
| Exact paths | Every file named in full |
| Per-todo verification | Each todo names its command |
| Snapshot policy inline | Todo 4: a rename cannot move a pixel; any baseline movement is a finding |
| Preconditions for conditional UI | `N/A — no UI state is involved` |
| Structural floor under snapshots | `N/A — no test snapshots` |
| IPC contract pinning | `N/A — no channel is touched` |
| Manual verification steps | `N/A — no user-visible change; CI's screenshots are the check` |
| Required findings report | Any file touched outside the table, and the before/after counts |

### `testing-standards.mdc` — all 10 items

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | `N/A — no new behaviour; the existing characterization test already covers both vocabularies and must pass before and after` |
| 2 | Behavior-change test edits | None. `sectionTypes.test.ts` changes imported NAMES only, no assertions |
| 3 | No weakened assertions | Clause verbatim; no assertion is touched |
| 4 | Coverage floor | Unchanged — no new functions |
| 5 | Lint floor | `eslint . --max-warnings 0`, and `no-undef` is the net for the untyped `.jsx` files |
| 6 | Snapshot discipline | Todo 4 |
| 7 | Completion gate | Todo 2 |
| 8 | Vitest / jsdom mechanics | `N/A — no new tests` |
| 9 | Test placement | `N/A — no new test files` |
| 10 | Characterization before refactor | `sectionTypes.test.ts` already exists and pins both vocabularies; it passes unchanged in substance before and after (todo 3) |
