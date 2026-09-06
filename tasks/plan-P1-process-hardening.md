# Executable Plan P1 — Process Hardening

**Workstream:** Process · **Size:** small · **Depends on:** nothing
**Executor:** follow this literally. If something is unclear or blocked, STOP and
report — do not improvise.

Two independent items, both config-only. No application code changes.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

## Bounded blast radius

**You may create or modify only these files:**

| File | Action |
|---|---|
| `.github/dependabot.yml` | create |
| `.github/BRANCHING.md` | modify (document the admin-enforcement change) |

**Do NOT modify:** anything under `presenter-pro/`, any workflow file, any test,
`eslint-suppressions.json`, or `vitest.config.mjs`. This plan changes no
application code, so `npm run gate` results must be **identical** before and
after — that is itself the verification.

---

## Todos

- [ ] **1. Add `.github/dependabot.yml`.** Two ecosystems:

      - `npm`, directory `/presenter-pro`, weekly.
      - `github-actions`, directory `/`, weekly.

      Requirements, **all 5 — this list is exhaustive**:
      1. `open-pull-requests-limit: 5` on the npm ecosystem, so a backlog cannot
         bury the PR list.
      2. Group all non-major updates into a single PR per ecosystem
         (`groups:` with `update-types: ["minor", "patch"]`). One PR a week, not
         twenty.
      3. Major updates ungrouped, so each arrives on its own and gets read.
      4. `commit-message.prefix: "chore"` so Dependabot's commits follow the
         Conventional Commits history. *(Corrected: husky hooks run only on the
         local committing machine, so Dependabot is never blocked by commitlint.
         The prefix is for a clean history, not a gate.)*
      5. `ignore` **must be empty**. Do not pre-emptively pin anything.

      *Verify:* `gh api repos/egsmitty/propres-v2/dependabot/alerts --silent`
      is not required; instead confirm the file parses and the schema is valid:
      ```bash
      node -e "const y=require('./presenter-pro/node_modules/js-yaml');
        const d=y.load(require('fs').readFileSync('.github/dependabot.yml','utf8'));
        if (d.version!==2) throw new Error('version must be 2');
        if (d.updates.length!==2) throw new Error('expected 2 ecosystems');
        console.log('dependabot.yml OK:', d.updates.map(u=>u['package-ecosystem']).join(', '));"
      ```

- [ ] **2. Enable branch protection for admins.** Currently `enforce_admins` is
      `false`, so the repository owner bypasses the required `PR Gate` check —
      a direct push to `main` succeeds and GitHub only logs
      `Bypassed rule violations`. Turn it on:

      ```bash
      gh api -X POST repos/egsmitty/propres-v2/branches/main/protection/enforce_admins
      ```

      *Verify:*
      ```bash
      gh api repos/egsmitty/propres-v2/branches/main/protection \
        --jq '.enforce_admins.enabled'   # must print: true
      ```

      **Do not** disable any other protection setting while doing this. Confirm
      afterwards that required status checks still list exactly `PR Gate`:
      ```bash
      gh api repos/egsmitty/propres-v2/branches/main/protection \
        --jq '.required_status_checks.contexts'   # must print: ["PR Gate"]
      ```

- [ ] **3. Document it** in `.github/BRANCHING.md`. That file currently says
      required approving reviews are intentionally off for solo work — leave
      that as is, it is still true. Add that **admin enforcement is now ON**, so
      even the repository owner must open a PR, and note the escape hatch: in a
      genuine emergency, protection can be toggled off in Settings → Branches,
      the fix pushed, and protection re-enabled. Say explicitly that using that
      hatch should be rare and deliberate.

- [ ] **4. Run the completion gate and report.** No application code changed, so
      the numbers must be unchanged.
      *Verify:* `cd presenter-pro && npm run gate` — report `type-check`,
      `lint`, and vitest `passed/total`. Expect **124/124** and 0 lint errors.
      A different number means this plan touched something it should not have;
      STOP and report.

---

## Pitfall notes

- **Dependabot is not subject to the local hooks.** Husky runs on the committing
  machine; Dependabot commits on GitHub. The `commit-message.prefix` keeps the
  history conventional but is not enforced — do not expect a failing PR if it
  is wrong.
- **Do not add an `ignore` list.** Pinning things away from updates is how a
  dependency file quietly rots. If a specific update genuinely must be held
  back, that is a separate decision with a recorded reason.
- **Enabling `enforce_admins` applies to you immediately.** After todo 2, this
  plan's own remaining commits must go through a PR like everything else. Open
  the PR before running todo 2 if that is simpler.

## Sanctioned escape hatch

None. This plan adds no allowlist. If you believe one is needed, STOP and report.

## Required findings report

1. Gate result (`passed/total`, skipped noted) — must be identical to before
2. Output of both verification commands in todo 2
3. Any file changed outside the blast radius, even if justified
4. Any suspected pre-existing regression discovered but NOT fixed

---

## Compliance Manifest

### `writing-executable-plans.mdc`

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim above; todo 4 pins the expected gate numbers exactly |
| List sampling designed against | Todo 1 enumerates **all 5** requirements as a counted, exhaustive list |
| Quantifier erosion designed against | Verification commands assert exact values (`version!==2`, `length!==2`, `["PR Gate"]`) rather than presence |
| Sanctioned escape hatch | Explicitly none; adding one requires stopping |
| Bounded blast radius | Two-file table with an explicit do-not-touch list |
| File-specific pitfall notes | Commitlint prefix trap; empty `ignore`; enforcement applying to the executor mid-plan |
| Exact paths, no improvisation | Both files named in full |
| Per-todo verification | Each todo names its command |
| Snapshot policy inline | `N/A — no snapshots` |
| Preconditions for conditional UI | `N/A — no UI` |
| Structural floor under snapshots | `N/A — no snapshots` |
| IPC contract pinning | `N/A — no IPC touched` |
| Manual verification steps | `N/A — no user-facing change; the gate being unchanged is the check` |
| Required findings report | Four-item report specified above |

### `testing-standards.mdc` — all 10 items

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | `N/A — config-only; no behavior to test. Todo 4 asserts the suite is unchanged.` |
| 2 | Behavior-change test edits | `N/A — no test modified` |
| 3 | No weakened assertions | Clause verbatim; todo 4 pins exact expected counts |
| 4 | Coverage floor | `N/A — no new functions` |
| 5 | Lint floor | `N/A — no test files added` |
| 6 | Snapshot discipline | `N/A — no snapshots` |
| 7 | Completion gate | Todo 4 runs `npm run gate` and reports passed/total |
| 8 | Vitest/jsdom mechanics | `N/A — no tests added` |
| 9 | Test placement | `N/A — no tests added` |
| 10 | Characterization before refactor | `N/A — nothing refactored` |
