# Executable Plan E2 — Screenshot baseline (the net for style refactors)

**Workstream:** E · **Why:** E4 (490 inline `style={{…}}` objects → classes) cannot be proven "no visual change" without one. The E2E suite proves behaviour, not pixels.
**Category:** one — visual regression net.

## What it is

`e2e/visual.spec.ts` captures three screens at the app's default window sizes
and compares them to committed baselines with Playwright's `toHaveScreenshot`:

| Screen        | How it gets there                                                               | Masked                                   |
| ------------- | ------------------------------------------------------------------------------- | ---------------------------------------- |
| Home          | fresh profile, tutorial dismissed, seeding settled                              | row dates (`Sep 6, 2026` — change daily) |
| Editor        | Enter on the seeded "Sunday Morning Service" row (keyboard path from E3)        | —                                        |
| Output window | `openOutputWindow({ useConfiguredDisplay: false })` → windowed 1280×720 preview | —                                        |

Baselines: `e2e/visual.spec.ts-snapshots/*-darwin.png` (Playwright keys them by
platform; CI runs the E2E job on macOS too). Tolerance `maxDiffPixelRatio: 0.01`
absorbs sub-pixel anti-aliasing between machines; a real style change is
orders of magnitude larger. Animations are frozen.

**Updating a baseline is a deliberate act:** `npx playwright test
e2e/visual.spec.ts --update-snapshots`, committed with the change that was
_meant_ to be visible, and named in the PR.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

(For this plan that reads: never raise the ratio to make a diff pass; look at the diff image in the artifact.)

## Todos

- [ ] 1. Spec + tolerance; baselines generated; stable across two local runs.
- [ ] 2. CI run on macOS matches the local baselines within tolerance (or the diff is understood and the baseline regenerated on CI's renderer — recorded either way).
- [ ] 3. Record; PR.
