# Executable Plan G1 — one answer to "what does an empty name mean?"

**Source:** `tasks/ux-review-2026-09-11.md` §2.10, the review's joint **P0**.
**Reported by Ethan, 2026-09-11:** _"you cant properly name things like you cant
do spaces or when you delete it just repopulates with the name infinitely rather
than a proper blank state catcher."_ And, narrowing it: _"i was talking about the
name of a verse or bridge if you delete it all it just fills it."_

Written per `.cursor/rules/writing-executable-plans.mdc`. **Reviewed by a fresh
agent before any code was written** (standing rule 9); it returned three
blockers, all of which changed what the code does. They are resolved in
Decisions 2, 3 and 6 and marked **[review]**.

---

## Measured (2026-09-11, `main` @ `afaec54`)

There is no shared "name field" in this app. Four surfaces rename things and
each invented its own blank-state behaviour, wrong in a different way — which is
why the symptom looks different every time you hit it.

| Surface                                                                    | Code                                                                                                                                                             | What clearing the name does today                                                                                                               |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Song part name** (Verse/Bridge/…)                                        | `SongEditorModal.jsx:1058` → `updateGroupLabel:392` → `commitGroups:269` → `normalizeSongEditorGroups:104-112`                                                   | **The name comes back instantly, mid-keystroke.** A trailing space is deleted before the next character, so `Verse 1` is literally unreachable. |
| **Presentation title** (title bar)                                         | `TitleBar.jsx:53` — `renameVal.trim() \|\| presentation.title`                                                                                                   | **The old name comes straight back**, forever.                                                                                                  |
| **Custom part name**                                                       | `SongEditorModal.jsx:447` → `finalizeCustomGroupLabel:31`                                                                                                        | Commits to `Custom` **on blur**. Already the right shape.                                                                                       |
| **Rename dialogs** — Home rename, section rename, media folder, media item | `dialog.js:56` returns `value \|\| null`; callers do `if (!name) return` — `presentationCommands.js:522`, `SectionHeader.jsx:25`, `MediaLibraryPanel.jsx:98,129` | **Nothing happens at all.** The dialog closes and the rename is silently dropped.                                                               |

### The P0, exactly

`commitGroups` re-normalizes the whole group list on **every call**, and for a
non-custom part `normalizeSongEditorGroups` does this:

```js
const explicitLabel = String(group?.label || '').trim();
label: explicitLabel || makeSongGroupLabel(type, '', occurrence > 1 ? String(occurrence) : '');
```

The field is a **controlled input**, so the rewritten value goes straight back
into the DOM. One expression causes both reported symptoms, on every keystroke,
with no blur needed. `placeholder="Section name"` on that input is **dead code
today** — the value can never be empty, so it can never show.

The commit-time home already exists: `finalizeSongEditorGroups:127-134`, called
from `handleSave:628`.

## Decisions

1. **The contract, stated once.** A name draft is **free-form while you are
   editing it** — no trimming, no rewriting, no fallback mid-keystroke. The
   empty-name decision happens **once, at commit**, and it is **visible**.
   Nothing is ever silently rewritten or silently dropped.

2. **Commit resolves two ways, and which one is not arbitrary. [review]** The
   first draft of this plan said "empty always resolves to a default". The
   review showed that is _destructive_ for a rename dialog: clear the box on a
   presentation called `Sunday Service`, press Rename, and you would overwrite a
   real name with `Untitled Presentation` — and `presentationCommands.js:537`
   would pin that as the newest restore point. Media-item renames have no undo
   at all. So:

   | The name is…                                                                                       | Empty on commit means                                                             | Why                                                                                                          |
   | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
   | **the identity of the thing you are editing** — the open presentation's title, a song part's label | resolve to a documented default, **visibly** (`Untitled Presentation`, `Verse 2`) | the thing must have a name, and there is an obvious one. Google Docs' rule.                                  |
   | **a rename dialog acting on a named object** — Home rename, section, media folder, media item      | **refuse, with an explicit message**, and keep the dialog open                    | there is no obvious default, and quietly substituting one destroys a name the user chose. PowerPoint's rule. |

   Both halves satisfy the one principle: _the decision is made once, at commit,
   and you can see it._ Neither is silent. **Create** prompts (`New Folder…`,
   `Save presentation as…`) keep empty = cancel, because there the whole
   operation is optional.

3. **The display fallback must carry the occurrence number. [review]** This was
   the blocker that would have shipped a new silent rewrite.
   `resolveSongEditorGroupLabel:37-43` falls back to
   `makeSongGroupLabel(group.type)` — **without** the number. It is not
   display-only: `groupsToLyrics:120` feeds the **visible** Raw Lyrics textarea
   (`lyricsShown:301`), which feeds `isDirty:309` **and** `handleSave`'s
   re-parse branch (`:626`). So clearing Verse 2's name would have rewritten the
   textarea's `Verse 2` header to `Verse` as you typed, and two cleared verses
   would both emit `Verse`, collapsing the numbering on save with no prompt.
   **Fix:** `resolveSongEditorGroupLabel(group, groups)` falls back to
   `getAutoLabelForGroup`, which is occurrence-aware. The mirror then reads
   exactly as it does today while the field sits empty — the field shows its
   placeholder, the rest of the UI shows the auto name. That _is_ the Docs
   model.

4. **One counter, not two. [review]** Rather than duplicating normalize's
   occurrence `Map` into `finalizeSongEditorGroups`,
   `normalizeSongEditorGroups(groups, { fillEmptyLabels = false })` keeps the
   single implementation and finalize passes `true`.

5. **Zero layout change.** The review's §4.1 (make the title itself the control,
   drop the Rename button and the caption) is a separate, visual P1. Keeping G1
   behaviour-only means the 52 screenshot baselines must not move — a much
   stronger check than "it looked fine". `TitleBar.jsx`'s inline `style` block
   (`:105-111`) stays put; its inline-style ceiling is 3 and that ratchet fails
   in both directions.

6. **A type change still renames an unnamed part, and that is deliberate.
   [review]** `updateGroupType:397-440` re-fills the label when
   `isAutoGeneratedGroupLabel` is true, which it is for an empty label. So
   switching an unnamed Verse to Bridge names it `Bridge`. That is correct — it
   is a commit, not a keystroke — and it gets a test so it is pinned rather than
   rediscovered.

7. **Wording is out of scope.** The now-visible placeholder says "Section name"
   where the app means _part_ (review §2.8). Renaming one string while the chips
   beside it still say "Available Sections" would make the vocabulary _less_
   consistent, so §2.8 renames them together, in its own PR. Recorded, not
   fixed.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

**Applied specifically here:** the tests assert typed text survives **verbatim**
— a trailing space stays a trailing space, an empty field stays empty. If one
fails, something is still rewriting the draft; find it. Do not change the test
to trim, and do not assert "contains" where it asserts equality.

## Bounded blast radius

| File                                                                                                                                           | Action                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `presenter-pro/src/utils/nameDraft.ts`                                                                                                         | create — `commitName` and the documented defaults                                                                                                                              |
| `presenter-pro/src/utils/__tests__/nameDraft.test.ts`                                                                                          | create                                                                                                                                                                         |
| `presenter-pro/src/components/library/SongEditorModal.jsx`                                                                                     | modify — `normalizeSongEditorGroups` gains `fillEmptyLabels`; `finalizeSongEditorGroups` passes it; `resolveSongEditorGroupLabel` becomes occurrence-aware at its 5 call sites |
| `presenter-pro/src/components/library/__tests__/SongEditorModal.test.tsx`                                                                      | modify — the typing, save and type-change cases                                                                                                                                |
| `presenter-pro/src/components/layout/TitleBar.jsx`                                                                                             | modify — `commitRename` resolves empty to the default                                                                                                                          |
| `presenter-pro/src/components/layout/__tests__/TitleBar.test.tsx`                                                                              | create                                                                                                                                                                         |
| `presenter-pro/src/utils/dialog.js`                                                                                                            | modify — `promptDialog` gains opt-in `requireValue`                                                                                                                            |
| `presenter-pro/src/utils/__tests__/dialog.test.ts`                                                                                             | create or modify                                                                                                                                                               |
| `presenter-pro/src/utils/presentationCommands.js` · `src/components/editor/SectionHeader.jsx` · `src/components/library/MediaLibraryPanel.jsx` | modify — the **four rename** calls pass `requireValue`; the two create calls are untouched                                                                                     |

### Do NOT

Change any layout, class, padding or colour · touch the Rename button or the
"Presentation title" caption · rename any user-facing string · change
`finalizeCustomGroupLabel`'s blur behaviour · change the create prompts · touch
any `e2e/` baseline.

## Todos

- [x] **1. Failing tests first.** All red before any fix: - `nameDraft.test.ts` against a module that does not exist. - `SongEditorModal.test.tsx`: type `"Verse "` into the first non-custom
      part name and assert the value is **exactly** `"Verse "`; clear it and
      assert **exactly** `""`. Both fail today — that is the bug reproduced. - `TitleBar.test.tsx`: seed a **distinct** title (`Sunday Service`, never
      the default — a fixture already named `Untitled Presentation` would hit
      `commitRename`'s `title !== presentation.title` no-op branch and pass
      for the wrong reason **[review]**), clear it, commit, assert the title
      is the default and **not** the old one, and that `requiresInitialSave`
      is preserved (A5 fact 11).
      _Verify:_ run them; paste the failure output.
- [x] **2. `nameDraft.ts`**, then the song editor. Re-run: typing cases pass, and
      a save still produces the numbered auto label for an empty part.
- [x] **3. TitleBar, then `promptDialog` + the four rename callers.** Grep every
      caller; confirm the two create prompts pass nothing and still cancel.
- [x] **4. Gate.** `npm run gate` && `npm run format:check`. Confirm
      `TitleBar.jsx` still counts 3 inline styles and `SongEditorModal.jsx` 11.
- [x] **5. Push; CI is the verdict.** **The 52 baselines must not move** — this
      plan changes no layout, so any movement is a finding, not a recapture. Do
      not run Playwright locally while Ethan is at the machine (rule 7).
- [x] **6. Record** in `tasks/fable-pass-plan.md` and `tasks/fable-notes.md`.
      The UX review's own table was **not** ticked: that file is deliberately
      local and untracked, it lives in the main checkout, and this work ran in
      an isolated worktree. Reported instead.

## Pitfall notes

1. **`commitGroups` normalizes on every call** — that is the mechanism. Changing
   the input's `onChange` alone would do nothing.
2. **`finalizeSongEditorGroups` delegates entirely to `normalizeSongEditorGroups`**,
   so removing the fallback from the latter removes it from the former too. The
   `fillEmptyLabels` option is what keeps save-time defaulting alive.
3. **The occurrence counter lives only in normalize's `counts` Map.** An empty
   second verse must still save as `Verse 2`, not `Verse`.
4. **`resolveSongEditorGroupLabel` has 5 call sites** (`:120, :326, :849, :903,
:963`); all have `groups` in scope. Miss one and that surface silently loses
   the occurrence number.
5. **`isDirty` compares a snapshot** including `lyricsShown`. With the numbered
   fallback the mirror is byte-identical to today while a field is empty, so the
   dirty flag reflects the real edit (the empty label) and nothing else.
6. **`promptDialog` is shared with create flows.** `requireValue` is opt-in; a
   default-on change would make `New Folder…` refuse a deliberate cancel. Apply
   it **after** `dialog.js:54`'s `action !== 'confirm'` check so Cancel still
   cancels.
7. **Never `git add -A`.** Add explicit paths.

## Required findings report

1. Gate results and CI E2E result, including that the 52 baselines did not move.
2. Todo-1 failure output, proving the bug was reproduced before it was fixed.
3. Every surface changed, and what empty now resolves to on each.
4. Any surface deliberately left alone, and why.
5. Anything found while in here and not fixed.

## Compliance Manifest

### `writing-executable-plans.mdc`

| Item                                 | Disposition                                                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Assertion weakening designed against | Clause verbatim, plus an explicit "assert equality, never contains; never trim in a test" rule                  |
| List sampling designed against       | All four surfaces named in one counted table; all 5 `resolveSongEditorGroupLabel` call sites enumerated by line |
| Quantifier erosion designed against  | Tests assert the **exact** string, including a trailing space and the empty string                              |
| Sanctioned escape hatch              | Create prompts are explicitly exempt, with the reason, rather than silently skipped                             |
| Bounded blast radius                 | File table plus an explicit do-not-touch list                                                                   |
| File-specific pitfall notes          | 7 notes, including the two ratchets and the shared-dialog trap                                                  |
| Exact paths, no improvisation        | Every file and line named, re-verified after #112                                                               |
| Per-todo verification                | Each todo names its command                                                                                     |
| Snapshot policy inline               | Todo 5: no layout change, so any baseline movement is a finding; no local Playwright while Ethan is present     |
| Preconditions for conditional UI     | Groups render expanded (`collapsedGroupIds` starts `[]`), so the part-name input is reachable with no selection |
| IPC contract pinning                 | `N/A — no channel is touched`                                                                                   |
| Manual verification steps            | Type a space into a verse name; clear a verse name; clear the presentation title; clear a rename dialog         |
| Required findings report             | 5-item report above                                                                                             |

### `testing-standards.mdc`

| #   | Item                             | Disposition                                                                                         |
| --- | -------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | TDD ordering                     | Todo 1 strictly precedes todos 2–3; failure output required                                         |
| 2   | Behavior-change test edits       | This plan _is_ a behaviour change; each one is named in Decision 2's table                          |
| 3   | No weakened assertions           | Clause verbatim; exact-string assertions                                                            |
| 4   | Coverage floor                   | ≥ 1 case per surface, plus the type-change case from Decision 6                                     |
| 5   | Lint floor                       | No `.only` / `.skip`; `eslint . --max-warnings 0`                                                   |
| 6   | Snapshot discipline              | `N/A — no test snapshots.` Screenshot baselines covered by todo 5                                   |
| 7   | Completion gate                  | Todo 4                                                                                              |
| 8   | Vitest / jsdom mechanics         | Skeleton A for `nameDraft`; skeleton C (jsdom, store reset, ipc mocked) for the two component tests |
| 9   | Test placement                   | `src/utils/__tests__/` and `src/components/*/__tests__/` per the placement table                    |
| 10  | Characterization before refactor | `N/A — this is a behaviour fix, not a refactor`                                                     |

---

## Outcome (2026-09-11) — findings report

Gate green (`npm run gate`, `npm run format:check`); **501 → 522 unit tests**
across **59 → 62 files**. No layout changed, so the 52 screenshot baselines must
not move.

### 1. Todo-1 failure output, proving the bug was reproduced first

```
× keeps a trailing space, so a numbered name can be typed at all
  AssertionError: expected 'Verse' to be 'Verse ' // Object.is equality
× lets the field go empty and stay empty
  AssertionError: expected 'Verse' to be '' // Object.is equality
```

That is Ethan's report, measured: the space is deleted before the next
keystroke, and clearing the field repopulates it instantly. `nameDraft.test.ts`
and `TitleBar.test.tsx` were red on a missing module; `dialog.test.ts` had its
three existing-behaviour cases green and its two `requireValue` cases red, which
is the correct shape — the option did not exist yet.

### 2. Every surface changed, and what empty now does

| Surface                                                  | Before                                          | After                                                                         |
| -------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| Song part name                                           | rewritten mid-keystroke; a space was impossible | free-form while typing; resolves to the numbered auto label **once, at save** |
| Presentation title (title bar)                           | the old name came back, forever                 | resolves to `Untitled Presentation`, visibly, on Enter/blur                   |
| Home rename · section rename · media folder · media item | silently dropped, dialog just closed            | **refused with a message**, and the prompt comes back                         |
| Custom part name                                         | already committed to `Custom` on blur           | unchanged                                                                     |
| `New Folder…` · `Save presentation as…`                  | empty cancels                                   | unchanged — a create is optional, so cancelling is a sane reading             |

### 3. Surfaces deliberately left alone, and why

- **Custom part names** already had the right shape: free-form while typing,
  defaulted at blur.
- **Create prompts.** Making empty mean "use a default" there would create an
  `Untitled Folder` every time someone hit OK on an empty box.
- **`renameVal`'s inner spacing.** `commitName` trims the edges at commit and
  leaves inner spacing alone; a user who types two spaces meant them.

### 4. Found while in here, not fixed

- **The placeholder is now reachable and says the wrong noun.**
  `placeholder="Section name"` on the part-name field was dead code before this
  plan — the value could never be empty, so it could never show. It shows now,
  and it says _Section_ where the app means _part_ (review §2.8). Renaming it
  alone would make the vocabulary **less** consistent, because the chips beside
  it still say "Available Sections". §2.8 renames them together.
- **The UX review's own order-of-work table is not ticked.** That file is
  deliberately local and untracked and lives in the main checkout; this work ran
  in an isolated worktree. It needs one line struck through by hand.
- **`getAutoLabelForGroup` is now on the render path** for any part whose name
  is empty, via `resolveSongEditorGroupLabel`. It walks the group list per call,
  so it is O(groups²) across a full render. Irrelevant at real song sizes (a
  dozen parts) and it only runs while a name is empty, but it is worth knowing
  before anyone reuses it in a list.
