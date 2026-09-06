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
project, and *not one* was found by reading code:

| Bug | Found by |
|---|---|
| Toolbar Insert Media threw ReferenceError | ESLint `no-undef` |
| Clear-media-slide threw ReferenceError | ESLint `no-undef` |
| App could not be quit | Ethan, manually |
| `beforeunload` vetoed every close | Ethan, manually |
| No guard when quitting mid-service | Ethan, manually |
| Windows packaging never worked | The release pipeline |

Three by tooling, three by a human using the app. **Zero by inspection.** A pass
that only reads and fixes will therefore miss the same class of thing. Every
finding must end in a mechanical check or a manual-verification step, or it will
regrow — that is not a theory, it is this project's recorded history.

---

## Assessed state (measured 2026-09-06, not estimated)

| Dimension | Value | Read |
|---|---|---|
| Tests | 124 passing | Real, but young |
| Line coverage | **3.78%** | The single weakest number here |
| Suppressed lint errors | **71** across 22 files | Ratcheted, not fixed |
| Files > 600 lines | **7** | Toolbar 1996 · Canvas 1947 · main 1592 · SongEditorModal 1380 · Home 1295 · FormattingToolbar 1284 · Filmstrip 1260 |
| Renderer bundle | 849 KB, single chunk | No code splitting |
| Runtime dependencies | **5** | Genuinely lean — a real strength |
| Inline `style={{}}` | **542** across 30 files | Competing with 746 `var(--)` uses |
| Hardcoded hex colors in JSX | **162** | Theme drift; blocks any future theming |
| `aria-*` attributes | **8** vs 163 `onClick` | Effectively no accessibility |
| Empty `catch` blocks | 11 | Silent failure modes |
| `TODO`/`FIXME` markers | **0** | Debt was never marked, not absent |
| Autosave | **none** | Manual save only |
| DB migrations | `CREATE TABLE IF NOT EXISTS` only | **No versioned migrations** |

### Truths worth asserting

**1. The code is better than its reputation, and the numbers say so.**
71 lint problems across ~19k lines is a low defect density for code that never
had a linter. 54 IPC handlers matched 54 preload channels with *zero drift* —
maintained by hand, with nothing checking. 5 runtime dependencies. This is not a
rotten codebase; it is an unverified one. That distinction is the whole reason a
rewrite would be a mistake.

**2. Coverage at 3.78% is the binding constraint on everything else.**
It blocks decomposing the seven large files, it blocks confident refactoring,
and it is why manual verification found half the bugs. No workstream that
depends on safely changing existing behavior can start before coverage rises
where it is being changed.

**3. No autosave is the largest *product* risk in the project.**
A volunteer building a service order loses everything to one crash. Every other
item here is about code health; this one is about someone's Sunday morning. It
is also the item most likely to be discovered the worst possible way.

**4. `CREATE TABLE IF NOT EXISTS` is not a migration system.**
Columns can never be added or altered on an existing install. `CLAUDE.md`
already records the symptom — "older rows may not have `default_background_id`
populated" — without naming the cause. Any future schema change silently
no-ops on every existing user's database. This is a data-integrity bug waiting
for its trigger.

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
   *type > lint rule > self-enforcing test > CI check > written convention.*

When rung 5 (convention) is the only option, say so explicitly and why. Prose
degrades under execution; that is the lesson of every bug in the table above.

---

## Workstreams

Each ships as its own PR. **One category per plan** — a plan spanning two
categories gets its second half sampled.

### A. Data safety *(highest product value)*
- Autosave / crash recovery for in-progress presentations
- A real versioned migration system with an applied-migrations table
- Backup-before-migrate on first launch of a new schema version
- Audit the 11 empty `catch` blocks: each is a real handler, an explicit
  justified comment, or a bug
- **Rules:** migration-version test that fails when schema changes without a
  migration; lint keeps `no-empty` as an error

### B. IPC contract integrity *(highest structural leverage)*
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

### F. Structure *(blocked — see Sequencing)*
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

## Open decisions

Recorded in the follow-up conversation; this section is filled in once answered.

- Autosave model and scope
- What the pass optimizes for, and how visible it should be to users
- Design-system ambition
- Process tightening (admin bypass, E2E, dependency automation)
