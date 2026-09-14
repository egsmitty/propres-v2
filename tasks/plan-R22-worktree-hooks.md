# Executable Plan R22 — committing from a worktree runs the hooks

**Source:** `tasks/fable-pass-2-audit.md` item **REPO-22** (P1, [S]). Also a
standing trap in both handoffs: _"Committing from a `git worktree` fails in the
`commit-msg` hook … `git commit --no-verify` is the way through."_

Written per `.cursor/rules/writing-executable-plans.mdc`.

---

## Measured (2026-09-13, `main` @ `ab65e2d`)

`.husky/commit-msg:6` — `MSG_FILE="$PWD/$1"`.

Git passes the message path **relative** from the main checkout
(`.git/COMMIT_EDITMSG`) but **absolute** from a linked worktree. Measured in a
worktree:

```
git rev-parse --path-format=absolute --git-path COMMIT_EDITMSG
→ /Users/ethansmith/code/ProPresV2/.git/worktrees/repo22-hooks/COMMIT_EDITMSG
sh .husky/commit-msg <that path>
→ Error: No commit message file found at
  /…/worktrees/repo22-hooks/Users/ethansmith/code/ProPresV2/.git/worktrees/…
  exit=1
```

Two further facts the handoff had as folklore:

1. **`HUSKY=0` does nothing.** `core.hooksPath` points straight at `.husky/`
   (plain scripts; there is no `.husky/_` husky runtime), so nothing reads the
   variable.
2. **A fresh worktree has no `presenter-pro/node_modules`**, so `npx commitlint`
   and `npx lint-staged` there would try the registry.

Also found: `core.hooksPath` is set to the **absolute** main-checkout path, so
every worktree runs the *main checkout's* copy of these scripts. This fix only
reaches other worktrees once it is merged and the main checkout is on `main`.

## Decisions

1. Resolve the message path by shape: absolute as-is, relative against `$PWD`,
   **before** `cd presenter-pro`.
2. Honour `HUSKY=0` in both hooks explicitly, so the documented escape hatch is
   real rather than accidentally-absent.
3. Call the binaries directly from `node_modules/.bin`, falling back to the main
   checkout's via `git rev-parse --git-common-dir` when the worktree has none.
   No `npx` (it silently reaches for the network).
4. Do not remove the `husky` devDependency here — that is a separate cleanup
   with its own `prepare`-script consequences.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

## Blast radius

May change: `.husky/commit-msg`, `.husky/pre-commit`,
`presenter-pro/electron/main/__tests__/gitHooks.test.ts` (new), this plan, the
charter row, the notes entry. **May not** change: `commitlint.config.mjs`,
`package.json`, lint-staged config, any workflow.

## Todos

- [x] 1. **Red:** `electron/main/__tests__/gitHooks.test.ts` runs the real hook
  under `sh` from the repo root — absolute path + good message → 0; relative
  path + good message → 0; bad message → non-zero; `HUSKY=0` + bad message → 0.
  Against the old hook: **3 of 4 fail** (both valid paths ENOENT / exit 1, and
  `HUSKY=0` exits 1). Verify: `npx vitest run electron/main/__tests__/gitHooks.test.ts`.
- [x] 2. Fix `.husky/commit-msg` (Decisions 1–3). Same test: **4 / 4 pass**.
- [x] 3. Same `HUSKY=0` + binary fallback in `.husky/pre-commit`.
- [x] 4. Green proof by hand from a worktree (all four cases, matching exits).
- [ ] 5. `npm run gate` + `npm run format:check`; commit from the worktree
  **with hooks on** (no `--no-verify`) — the change proves itself on its own
  commit only once merged, because `core.hooksPath` is absolute; until then the
  commit runs the main checkout's old hook, so this one commit may still need
  `--no-verify` after checking the message with commitlint by hand.
- [ ] 6. Findings report in the PR body.

Comparisons: exit status is **exact** (`toBe(0)`); the ENOENT absence is a
`not.toContain` on stderr — that one is a guard against the specific failure,
not a substitute for an equality.

## Compliance Manifest

### writing-executable-plans.mdc (this rule)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Anti-weakening clause above; exactness stated under Todos |
| List sampling designed against | The four hook cases are enumerated and each is its own `it` |
| Quantifier erosion designed against | N/A — no "every X" claims; four named cases |
| Sanctioned escape hatch | N/A — no allowlist; nothing to exempt |
| Bounded blast radius | "Blast radius" section |
| File-specific pitfall notes | Measured §: absolute `core.hooksPath`, missing worktree `node_modules` |
| Exact paths | Blast radius lists every file |
| Per-todo verification | Todos 1, 2, 5 name their commands |
| Snapshot policy inline | N/A — no snapshots |
| Preconditions for conditional UI | N/A — no UI |
| Structural floor under snapshots | N/A — no snapshots |
| IPC contract pinning | N/A — no IPC channel touched |
| Manual verification steps | Todo 4 (by-hand run of all four cases from a worktree) |
| Required findings report | Todo 6 |

### testing-standards.mdc (10 items)

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | Todo 1 red before Todo 2 |
| 2 | Behavior-change test edits | N/A — no existing test modified |
| 3 | No weakened assertions | Clause verbatim; exact exit-status comparisons |
| 4 | Coverage floor | One case per path shape, plus rejection and skip |
| 5 | Lint floor | No `.only`/`.skip`; every `it` asserts; no `expect` in `if`/`catch` (the `finally` only cleans up) |
| 6 | Snapshot discipline | N/A — no snapshots |
| 7 | Completion gate | Todo 5 |
| 8 | Vitest/jsdom mechanics | N/A for jsdom/Zustand/ipc; node environment, spawns `sh`, no `better-sqlite3`, no timers |
| 9 | Test placement | `electron/main/__tests__/`, beside `toolchain.test.ts` (repo tooling guard) |
| 10 | Characterization before refactor | N/A — not a refactor |
