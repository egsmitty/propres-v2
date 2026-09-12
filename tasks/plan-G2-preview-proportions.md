# Executable Plan G2 — the presenter preview is not 16:9

**Source:** `tasks/ux-review-2026-09-11.md` §1 and §4.3, a **P0**. Ethan saw it in
two screenshots: the live preview measured roughly **3.8 : 1** with the panel
dragged wide, and about **2 : 1** at an ordinary panel width. It should be
1.78 : 1.

Written per `.cursor/rules/writing-executable-plans.mdc`.

---

## Measured (2026-09-11)

`PresenterPanel.jsx:335-339`:

```jsx
className="… flex items-center justify-center w-full max-w-full max-h-full …"
style={{ aspectRatio: getPresentationAspectRatio(presentation), … }}
```

`w-full` makes the **width definite**, so the browser computes
`height = width ÷ ratio`. `max-h-full` then clamps that height — but a definite
width is never clamped back, because `aspect-ratio` only transfers a constraint
into an axis whose size is `auto`. The box keeps its full width, loses the
height the ratio asked for, and the ratio silently breaks. It shows whenever the
container is wider than `ratio × its available height`.

### A correction to the review, from reading all six call sites

The review says the other four previews "get it right only because a grid or a
fixed width happens to constrain them first". That is not why. **None of them
clamps height at all**, so their ratio cannot break:

| Site                                    | Sizing                                 | Height clamp?     |
| --------------------------------------- | -------------------------------------- | ----------------- |
| `PresenterPanel.jsx:337` (live preview) | `w-full max-w-full **max-h-full**`     | **yes — the bug** |
| `PresenterPanel.jsx:465` (slide grid)   | grid cell, `aspectRatio` only          | no                |
| `Filmstrip.jsx:276`                     | `w-full`, `aspectRatio` only           | no                |
| `FilmstripSlide.jsx:119` and `:125`     | `w-full` / wrapper, `aspectRatio` only | no                |
| `Home.jsx:1082`                         | `w-[90px]`, `aspectRatio` only         | no                |

So this is a **one-site bug**, and a shared `SlideAspectBox` would be
future-proofing rather than a fix. That changes the recommendation below.

## Decisions

1. **Fix the one broken site; do not convert the other five.** Converting
   correct, pixel-stable previews to a new shared component risks moving
   baselines for no behavioural gain, and it is the kind of change that hides a
   real regression inside a large diff. The component can come later, when a
   second site actually needs a height clamp.
2. **Fix it in CSS, not with a measured scale.** The review suggests
   `getPresentationScale` with a measured container, and `ScaledSlideText`
   already does that with a `ResizeObserver` — but it costs a hook, an observer
   and a re-render per resize frame, to compute what CSS can express in one
   declaration. The box gets `width: min(100cqw, 100cqh × ratio)` against a
   size-container parent, which is exactly the letterbox calculation
   `Math.min(w/width, h/height)` expressed declaratively. Chromium supports
   container units well past the Electron 44 floor.
3. **The inline-style budget must not move.** The ratio is dynamic, so it stays
   an inline style — but it goes into the element's **existing** `style` object,
   so `PresenterPanel.jsx` holds at 23 `style={` props and its exact ceiling
   stays 23. The parent's `container-type: size` goes on as an arbitrary class,
   not a style prop.
4. **The proof is an E2E measurement, not a screenshot.** jsdom has no layout
   engine, so a unit test cannot measure a ratio — and all 52 existing baselines
   are captured at one window size, which is why the net never caught this. The
   new test drags the presenter panel wide and asserts the box's measured
   `boundingBox()` ratio is within a pixel or two of the presentation's own
   ratio. That fails on today's code.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

**Applied here:** the tolerance on the measured ratio is set once, small, and
justified by sub-pixel rounding. If the measurement misses, do not widen the
tolerance — the box is wrong.

## Bounded blast radius

| File                                                        | Action                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `presenter-pro/src/components/presenter/PresenterPanel.jsx` | modify — one element's class list and its existing style object; its parent gains one class |
| `presenter-pro/e2e/presenterPreview.spec.ts`                | create — measure the ratio at a wide panel width and at the default width                   |

### Do NOT

Touch the other five aspect-ratio call sites · add a `style={` prop anywhere ·
change the panel's colours, borders or content · add a next-slide preview
(review §3.1 is a separate P2 that needs a layout decision from Ethan) · touch
any existing baseline.

## Todos

- [x] **1. Failing E2E first.** Open the editor, show the presenter panel, drag
      its divider wide, measure the live-preview box, assert
      `width / height ≈ 16/9`. Must FAIL on current code, reporting the real
      ratio — paste it, since Ethan's screenshot estimate (3.8 : 1) deserves a
      measured number.
- [x] **2. Fix.** Parent `[container-type:size]`; box drops `w-full`, keeps both
      `max-*`, and its style gets `width: min(100cqw, calc(100cqh * <ratio>))`.
- [x] **3. Verify at both widths** — wide and default — and for a non-16:9
      presentation, so the fix is not hardcoded to one ratio.
- [x] **4. Gate** and `format:check`; confirm `PresenterPanel.jsx` still counts
      23 inline styles.
- [x] **5. Push. The 52 baselines must not move** — every one is captured at the
      default panel width, where the box was already correct. If one moves, the
      fix changed something it should not have.
- [x] **6. Record** in the charter, the notes, and the UX review's table.

## Pitfall notes

1. **`container-type: size` needs a definite size in both axes.** The parent is
   `flex-1 min-h-0` inside a column, so it has one — but if a future change
   makes it content-sized, the box collapses to zero. The E2E measurement is the
   guard.
2. **Size containment stops children from influencing the parent's size.** That
   is the intent here (the parent is already flex-sized), but check the panel
   below the preview still lays out.
3. **E2E: the presenter panel only opens automatically at ≥1400px window width**
   at store init — use the existing `showPresenterPanel` helper in
   `e2e/fixtures/visual.ts` rather than assuming it is open.
4. **Panel width persists in `localStorage`**, so a test that drags the divider
   can leak into the next test in the same profile. Set the width explicitly
   rather than relying on a default.
5. **Do not run Playwright locally while Ethan is at the machine** (standing
   rule 7) — it launches the real app over his screen. CI is the verdict.
6. **Never `git add -A`.**

## Required findings report

1. The measured ratio before the fix, at both widths, and after.
2. Gate, CI E2E, and that the 52 baselines did not move.
3. The correction to the review's five-call-sites claim, stated plainly.
4. Anything found and not fixed.

---

## Amendments after the fresh-agent review (standing rule 9)

The review **approved with three changes**, all of which are folded in above and
below. It also corrected the trigger, which mattered.

### B1 — the E2E needs a selector, and adding one widens the blast radius

`PresenterPanel.jsx` carries no `data-*` hook on the preview box, its container,
or the panel root. The plan said the change was "one element's class list and
its existing style object", which was not true once a test had to find the box.
**`data-live-preview="true"` is added to the preview box** and is part of the
blast radius. The inline-style ratchet is unaffected — it matches `style={`, and
a data attribute is not one.

### B2 — the trigger is not only panel width

The breaking condition is `container width > ratio x container height`, and the
height is governed by the panel's **horizontal divider**, not just its width.
The top half is `flexBasis: topPanelHeight` (default **320**, floor
`PRESENTER_PANEL_MIN_TOP_HEIGHT = 220`); after the button row, padding and the
LIVE header, roughly **229px** of preview height remains at the default and
**~129px** at the minimum. At the default panel width of **320** the box needs
about 166px — fine at 229, **broken at 129**.

So the bug reproduces **at the default width** with the divider dragged down,
which is very likely what Ethan's second screenshot (§4.3, roughly 2:1) actually
was. The spec asserts both geometries, and each asserts the precondition — that
the container really did become short-and-wide — so a drag that fails to take
cannot let the test pass on broken code.

### B3 — the ratio must be a number

`getPresentationAspectRatio` returns the CSS **string** `"1920/1080"`. Dropping
that into `calc(100cqh * ...)` only works by operator precedence and reads like
an accident, and a custom ratio makes it worse. The fix uses
`getPresentationDimensions` and interpolates `width / height` as a number.

### Confirmed by the review, worth recording

- **The CSS diagnosis is right**, and so is the plan's correction to the UX
  review: the other five call sites set no height clamp, so they cannot break.
  Leaving them alone is the right call.
- **No pure-CSS form without container units expresses this.** `h-full w-auto`
  fails for a narrow-tall container and `w-full h-auto` for a wide-short one;
  there is no non-container-query way to take the `min()` of two axes for a
  non-replaced element.
- **The 52 baselines will not move.** Every visual spec captures at
  `CAPTURE = 1200x660` on a fresh profile — panel width 320, top height 320 —
  and none drags either divider. At that geometry the computed width is
  `min(296px, 229 x 1.778 = 407px) = 296px`, byte-identical to today.
- **`container-type: size` implies `contain: layout style size`, not `paint`**,
  so nothing is clipped and the button row, divider and slide grid below are
  outside the container and unaffected. One behaviour change worth knowing: if
  free space ever went negative the box would now collapse to 0 rather than
  overflow. The 220px floor makes that unreachable.
- **Tailwind 4 generates the arbitrary class.** `globals.css` uses
  `source(none)` with `@source '../'`, and the built CSS was checked directly:
  `container-type:size` is present in `out/renderer/assets/*.css`.

### Found and not fixed

`CLAUDE.md` says the presenter panel is **300px**; it is **320 default / 240
minimum** (`presenterStore.js`). Documentation drift, one line, someone else's
PR.
