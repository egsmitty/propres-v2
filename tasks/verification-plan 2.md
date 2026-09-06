# Verification Plan — Phases 6–7

How to verify everything changed in PRs #10 and #11, ordered by risk and by how
long it takes. `TesterGuide.md` is the full 242-line app sweep; **this file is
only what changed**, so you are not re-testing features nobody touched.

Everything lives on one branch — `fix/app-quit-lifecycle` is stacked on
`chore/engineering-system`, so testing it covers both PRs at once.

```bash
cd ~/Desktop/ClaudeAccess/ProPresV2/presenter-pro
git checkout fix/app-quit-lifecycle
```

---

## What actually changed (the blast radius)

| Change | Risk | Why |
|---|---|---|
| **Quit lifecycle rewrite** | **High** | Real behavior change in the main process; touches every close path |
| **67-file Prettier reformat** | **Medium** | Mechanically safe, but it touched nearly every source file |
| **2 import fixes** | Low | Two added lines; both previously crashed |
| Tooling, CI, docs | None | Cannot affect the running app |

Nothing else was touched. No feature was added, removed, or redesigned.

---

## Tier 0 — Automated (2 min, do this first)

Run it yourself; never trust a reported result.

```bash
npm run gate     # type-check → lint → vitest
npm run build
```

**Expect:** `gate` exits 0 with `91 passed (91)`, `build` exits 0 with
`1535 modules transformed`.

If the gate is red, stop — do not start manual testing. Send me the output.

### Confirm the packaged main process is complete

The build can report SUCCESS while emitting a main process that crashes on
launch (this actually happened — see PR #11):

```bash
ls out/main/
```

**Expect:** both `index.js` **and** `closeController.js`. If `closeController.js`
is missing, the app will crash on launch with "Cannot find module".

---

## Tier 1 — The three fixes (10 min, highest value)

```bash
npm run dev
```

> **Launch with `npm run dev`, not the Desktop `PresenterPro.app`.** That icon is
> a bash script that runs the dev server; quitting the app will not kill it, so
> it will look like the quit bug is still present when it is not.

### 1.1 Insert Image from the toolbar — *previously crashed*

1. Open or create a presentation, select a slide
2. **Insert → Media → Insert Image**

**Expect:** the native macOS file picker opens. Choose an image; it applies to
the selected slide.
**Before the fix:** nothing happened; a `ReferenceError` was thrown to the
console.

### 1.2 Insert Video from the toolbar — *previously crashed*

Same path, **Insert → Media → Insert Video**. Same expectation.

### 1.3 The filmstrip route still works — *regression check*

Right-click a slide in the filmstrip → **Insert Image…**

**Expect:** identical behavior to 1.1. This path always worked; it must still
work, since both now call the same function.

### 1.4 Clearing a media slide — *previously crashed*

1. Put a media slide in a presentation (1.1 or the Media Library)
2. Right-click it on the canvas → **Clear** (return it to a text slide)

**Expect:** it becomes a text slide showing the placeholder text.
**Before the fix:** `ReferenceError: DEFAULT_PLACEHOLDER_TEXT is not defined`.

---

## Tier 2 — The quit fix (10 min, the actual bug)

Test in this order; each step builds on the last.

### 2.1 Clean quit — *the headline bug*

With no unsaved changes, press **`Cmd+Q`**.

**Expect:** the app fully exits — window gone, **dock icon gone**. Verify no
process survived:

```bash
ps aux | grep -i "ProPresV2/presenter-pro/node_modules/electron" | grep -v grep
```

Empty output is the pass.
**Before the fix:** the window closed but the process stayed alive in the dock.

### 2.2 Quit with unsaved changes — *the riskiest path*

1. `npm run dev`, edit a slide so the document is dirty
2. **`Cmd+Q`**

**Expect:** the unsaved-changes prompt appears.
- **Cancel** → the app stays open and fully usable. Keep editing to confirm.
- **Discard / Save** → the app fully exits (re-run the `ps` check).

This path most deserves attention: it now routes through the new controller.

### 2.3 Window close is still separate from quit

With unsaved changes, click the red **X** instead of `Cmd+Q`.

**Expect:** the same prompt. Cancelling keeps the window open.

Then close and reopen a presentation, make it dirty, and click **X** again —
**expect the prompt again.** The close permission is single-use; if it were
sticky, the second close would silently discard work.

### 2.4 The latch — *previously unrecoverable*

1. Open a presentation, make it dirty
2. Click **X**; when the prompt appears, **leave it sitting**
3. Click **X** a few more times
4. Wait **~6 seconds**, then click **X** once more

**Expect:** it closes. The handshake now expires after 5s.
**Before the fix:** the pending flag latched `true` and every subsequent click
was swallowed with no dialog — permanently unquittable.

### 2.5 Multi-display shutdown — *do this before a Sunday*

1. Connect the second display / projector
2. **Output Settings** → assign Main Output and Stage Display
3. Start presenting; confirm both output windows appear
4. **`Cmd+Q`**

**Expect:** *all* windows close together — no orphaned output window left on the
projector, no surviving process. This is the one that costs you in front of a
congregation.

---

## Tier 3 — Reformat smoke pass (15 min)

Prettier touched 67 files. It is mechanically safe and the build plus 91 tests
agree, but a formatter that touched nearly every file deserves a look at the
things tests cannot see: **layout, spacing, and rendering.**

You are looking for *visual* breakage, not logic. Click through:

- [ ] **Home** — recent cards render with real previews; the template strip
      scrolls horizontally and cards are not collapsed *(this row was changed by
      the carried WIP commit — worth a closer look)*
- [ ] **New / Recent / Open** — all four rail tabs render and switch
- [ ] **Editor canvas** — a slide renders text at the right size and position;
      the text box drags and resizes; snapping guides appear
- [ ] **Floating toolbar** — appears near a selected text box; font, size, B/I/U,
      color, and alignment all apply
- [ ] **Filmstrip** — thumbnails render, drag-reorder works, section colors show
- [ ] **Song Library** — open a song, edit it, reorder the Song Order panel
- [ ] **Media Library** — thumbnails render, search filters
- [ ] **Presenter sidebar** — current and next slide previews render
- [ ] **Live output** — start presenting; text and backgrounds render on the
      output window; advance with spacebar
- [ ] **Backgrounds** — set a section background; confirm it persists across
      slide advances and does *not* restart on each slide

Anything that looks wrong here is far more likely a pre-existing issue than a
formatting artifact — but note it either way.

---

## Tier 4 — Full sweep (only before cutting a release)

Work `presenter-pro/TesterGuide.md` end to end. Do this when tagging a version,
not on every change.

---

## If something fails

Capture, in this order:

1. **Exact steps** to reproduce, from app launch
2. **Expected vs actual**
3. **Console output** — `View → Toggle Developer Tools` in the renderer, and the
   terminal running `npm run dev` for main-process errors
4. Whether it reproduces on `main` (i.e. pre-existing) — the fastest way to tell
   whether a change caused it:

```bash
git stash && git checkout main && npm run dev   # reproduce?
git checkout fix/app-quit-lifecycle && git stash pop
```

Then it becomes a `phase7-remediation.md` entry and gets a failing test before a
fix — same loop as finding #0.

---

## Merge order when it all passes

```bash
gh pr merge 10 --squash    # engineering system
gh pr merge 11 --squash    # quit fix (auto-retargets to main once #10 lands)
```

Then tag a real build and stop using the bash-script `PresenterPro.app`:

```bash
npm version patch
git push origin main --follow-tags
```

That triggers `.github/workflows/build-release.yml`, which re-runs the gate and
attaches signed-nothing-but-real mac and Windows artifacts to a draft release.
