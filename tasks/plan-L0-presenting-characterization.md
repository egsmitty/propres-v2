# Executable Plan L0 — pin the presenting flow before touching it

**Source:** `tasks/fable-pass-2-audit.md` (local, untracked) — Wave 1, plan **L0**,
item **LIVE-E5**: _"what has no tests is the advance logic in `presenterFlow` /
`PresenterPanel`, which is what matters. Write A1/A2/A3/A4/A6 characterization
tests before L3/L4."_ The audit's verification pass moved this ahead of every
live-safety fix.

Written per `.cursor/rules/writing-executable-plans.mdc`.

---

## Measured (2026-09-13, `main` @ `ab65e2d`)

The only presenter test is `OutputRenderer.test.tsx` (five cases: mount,
subscriptions, painting). Nothing covers:

| Code | What it decides | Tests before |
|---|---|---|
| `src/utils/presenterFlow.js` — `flattenPresentationSlides`, `startSidebarPresentationSession`, `stopPresentationSession`, `sendSlideLive`, `syncPresentationSession` | which slide goes live on start, what a live slide carries, what an edit mid-session refreshes | **0** |
| `src/components/presenter/PresenterPanel.jsx` keydown handler + `goPrev` / `goNext` / `goToSlide` | what →, ← and Space send to the projector | **0** |
| `src/utils/appCommands.js` `present:start` / `stop` / `black` / `logo` | when the Present menu acts | **0** (`appCommands.closeGuard.test.ts` covers only `window:requestClose`) |

## Decisions

1. **Pin the correct behaviour, not the bugs.** The known live-safety bugs
   (LIVE-A1…A6) each get a red test in the PR that fixes them. A characterization
   test that pinned a bug would have to be *edited* by its fix, which defeats
   the point — these must pass **unchanged** through every Wave 1 fix. So, for
   example, "a deleted live slide is not refreshed" is pinned (still true after
   LIVE-A4), but "a live slide moved to another section is not refreshed" is
   deliberately **not** (LIVE-A4 changes it).
2. **Nothing is skipped.** The lint floor forbids `.skip`, and a red test on
   `main` would block every PR. Hence Decision 1.
3. **Two jsdom seams are stubbed, not asserted:** `Element.scrollIntoView` (the
   panel scrolls the live thumbnail into view on every live change — jsdom has no
   layout) and `window.focus` (start focuses the window for the keyboard). Both
   are measurement/host seams per `testing-standards.mdc`.
4. **No production code changes.** Zero render change, zero behaviour change.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

Comparisons: slide id lists are **exact, ordered** (`toEqual([...])`); call
counts are **exact** (`toHaveBeenCalledTimes(n)`); IPC ordering on start is
asserted with `invocationCallOrder` (output → session slides → first slide).

## Blast radius

May create: `presenter-pro/src/utils/__tests__/presenterFlow.test.ts`,
`presenter-pro/src/components/presenter/__tests__/PresenterPanel.keys.test.tsx`,
`presenter-pro/src/utils/__tests__/appCommands.present.test.ts`, this plan, the
charter row, the notes entry. **May not** change any file under
`presenter-pro/src/` or `presenter-pro/electron/` that is not a test — if a test
cannot pass without a production change, that is a finding, not a fix.

## Todos

- [x] 1. `presenterFlow.test.ts` — **14 cases** (3 + 5 + 1 + 2 + 3), this list
  is exhaustive: flatten (3: null → `[]`; order + section + inherited background
  + ratio; 16:9 default) · start (5: no slides → false and nothing opened; starts
  on the selection with ordered IPC and the full store state; falls back to the
  first slide; stage display only-if-assigned and waited for only when opened;
  output never ready → alert after 5 s with fake timers, not live) · stop (1) ·
  `sendSlideLive` (2: guards; payload + live) · sync (3: not presenting → no
  refresh; refreshes the edited live slide by id; deleted live slide → no
  refresh). Verify: `npx vitest run src/utils/__tests__/presenterFlow.test.ts`.
- [x] 2. `PresenterPanel.keys.test.tsx` — **7 cases**: → next; Space across a
  section boundary; ← previous; → at last does nothing; ← at first does
  nothing; typing in an input never advances (→ and Space); not presenting → →
  sends nothing. Verify: `npx vitest run src/components/presenter/__tests__/PresenterPanel.keys.test.tsx`.
- [x] 3. `appCommands.present.test.ts` — **7 cases**: start succeeds; start with
  nothing to present alerts `Nothing to Present`; start without a presentation;
  start while live; stop while live; black + logo while live; stop/black/logo
  when nothing is live. Verify: `npx vitest run src/utils/__tests__/appCommands.present.test.ts`.
- [ ] 4. `npm run gate` + `npm run format:check`.
- [ ] 5. Findings report in the PR body.

Manual verification: N/A — no user-facing change (tests only).

## Review

Counted from the files, not from memory (the list-sampling rule applies to the
plan's own numbers): `presenterFlow.test.ts` **14** cases, `PresenterPanel.keys.test.tsx`
**7**, `appCommands.present.test.ts` **7** — **28 total**, matching the vitest run
(`Tests 28 passed (28)`).

## Compliance Manifest

### writing-executable-plans.mdc (14 items)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; exactness stated under Decisions |
| List sampling designed against | Todos give an exact case count per file; Review re-counts from the files |
| Quantifier erosion designed against | Slide-id lists compared whole (`toEqual`), never "includes" |
| Sanctioned escape hatch | N/A — no allowlist; a needed production change is a finding (Blast radius) |
| Bounded blast radius | Blast radius section |
| File-specific pitfall notes | Decision 3 (jsdom `scrollIntoView`, `window.focus`); Zustand reset in every file |
| Exact paths | Blast radius |
| Per-todo verification | Todos 1–3 name their commands; Todo 4 the gate |
| Snapshot policy inline | N/A — no snapshots |
| Preconditions for conditional UI | The panel's keyboard handler mounts only with `isPresenting`; `presentFrom()` seeds it and `presenterPanelOpen` explicitly |
| Structural floor under snapshots | N/A — no snapshots |
| IPC contract pinning | N/A — no channel added or changed; IPC is mocked at `@/utils/ipc` |
| Manual verification steps | N/A — tests only, no user-facing change |
| Required findings report | Todo 5 |

### testing-standards.mdc (10 items)

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | N/A — characterization of existing behaviour; red tests belong to the fix PRs (Decision 1) |
| 2 | Behavior-change test edits | N/A — no existing test modified |
| 3 | No weakened assertions | Clause verbatim; exact comparisons listed under Decisions |
| 4 | Coverage floor | Every exported `presenterFlow` function and each panel key branch has ≥1 case |
| 5 | Lint floor | No `.only`/`.skip`; every case asserts; no `expect` inside `if`/`catch` |
| 6 | Snapshot discipline | N/A — no snapshots |
| 7 | Completion gate | Todo 4 |
| 8 | Vitest / jsdom mechanics | jsdom header + jest-dom; both stores reset with `setState(INITIAL, true)`; `@/utils/ipc` mocked; fake timers for the 5 s ready timeout; seams stubbed (Decision 3) |
| 9 | Test placement | `src/utils/__tests__/` (utils) and `src/components/presenter/__tests__/` (component) |
| 10 | Characterization before refactor | This plan **is** the characterization step for Wave 1; the fixes land in later PRs and must leave these 28 cases unchanged |
