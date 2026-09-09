# The Fable Pass — Deep Quality Plan

A full-codebase quality pass executed under the Planner/Executor/Reviewer model
in `AI_OPERATING_MANUAL.md`. This document is the **charter**: what the pass is
for, what it must produce, how it is reviewed, and in what order.

`phase8-architecture-audit.md` holds the per-category detection commands.
`phase7-remediation.md` holds the live findings list. This file governs both.

---

## The governing principle

**The pass is judged on rules added, not lines changed.**

Everything found so far supports this. Six real bugs have surfaced in this
project, and _not one_ was found by reading code:

| Bug                                       | Found by             |
| ----------------------------------------- | -------------------- |
| Toolbar Insert Media threw ReferenceError | ESLint `no-undef`    |
| Clear-media-slide threw ReferenceError    | ESLint `no-undef`    |
| App could not be quit                     | Ethan, manually      |
| `beforeunload` vetoed every close         | Ethan, manually      |
| No guard when quitting mid-service        | Ethan, manually      |
| Windows packaging never worked            | The release pipeline |

Three by tooling, three by a human using the app. **Zero by inspection.** A pass
that only reads and fixes will therefore miss the same class of thing. Every
finding must end in a mechanical check or a manual-verification step, or it will
regrow — that is not a theory, it is this project's recorded history.

---

## Assessed state (measured 2026-09-06, not estimated)

| Dimension                   | Value                             | Read                                                                                                                |
| --------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Tests                       | 124 passing                       | Real, but young                                                                                                     |
| Line coverage               | **3.78%**                         | The single weakest number here                                                                                      |
| Suppressed lint errors      | **71** across 22 files            | Ratcheted, not fixed                                                                                                |
| Files > 600 lines           | **7**                             | Toolbar 1996 · Canvas 1947 · main 1592 · SongEditorModal 1380 · Home 1295 · FormattingToolbar 1284 · Filmstrip 1260 |
| Renderer bundle             | 849 KB, single chunk              | No code splitting                                                                                                   |
| Runtime dependencies        | **5**                             | Genuinely lean — a real strength                                                                                    |
| Inline `style={{}}`         | **542** across 30 files           | Competing with 746 `var(--)` uses                                                                                   |
| Hardcoded hex colors in JSX | **162**                           | Theme drift; blocks any future theming                                                                              |
| `aria-*` attributes         | **8** vs 163 `onClick`            | Effectively no accessibility                                                                                        |
| Empty `catch` blocks        | 11                                | Silent failure modes                                                                                                |
| `TODO`/`FIXME` markers      | **0**                             | Debt was never marked, not absent                                                                                   |
| Autosave                    | **none**                          | Manual save only                                                                                                    |
| DB migrations               | `CREATE TABLE IF NOT EXISTS` only | **No versioned migrations**                                                                                         |

### Truths worth asserting

**1. The code is better than its reputation, and the numbers say so.**
71 lint problems across ~19k lines is a low defect density for code that never
had a linter. 54 IPC handlers matched 54 preload channels with _zero drift_ —
maintained by hand, with nothing checking. 5 runtime dependencies. This is not a
rotten codebase; it is an unverified one. That distinction is the whole reason a
rewrite would be a mistake.

**2. Coverage at 3.78% is the binding constraint on everything else.**
It blocks decomposing the seven large files, it blocks confident refactoring,
and it is why manual verification found half the bugs. No workstream that
depends on safely changing existing behavior can start before coverage rises
where it is being changed.

**3. No autosave is the largest _product_ risk in the project.**
A volunteer building a service order loses everything to one crash. Every other
item here is about code health; this one is about someone's Sunday morning. It
is also the item most likely to be discovered the worst possible way.

**4. Migrations are idempotent-by-exception, which is not a migration system.**
Columns _can_ be added — there are ten `ALTER TABLE` statements — but each is
wrapped in `try {} catch (_) {}`, so "column already exists" is indistinguishable
from "database locked", "disk full", or "file corrupt". A genuinely failed
migration reports success. There is no version record, so nothing can be
reordered, removed, or reasoned about, and data transforms are impossible —
which is exactly why `default_background_id` was never backfilled on old rows,
the symptom `CLAUDE.md` records without naming the cause.

**5. Accessibility is effectively absent.** 8 `aria-*` attributes against 163
click handlers. For volunteers operating live under pressure — often not
technical, sometimes on unfamiliar hardware — keyboard reachability and focus
order are not a compliance checkbox, they are operability.

**6. Zero TODO markers is a signal, not a clean bill of health.** Debt exists
(71 suppressions prove it); it was simply never written down. The backlog files
are now the honest record.

---

## What every finding must produce

Unchanged from `phase8`, restated because it is the contract:

1. **The fix** — root cause, never a symptom mask.
2. **A failing test** — written first, failing under old code, passing under new.
3. **A mechanical rule** — highest rung that applies:
   _type > lint rule > self-enforcing test > CI check > written convention._

When rung 5 (convention) is the only option, say so explicitly and why. Prose
degrades under execution; that is the lesson of every bug in the table above.

---

## Workstreams

Each ships as its own PR. **One category per plan** — a plan spanning two
categories gets its second half sampled.

### A. Data safety _(highest product value)_

- A real versioned migration system with an applied-migrations table
  (**A1 — prerequisite**, planned in `plan-A1-versioned-migrations.md`; the
  recovery journal needs a new table, which cannot ship safely before this)
- Autosave **and** a crash-recovery journal (**A2**, decided 2026-09-06)
- Backup-before-migrate on first launch of a new schema version
- Audit the 11 empty `catch` blocks: each is a real handler, an explicit
  justified comment, or a bug
- **Rules:** migration-version test that fails when schema changes without a
  migration; lint keeps `no-empty` as an error

### B. IPC contract integrity _(highest structural leverage)_

- Type the channel map end to end (main handler ↔ preload ↔ renderer util)
- Enforce the `{ success, data, error }` envelope rather than trusting it
- Handlers that `throw` instead of returning the envelope
- **Rules:** self-enforcing test diffing the three lists (drift is currently
  zero — capturing that now locks in a good state rather than a backlog)

### C. Lifecycle & process robustness

- Remaining unhandled Electron events (`second-instance`, `child-process-gone`)
- Output/stage window teardown paths
- Single-instance lock (two copies open at once on a live machine is a hazard)
- **Rules:** extend `lifecycleListeners.test.ts`, which already exists

### D. React correctness

- 17 × `set-state-in-effect`, individually triaged — some are legitimate
  external-store syncs, some are real cascading-render bugs. **No bulk fixes.**
- 4 × `immutability` — the urgent subset; real risk under concurrent rendering
- 16 × `exhaustive-deps` — stale-closure sources
- **Rules:** prune `eslint-suppressions.json` as each is fixed; the count only
  goes down

### E. Design system & UX consistency

- 542 inline styles and 162 hardcoded hex values → tokens
- Keyboard reachability and focus order for every interactive control
- Live-operation ergonomics: what a volunteer can reach without a mouse,
  mid-service, under pressure
- **Rules:** lint rule banning raw hex in JSX; a test asserting interactive
  elements are focusable

### F. Structure _(blocked — see Sequencing)_

- Decompose the seven files over 600 lines
- Split the 849 KB single-chunk bundle
- Resolve the two-vocabulary `sectionTypes` naming collision

---

## Review protocol

The Self-Review in `AI_OPERATING_MANUAL.md` §3.2 applies to every PR. For this
pass specifically, the reviewer must additionally answer:

1. **Rule check.** What mechanical rule did this finding produce? If none, is
   the stated reason genuine, or was it just harder than fixing the instance?
2. **Ratchet check.** Did `eslint-suppressions.json` shrink? Did coverage
   thresholds rise to the new measured floor? Neither may move backwards.
3. **Blast radius.** Did the diff stay inside the plan's file list? Name any
   file outside it even when justified.
4. **Manual step.** For anything touching windows, output, presenting, or
   persistence: what is the exact click-path, and was it performed? A green gate
   has never once caught the bugs in the opening table.
5. **Regression honesty.** Anything discovered but not fixed goes into
   `phase7-remediation.md` with a reason — never silently dropped.

---

## Sequencing

Strict. Each stage unblocks the next.

1. **A — Data safety.** Highest user-facing risk, and the empty-catch audit
   raises coverage in the paths everything else touches.
2. **B — IPC contracts.** Do before anything crosses the process boundary.
3. **C — Lifecycle.** Self-contained in `electron/main`.
4. **D — React correctness.** Individually triaged; stabilizes render behavior.
5. **E — Design system.** After D, so render behavior is stable underneath.
6. **F — Structure. BLOCKED until coverage under each target file is real.**
   Refactoring at 3.78% coverage is precisely the mistake that produced the
   current state, at larger scale. Gate: characterization tests must exist for a
   file before it is decomposed.

---

## Decisions (Ethan, 2026-09-06)

1. **Data safety — autosave AND a recovery journal.** Autosave writes to the
   real record; the journal makes a crash mid-write recoverable. **Consequence
   to plan for:** with autosave writing continuously, "discard my changes" stops
   being possible without version history, so A2 must include either a version
   history or an explicit revert path. Flagged rather than assumed.
2. **Risk-first sequencing**, as ordered below. Slowest to show visible change;
   fixes what can break a live service first.
3. **Design — tokens + keyboard operability.** Convert the 542 inline styles and
   162 hex values to tokens, add a lint rule banning raw hex, and make every
   control keyboard-reachable. No visual redesign.
4. **Process — three of four:** enforce branch protection on admins, Playwright
   E2E for the live paths, automated dependency updates. One-command release
   was declined; releases stay a deliberate multi-step action.

## Execution

Plans are written one workstream at a time (never two — a plan spanning
categories gets its second half sampled) and handed to the Executor.

### Status (2026-09-06)

| Plan                                                                      | Outcome                                                                                                                                                                                                                                                                         | PR      |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| P1 process hardening                                                      | done — Dependabot, `enforce_admins` on                                                                                                                                                                                                                                          | #17     |
| P2 E2E harness                                                            | done — 7 specs, launch/quit/unsaved-changes, `e2e.yml`; **required check on `main` since 2026-09-08** (27 green runs, no flake); 30 specs                                                                                                                                       | #18     |
| A1 versioned migrations                                                   | done — 17 unit + 4 E2E, verified on copies of both real DBs, `npm run verify:db`                                                                                                                                                                                                | #29     |
| A2 crash-recovery journal                                                 | done — migration 2, journal sync, Later/Discard/Recover prompt; 21 unit + 3 E2E                                                                                                                                                                                                 | see PR  |
| A3 seeder fix (phase7 #14)                                                | done — key-only seeder, migration 3 claims legacy rows; 11 unit + 1 E2E                                                                                                                                                                                                         | see PR  |
| A3b refresh-only-if-untouched                                             | done — migration 4 + text fingerprint; edited built-ins are never overwritten; `updateSong` preserves provenance columns; 20 unit + 1 E2E                                                                                                                                       | see PR  |
| U1 Electron 29→44, Node 20→22, electron-vite 5, Vite 7, better-sqlite3 13 | done — no code changes needed; rebuild step retired (N-API prebuilds); packaged app verified                                                                                                                                                                                    | see PR  |
| B1 IPC contract                                                           | done — `shared/ipcContract.ts` single source of truth (49 invoke / 1 send / 12 events); main registry enforces the envelope (throws → failure envelopes) and `assertComplete()` at launch; preload generated; renderer has one door (`ipc.ts`), bypass guard; 24 new unit tests | see PR  |
| C1 lifecycle robustness                                                   | done — single-instance lock + `second-instance` focus, `child-process-gone` logged, output/stage renderer crash → reload + live-slide re-sync on ready; 3 lifecycle E2E specs (the presenting-flow gap closed)                                                                  | see PR  |
| A4 real-SQLite unit tests                                                 | done — runner on the legacy schema (backup contents, no-op re-run) + every query module against real SQLite; 22 cases, ms not seconds                                                                                                                                           | see PR  |
| D1 React Compiler immutability + memoization (5)                          | done — body-style helper, memoized `section`, hoisted media helpers; 1 reasoned inline directive; first component render test (OutputRenderer)                                                                                                                                  | see PR  |
| D2 set-state-in-effect, slice 1 (3 of 16)                                 | done — NumberField / LineSpacingBtn derive instead of sync; tutorial step owned by the store; 10 render-test cases                                                                                                                                                              | see PR  |
| D2 slice 2 (6 of 16: 4, 11–15)                                            | done — dead ApplyThemeModal deleted; SongEditorModal lazy-initial state + derived lyrics/collapsed/selection (parents keyed by song id); countdown display set at the event; 9 render-test cases                                                                                | see PR  |
| D2 slice 3 (3 of 16: 9, 10, 16)                                           | done — `useCollapsedSections` + `useClearWhenMissing` (adjust-while-rendering), 10 hook tests; two exhaustive-deps warnings gone with the effects                                                                                                                               | see PR  |
| D2 slice 4 (4 of 16, Canvas) — **D2 complete**                            | done — the store decides auto-editing on selection and selects a just-added box; Canvas resets transient state while rendering; store-owned text-box selection; editing E2E through the real menu                                                                               | see PR  |
| D4 dead code (34 `no-unused-vars`)                                        | done — every symbol grep-verified dead; 4 dead components, 5 dead functions, 1 dead main-process flag; **suppressions file is empty**                                                                                                                                           | see PR  |
| D3 exhaustive-deps (11) — **workstream D complete**                       | done — `useLatest` (useEffectEvent pattern for React 18) for 8 subscription handlers, 2 deps listed, 1 deliberate exclusion made explicit; **`eslint .` is clean, ceiling 0**                                                                                                   | see PR  |
| E1 colour tokens + hex lint rule                                          | done — 147 JSX hex literals → exact-value tokens (26 added) or data modules; `no-restricted-syntax` bans raw hex in `src/**/*.jsx`; token-existence guard test                                                                                                                  | see PR  |
| E3 keyboard operability                                                   | done — global `:focus-visible` ring, 28 outline suppressions removed, collapse slivers → buttons, presentation rows keyboard-operable, backdrops marked, reachability guard test, keyboard-only E2E (open / overlay / F5 / Escape)                                              | see PR  |
| E2 screenshot baseline                                                    | done — 11 captures (3 screens + 8 surfaces), baselines captured on the CI runner via `update_baselines` dispatch (#70), `VISUAL=1` locally, `VISUAL_STRICT=1` exact mode; Escape closes the settings modals (#69)                                                               | #68     |
| E4 inline styles → classes                                                | done — 490 → 198 inline style props (the rest dynamic or in uncaptured states); every slice proven at 0 differing pixels against the local base; `inlineStyleBudget.test.ts` ratchet; 23 CI captures                                                                            | #71–#81 |
| E1b rgba literals → token opacity modifiers                               | done for class strings — 29 literals with token bases → `bg-accent/12`-style modifiers, 0 px on 52 captures (Tailwind 4 `color-mix` is exact); 9 non-token bases, 23 shadows and 83 dynamic JS values stay literal                                                              | see PR  |
| E4c hover handlers left · E1c remaining literals                          | **recommended, not started** — 9 hover handlers (state-setting, slivers, divider, dead FormattingToolbar) and 115 colour literals remain; each needs a capture or a decision first                                                                                              | —       |
| D4b delete FormattingToolbar                                              | done — 1,197-line unreachable component and its test removed (Ethan: tried and decided against)                                                                                                                                                                                 | see PR  |
| U3 Tailwind 4                                                             | done — 4.3.3 via `@tailwindcss/postcss`; theme in `globals.css`; 0 differing pixels on all 52 captures; four v3 habits found and fixed (layers, dynamic spacing, unitless line-heights, source detection)                                                                       | see PR  |
| U2 React 19                                                               | done — 19.2.8 + types; zero type errors, zero code changes; gate 315, 29 E2E, 0 px on 52 captures; no React warning in the renderer console                                                                                                                                     | see PR  |
| C2 renderer Content-Security-Policy                                       | done — build-time meta via a Vite plugin (dev untouched); least-privilege policy from measurements; `e2e/csp.spec.ts` drives media/output/stage with zero violations; 30 E2E, 0 px on 52 captures                                                                               | see PR  |
| E4b hover handlers → `hover:` classes                                     | done — 29 of 38 handlers, 246 lines gone, 0 px on 52 captures (29 clipped hover captures #83), `HOVER_HANDLER_BUDGET` ratchet                                                                                                                                                   | #84     |
| A5 autosave + restore points + Revert to Last Save                        | done — migration 5 `presentation_versions` (append-only, pruned to 25); autosave writes the live row and never clears `isDirty`; Discard reverts; the A2 journal's writer retired as provably dead under autosave; 4 pre-existing bugs found and fixed; 378 unit / 35 E2E                        | #94 +   |
| S1 dead presenter window + phase7 sweep                                   | done — 17 dead branches, 9 dead wrappers, 409-line dead component removed; drift guard fixed                                                                                                                                                                                    | #44     |

Gate on `main` after A3: 182 unit tests, E2E 15/15. `eslint-suppressions.json` 71 → 61.
Everything learned along the way, including corrections to these plans, is in
`fable-notes.md`.
