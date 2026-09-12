# Executable Plan G3 — the song editor never silently throws work away

**Source:** `tasks/ux-review-2026-09-11.md` §2.1 and §2.3, two of the review's
**P0**s. §2.1 is the only item on the whole review that can _lose work_.

Written per `.cursor/rules/writing-executable-plans.mdc`. **Reviewed by a fresh
agent before any code was written** (standing rule 9). Its verdict on the first
draft was _"do not execute as written"_ — the trigger would have fired on the
normal way to create a song, and the default button would have saved an empty
one. That is fixed in Decisions 1 and 2, marked **[review]**.

---

## Measured (2026-09-11, `main` @ `0d299f7`, after G1)

### §2.1 — Save can silently discard your structural edits

`SongEditorModal.jsx:652-654`:

```js
const nextSongState = rawLyricsDirty
  ? buildSongEditorStateFromLyrics(lyricsShown) // re-parses the raw text
  : { groups, arrangement, lyrics: lyricsShown }; // keeps your structure
```

Type one character in **Raw Lyrics Import** and `rawLyricsDirty` is true. From
that moment Save **re-parses the raw text and throws away the groups and
arrangement you built on the right** — renamed labels, split slides, the order
you arranged. No prompt, no diff, no undo.

`handleParse:379-394` sets `setRawLyricsDirty(false)`, so the flag is true
**only** when you edited the raw box and did _not_ press Parse Song.

**The loss runs both ways, and that is why "just keep the structure" is not the
fix.** The raw text is an input surface only: the `songs` table has
`title, artist, ccli, tags, slides, song_order, song_groups, built_in_key,
built_in_revision` and **no lyrics column** (`electron/db/migrationList.ts`), and
`handleSave`'s `data` object sends none. So silently keeping the structure would
silently discard what the user typed on the left. Either branch, chosen without
asking, destroys something.

So **Parse Song is not really a command**: Save parses whether or not you pressed
it, which means the button implies a choice the app does not offer.

### §2.3 — The Song Order panel switches itself off while you type

`SongEditorModal.jsx:784-787`:

```js
opacity: editingLyrics ? 0.55 : 1,
pointerEvents: editingLyrics ? 'none' : 'auto',
```

`editingLyrics` is `lyricsFocusCount > 0`, a **focus counter** moved by
`beginLyricsEditing` / `endLyricsEditing` (`:371-377`) from **three** attach
points: the raw textarea (`:764,:768`), the selected-slide editor (`:944-945`)
and each per-slide field (`:1130-1133`).

While any lyrics field has focus, clicking a section chip does nothing — the
click lands on a dead element. Greyed-out-but-not-disabled is exactly what a
broken control looks like. `editingLyrics` has **no other consumer** anywhere in
`src/` or `e2e/`; editing lyrics does not conflict with reordering sections, and
there is no reason for the lock at all.

## Decisions

1. **Save asks only when the two sides genuinely disagree. [review]** The first
   draft triggered on `rawLyricsDirty` alone. A new song starts with
   `groups = []`, and the standard way to create one is _open New Song, paste
   lyrics, Save_ — which sets `rawLyricsDirty` and never touches the structure.
   That draft would therefore have shown a three-action dialog **every single
   time anyone created a song from pasted lyrics**. The trigger is now:

   ```
   rawLyricsDirty && structureTouchedSinceRawEdit && groups.length > 0
   ```

   `structureTouchedSinceRawEdit` is a ref: cleared by the raw textarea's
   `onChange` and by `handleParse`, set by `commitGroups` and by a new
   `commitArrangement` wrapper around the six structural `setArrangement` calls
   (`handleParse`'s own call is not one of them). Paste-and-save re-parses in
   silence, which is what the user means; the dialog appears only in the real
   conflict — you edited the raw text, _then_ edited the structure.

2. **No destructive action is the default. [review]** `Dialog.jsx:35-41` binds
   **Enter** to whichever action carries `primary` and **Escape** to
   `actions.find(a => a.cancel) || actions[0]`. Both content branches destroy
   something, so **neither is `primary`** — Enter does nothing — and **Cancel
   carries `cancel: true`** so Escape and the backdrop cancel rather than
   picking the first action by accident. The first draft made "Keep My Sections"
   primary; combined with blocker 1 that put "save an empty song" one Enter
   away.

3. **Say it before Save, not only at Save.** A "Not applied yet — press Parse
   Song" hint beside the Parse button whenever `rawLyricsDirty` is true. It
   makes Parse a real command and should make the dialog rare. **Class-only, no
   inline `style`** — the inline-style ceiling is being _lowered_ in this same
   commit (see Decision 5) and one inline style would put it straight back.

4. **Delete the focus lock outright.** Not "fix the counter" — remove
   `lyricsFocusCount`, `editingLyrics`, `beginLyricsEditing`, `endLyricsEditing`,
   `clampFocusCount` and the three `onFocus`/`onBlur` pairs. A guard whose only
   effect is to disable a working panel is not worth repairing.

5. **The inline-style ceiling drops 11 → 10.** That style object holds _only_
   `opacity` and `pointerEvents`, so removing the lock removes a whole `style={`
   prop. `inlineStyleBudget.test.ts` fails in **both** directions, so the ceiling
   must move in the same commit. Ratchets only turn the good way, and this is
   the good way.

6. **Saving is not re-entrant. [review]** While the new dialog is open `saving`
   is still false, so Save and ✕ stay enabled; a second Save would replace the
   dialog in `dialogStore` and the first `await showDialog` would **never
   resolve**, hanging `handleSave`. An `asking` flag joins the disabled
   conditions.

7. **This is not §2.2.** The review's proper fix — make Raw Lyrics a one-way
   _Import_ step so the dual source of truth disappears — is **P1** and is a
   real redesign of that pane. G3 removes the data loss; §2.2 removes the class
   of bug. Recorded, not done.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

**Applied here:** the §2.1 test asserts a structural edit **survives verbatim**
through a save that follows a raw-lyrics edit. If it fails, the save path is
still re-parsing — do not assert "contains", and do not settle for "the dialog
appeared".

## Bounded blast radius

| File                                                                      | Action                                                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `presenter-pro/src/components/library/SongEditorModal.jsx`                | modify — conflict-only save dialog; `asking` flag; unapplied-lyrics hint; delete the focus lock        |
| `presenter-pro/src/components/library/__tests__/SongEditorModal.test.tsx` | modify — the loss case, both branches, cancel, the no-dialog creation flow, and the panel staying live |
| `presenter-pro/src/__tests__/inlineStyleBudget.test.ts`                   | modify — **required**: ceiling 11 → 10                                                                 |
| `presenter-pro/vitest.config.mjs`                                         | modify **only if** deleting five functions moves the measured coverage floor                           |

### Do NOT

Redesign the Raw Lyrics pane (§2.2, P1) · touch the arrangement/chip UI (§3.2,
P1) · rename any user-facing string (§2.8) · change `handleParse`'s behaviour ·
add any inline `style` · touch any `e2e/` baseline.

## Todos

- [x] **1. Failing tests first.** - **The loss, reproduced:** render with a song, edit the raw textarea,
      rename a part on the right, save, and assert the saved `songGroups`
      still carries the renamed label. Fails today. - **The creation flow stays silent:** new song, paste into the textarea,
      Save — assert `showDialog` was **never** called and the song saved. - The Song Order panel is interactive while a lyrics field has focus.
      _Verify:_ run them; paste the failure output.
- [x] **2. The conflict-only dialog** and the `asking` flag, then re-run: "Keep
      My Sections" preserves the rename, "Use Pasted Lyrics" re-parses
      deliberately, Cancel saves nothing.
- [x] **3. Delete the focus lock**, and lower the ceiling to 10.
- [x] **4. The hint** (class-only).
- [x] **5. Gate** and `format:check`; re-measure coverage and move the ratchet
      only if the floor actually moved.
- [x] **6. Push. The 52 baselines must not move** — every capture opens the
      editor clean, so neither the hint nor the dialog is in any of them. No
      local Playwright while Ethan is at the machine (rule 7).
- [x] **7. Record** in the charter, the notes, and this plan.

## Pitfall notes

1. **`lyricsShown` is derived** (`:327`): the _generated_ text until the user
   touches the box, then their own draft. A test must fire a real `change` on
   the textarea to set `rawLyricsDirty`.
2. **Removing the lock removes a whole `style={` prop** — 11 → 10, and the
   ratchet fails in the under-budget direction unless the ceiling moves with it.
3. **`:1130-1133`'s `onFocus` also calls `selectSlide(group.id, slide.id)`** —
   keep it; delete only the `beginLyricsEditing()` line.
4. **Ask _before_ `setSaving(true)`** (`:645`) and _after_ the title check
   (`:637-643`), or the modal sits in its saving state behind a dialog.
5. **Cancel must save nothing** — not "save the structure". `return false` is the
   existing shape (`:640`), and `handleRequestClose` (`:609`) depends on it.
6. **The test file's `@/utils/dialog` mock returns `undefined`** by default, so
   the fallback branch must be Cancel-shaped — and it must not disturb the
   existing save tests, none of which set `rawLyricsDirty`.
7. **The unmount-without-blur leak is a jsdom artifact, not a user-reachable
   bug. [review]** Both delete paths are reached by _clicking a button_, which
   blurs the textarea and decrements the counter first; jsdom's `fireEvent.click`
   does not move focus, so a test goes red for the wrong reason. Consequence #1
   — a dead panel while typing — is real and sufficient. Keep any such test as a
   guard and say so in its comment; do not claim a reproduction.
8. **Never `git add -A`.**

## Required findings report

1. Gate and CI E2E, including that the 52 baselines did not move.
2. Todo-1 failure output, proving the work loss was reproduced.
3. What each dialog branch does, when it appears, and what is default.
4. The inline-style ceiling change, stated explicitly.
5. Anything found and not fixed — §2.2 included.

## Compliance Manifest

### `writing-executable-plans.mdc`

| Item                                 | Disposition                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Assertion weakening designed against | Clause verbatim, plus "do not settle for 'the dialog appeared'"                                                        |
| List sampling designed against       | All three focus attach points and all seven `setArrangement` call sites enumerated by line                             |
| Quantifier erosion designed against  | The creation-flow test asserts `showDialog` was called **zero** times, not "rarely"                                    |
| Sanctioned escape hatch              | §2.2 is explicitly out of scope with a reason, rather than silently skipped                                            |
| Bounded blast radius                 | File table plus an explicit do-not-touch list                                                                          |
| File-specific pitfall notes          | 8 notes, including the ratchet, the jsdom artifact and the dialog-mock default                                         |
| Exact paths, no improvisation        | Re-verified against `main` @ `0d299f7`; the first draft's §2.1 line numbers were stale after G1 and are corrected      |
| Per-todo verification                | Each todo names its command                                                                                            |
| Snapshot policy inline               | Todo 6: every capture opens the editor clean, so neither new surface is in any baseline                                |
| Preconditions for conditional UI     | The dialog's three trigger conditions are stated as one expression                                                     |
| IPC contract pinning                 | `N/A — no channel is touched`                                                                                          |
| Manual verification steps            | Create a song from pasted lyrics (no dialog); edit raw, rename a part, save (dialog); click a chip while typing lyrics |
| Required findings report             | 5-item report above                                                                                                    |

### `testing-standards.mdc`

| #   | Item                             | Disposition                                                                                    |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | TDD ordering                     | Todo 1 precedes todos 2–4; failure output required                                             |
| 2   | Behavior-change test edits       | Each behaviour change is named in Decisions 1–4                                                |
| 3   | No weakened assertions           | Clause verbatim; exact-label assertions on saved JSON                                          |
| 4   | Coverage floor                   | One case per branch, plus the negative case (no dialog on creation)                            |
| 5   | Lint floor                       | No `.only` / `.skip`; `eslint . --max-warnings 0`                                              |
| 6   | Snapshot discipline              | `N/A — no test snapshots.` Screenshot baselines covered by todo 6                              |
| 7   | Completion gate                  | Todo 5                                                                                         |
| 8   | Vitest / jsdom mechanics         | Skeleton C: jsdom, `@/utils/ipc` and `@/utils/dialog` mocked, per-test mock isolation verified |
| 9   | Test placement                   | `src/components/library/__tests__/` per the placement table                                    |
| 10  | Characterization before refactor | `N/A — behaviour fix, not a refactor`                                                          |

---

## Outcome (2026-09-11) — findings report

Gate green; **522 → 529 unit tests** across 62 files. Coverage
25.0/22.41/22.02/26.01 → **26.93/24.8/24.59/27.88**, ratchet raised (G1 had
added cases without moving it, so this raise covers both).

### 1. Todo-1 failure output, proving the loss was reproduced

```
× keeps structural edits made after a raw-lyrics edit
  AssertionError: expected 'Verse 1' to be 'My Renamed Verse' // Object.is equality
× asks before re-parsing, rather than choosing for you
  AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
× saves nothing at all when you cancel
  AssertionError: expected "vi.fn()" to be called at least once
× is interactive while a lyrics field has focus
  AssertionError: expected 'none' not to be 'none' // Object.is equality
```

The first is the data loss itself: a part renamed after a raw-lyrics edit came
back as `Verse 1`, because Save re-parsed the raw text and discarded the
structure. The last is the dead panel — `pointerEvents: none` while typing.

### 2. What each dialog branch does, and when it appears

**It appears only when the two sides genuinely disagree:**
`rawLyricsDirty && structureTouchedSinceRawEdit && groups.length > 0`.

| Action                | Result                                                             |
| --------------------- | ------------------------------------------------------------------ |
| **Keep My Sections**  | saves the structure; the raw-text edits are dropped                |
| **Use Pasted Lyrics** | re-parses — today's silent behaviour, now chosen (marked `danger`) |
| **Cancel**            | saves nothing at all; `handleSave` returns `false`                 |

**Neither content action is `primary`, so Enter does nothing** — both destroy
something, and a destructive default is how work gets lost. **Cancel carries
`cancel: true`**, so Escape and the backdrop land there rather than on whichever
action happens to be first (`Dialog.jsx` falls back to `actions[0]`).

### 3. The inline-style ceiling: 11 → 10

The Song Order panel's `style` object held _only_ `opacity` and `pointerEvents`,
so deleting the focus lock removed a whole `style={` prop.
`inlineStyleBudget.test.ts` fails in both directions, so the ceiling moved in the
same commit. The new hint is class-only for the same reason.

### 4. Surfaces changed

- `handleSave` asks instead of choosing; an `asking` flag disables Save and the
  close buttons while the question is on screen (a second Save would have
  replaced the dialog in the store and left the first `await` unresolved
  forever).
- Six structural `setArrangement` calls go through `commitArrangement`;
  `handleParse`'s does not, because parsing makes the two sides agree.
- The focus lock is gone: `lyricsFocusCount`, `editingLyrics`,
  `beginLyricsEditing`, `endLyricsEditing`, `clampFocusCount` and three
  `onFocus`/`onBlur` pairs. The per-slide `onFocus` keeps its `selectSlide`.
- Raw Lyrics Import shows "Not applied yet — press Parse Song" while unapplied.

### 5. Found and not fixed

- **§2.2, the dual source of truth, is untouched.** The raw box still shows
  generated text until you touch it and your own draft afterwards, with nothing
  on screen saying which mode it is in. G3 removes the data loss; §2.2 removes
  the class of bug, and it is a real redesign of that pane.
- **The unmount-without-blur leak the review suspected is probably not
  user-reachable.** Both delete paths are reached by clicking a button, which
  blurs the textarea first. It would only show in jsdom, where
  `fireEvent.click` does not move focus — so no test claims it. Deleting the
  lock removes the question either way.
- **`isDirty` reads `lyricsShown`**, so after a raw edit the close-then-Save
  path can stack this dialog on top of the unsaved-changes dialog. Sequential
  and correct, but untested.
