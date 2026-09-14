# Executable Plan E2E1 — the keyboard spec listens for the output window before pressing F5

**Source:** a failed required check, not the audit. The `E2E (macOS)` job on PR
#136 failed at run 34821114021 with **48 passed, 1 flaky** — the E2E workflow's
own rule is "if it ever flakes, fix the flake; do not demote it", and
`playwright.config.ts` sets `failOnFlakyTests` on CI.

Written per `.cursor/rules/writing-executable-plans.mdc`. Branch base `main` @
`13792c6`.

---

## Measured

| Where                                                                                                                                    | What happened                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `presenter-pro/e2e/keyboard.spec.ts` — "a presentation row opens with Enter, ? toggles the overlay, F5/Escape start and stop presenting" | `await page.keyboard.press('F5')`, then `await app.waitForEvent('window', { timeout: 15_000 })`.                                                                                                                                                                                                                                             |
| Run 34821114021, attempt 1                                                                                                               | `TimeoutError: electronApplication.waitForEvent: Timeout 15000ms exceeded while waiting for event "window"` after 16.0 s.                                                                                                                                                                                                                    |
| Same run, retry #1                                                                                                                       | Passed in 1.2 s.                                                                                                                                                                                                                                                                                                                             |
| Why                                                                                                                                      | Playwright only sees events emitted after `waitForEvent` is called. When the output window opens within the key press's round trip, the `window` event fires before the listener exists and is never seen. The same spec already does it right for the close: `const closed = output.waitForEvent('close', …)` **before** `press('Escape')`. |
| Scope                                                                                                                                    | The spec is on `main`; #136 (version history) touches none of the presenting path. The race can fail any PR's required check.                                                                                                                                                                                                                |

## Decisions

1. Start `app.waitForEvent('window')` **before** pressing F5 and await it after —
   the order the spec already uses for `close`.
2. Nothing else changes: the same assertions, timeouts and flow.
3. **No retry, timeout or `failOnFlakyTests` change** — that would be demoting the
   check, which the workflow forbids.
4. **Not in this plan:** auditing every other `waitForEvent` in `e2e/`. A grep for
   the same press-then-wait pattern is recorded as a finding.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

## Blast radius

May change: `presenter-pro/e2e/keyboard.spec.ts` (the F5 step only), this plan,
the charter row, the notes entry. **May not** change any other spec, fixture,
config or app code.

## Todos

- [x] 1. **Red** — the failure is CI's own: run 34821114021, attempt 1 timed out
      waiting for `window` (evidence in Measured). Standing rule 7 forbids running
      Playwright locally while Ethan is at the machine, so the red is not
      reproduced here; a timing race is not reliably reproducible on demand anyway.
- [x] 2. Reorder the wait and the key press (Decision 1).
- [ ] 3. `npx eslint e2e/keyboard.spec.ts`, `npm run format:check`, `npm run gate`.
- [ ] 4. CI: `E2E (macOS)` green on this branch (the proof), and on the next PRs
      that run the keyboard spec.
- [ ] 5. Findings report in the PR body.

## Compliance Manifest

### writing-executable-plans.mdc (15 items)

| Item                                          | Disposition                                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Assertion weakening designed against          | Clause verbatim; no assertion, timeout or retry touched (Decision 3)                                |
| List sampling designed against                | N/A — one step in one spec                                                                          |
| Quantifier erosion designed against           | N/A — no "every" claim; other specs are a recorded finding, not claimed fixed                       |
| Sanctioned escape hatch                       | N/A — no allowlist                                                                                  |
| Bounded blast radius                          | Blast radius section                                                                                |
| File-specific pitfall notes                   | Measured: Playwright sees only events emitted after `waitForEvent` is called                        |
| Exact paths                                   | Blast radius                                                                                        |
| Per-todo verification                         | Todos 3 and 4                                                                                       |
| Snapshot policy inline                        | N/A — no snapshots touched                                                                          |
| Preconditions for conditional UI              | The presentation must be open and editing before F5 (the spec's existing `data-slide-editing` wait) |
| Structural floor under snapshots              | N/A — no snapshots                                                                                  |
| IPC contract pinning                          | N/A — no channel changed                                                                            |
| Manual verification steps                     | N/A — test-only; CI is the verification (Todo 4)                                                    |
| Required findings report                      | Todo 5                                                                                              |
| Data rewrites state their backup and rollback | N/A — no data                                                                                       |

### testing-standards.mdc (10 items)

| #   | Item                             | Disposition                                                                                                                                                                        |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | TDD ordering                     | The red is CI run 34821114021 (Todo 1), before the change                                                                                                                          |
| 2   | Behavior-change test edits       | This edits an existing spec's **ordering**, not its assertions: it fails intermittently on the old order and removes the race on the new one — stated here and in the spec comment |
| 3   | No weakened assertions           | Clause verbatim; assertions unchanged                                                                                                                                              |
| 4   | Coverage floor                   | N/A — no product code                                                                                                                                                              |
| 5   | Lint floor                       | ESLint and format on the spec (Todo 3)                                                                                                                                             |
| 6   | Snapshot discipline              | N/A — no snapshots                                                                                                                                                                 |
| 7   | Completion gate                  | Todo 3 locally; Todo 4 on CI                                                                                                                                                       |
| 8   | Vitest / jsdom mechanics         | N/A — Playwright; the event listener is registered before the action, as the `close` wait already does                                                                             |
| 9   | Test placement                   | `presenter-pro/e2e/` (unchanged)                                                                                                                                                   |
| 10  | Characterization before refactor | N/A — a race fix, not a refactor                                                                                                                                                   |
