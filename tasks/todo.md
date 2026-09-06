# Phase 6 — Engineering System (porting the MotionWorship Builder model)

Goal: give PresenterPro the same engineering system that works in
`Motion-Worship/builder` — enforceable AI governance, TDD, a completion gate,
CI/CD, and branch discipline — then use that system to audit and repair the
existing 18.9k lines.

Reference repo (read-only): `/Users/ethansmith/Desktop/ClaudeAccess/builder`

---

## Current state (measured, not assumed)

| Area | ProPresV2 today | MW Builder |
|---|---|---|
| Tests | 0 files, no runner | Jest + Playwright, thousands of assertions |
| CI/CD | no `.github/` at all | 4 workflows + `pr-gate` aggregator |
| Lint / format | none | ESLint 9 flat + Prettier + `eslint-plugin-jest` floor |
| AI governance | 7-line `CLAUDE.md` | `AGENTS.md` + `AI_OPERATING_MANUAL.md` + 6 MDCs |
| Branching | ad-hoc `codex/*`, direct to `main` | `staging` → `main`, protected, documented |
| Type safety | plain JSX, none | TypeScript + `type-check` gate |
| Node pinning | none (`v20.20.0` local) | `engines` + `.nvmrc` |
| Release | manual local `electron-builder` | scripted, environment-gated |

**Biggest files** (refactor candidates, all untested):
`Toolbar.jsx` 1634 · `Canvas.jsx` 1542 · `electron/main/index.js` 1364 ·
`SongEditorModal.jsx` 1275 · `Home.jsx` 1221 · `Filmstrip.jsx` 1188

**Repo weight:** `.git` is 49M — test-media videos are committed as raw blobs
(one 39MB `.mp4`). Needs a decision (Phase 6B item).

---

## Translation decisions (what changes vs. MW Builder, and why)

- **Vitest, not Jest.** MW uses Jest + ts-jest. This app is `electron-vite`, so
  Vitest reuses the existing Vite config, aliases, and JSX transform with no
  second toolchain. The *policy* (TDD, never-weaken, snapshot triage, completion
  gate) ports verbatim; only the runner name changes.
- **`eslint-plugin-vitest`, not `eslint-plugin-jest`** — same 4-rule test floor
  (`no-focused-tests`, `no-disabled-tests`, `expect-expect`, `no-conditional-expect`).
- **Playwright `_electron`** for E2E instead of browser projects.
- **No Turbo.** Single package; `npm run gate` replaces `turbo run test:unit --force`.
- **Prettier config copied byte-for-byte** from MW so both repos format identically.

---

## Checklist

### Phase 6A — Governance layer (no code changes)
- [x] 1. Add `AGENTS.md` at repo root, adapted from MW: roles, architect-only
      boundaries, never-accept-a-regression rule, error-handling rules
- [x] 2. Add `AI_OPERATING_MANUAL.md`: Planner/Executor/Reviewer workflow,
      the three core prompts, Self-Review gate, non-negotiables
- [x] 3. Add `.cursor/rules/testing-standards.mdc` — TDD policy, completion gate,
      snapshot triage, test placement table, plan-compliance checklist
- [x] 4. Add `.cursor/rules/writing-tests.mdc` — Vitest skeletons for this app
      (store test, pure-util test, component test, Electron IPC test, snapshot)
- [x] 5. Add `.cursor/rules/writing-executable-plans.mdc` — the three failure
      modes + Compliance Manifest requirement (near-verbatim port)
- [x] 6. Rewrite `CLAUDE.md` to defer to the above instead of restating rules
      *Verify: every rule file cross-links and none contradicts another*

### Phase 6B — Tooling floor
- [ ] 7. Add `.nvmrc` (20), `engines` field, `.editorconfig`
- [ ] 8. Add `.prettierrc` + `.prettierignore` (copied from MW), run once across
      `src/` + `electron/` as a single formatting-only commit
- [ ] 9. Add ESLint 9 flat config + `eslint-jest-rules.mjs` equivalent
      (`eslint-vitest-rules.mjs`); wire `npm run lint`
- [ ] 10. Stop tracking media blobs going forward: add `test-media/` to
      `.gitignore` and `git rm --cached` the tracked videos. History is
      deliberately left intact (decision 2).
      *Verify: `npm run lint` exits 0; `git status` clean after format commit*

### Phase 6C — Test harness + first tests
- [ ] 11. Add Vitest + `@testing-library/react` + `jsdom`; `vitest.config.js`
      sharing the electron-vite aliases
- [ ] 12. Add `npm run test:unit`, `test:watch`, `test:coverage`, and the
      completion gate `npm run gate`
- [ ] 13. Write the first real tests against pure utils (highest value, zero
      mocking): `slideParser`, `songSections`, `backgrounds`, `textBoxes`,
      `presentationSizing`, `sectionTypes`
- [ ] 14. Add store tests for `editorStore` and `presenterStore`
- [ ] 15. Set a coverage floor that ratchets up, starting at whatever step 13–14
      actually achieves (no aspirational number)
      *Verify: `npm run gate` green, reports passed/total*

### Phase 6D — CI/CD
- [ ] 16. Add `.github/workflows/pr-checks.yml` — lint + test + build, with the
      `pr-gate` aggregator job pattern so branch protection points at one check
- [ ] 17. Add `.github/workflows/build-release.yml` — mac + windows matrix
      `electron-builder`, artifacts uploaded, triggered on tag
- [ ] 18. Add `.github/pull_request_template.md` requiring the Self-Review Report
- [ ] 19. Add `.github/BRANCHING.md` adapted to this repo (no AWS accounts)
      *Verify: open a throwaway PR and confirm `PR Gate` reports*

### Phase 6E — Branch + commit discipline
- [ ] 20. Document the `main` + short-lived-branch model (decision 3). No
      `staging` branch — releases are cut from tags, not a promotion branch.
- [ ] 21. Enable branch protection on `main` (PR required, `PR Gate` required,
      no force push) via `gh api`
- [ ] 22. Adopt Conventional Commits + naming: `feature/*`, `fix/*`, `chore/*`,
      `hotfix/*`; document in `BRANCHING.md`
- [ ] 23. Add Husky + lint-staged pre-commit (format + lint changed files) and
      commit-msg hook validating Conventional Commits
- [ ] 24. Clean up the two stale `codex/*` branches
      *Verify: direct push to `main` is rejected*

### Phase 6F — Audit (read-only pass, produces the Phase 7 backlog)
- [ ] 25. Dead-code sweep: unreferenced exports, unused deps, commented-out
      blocks (e.g. the disabled `presenterWindow` code in `electron/main`)
- [ ] 26. Resolve the known `/fonts/Inter-Variable.woff2` build warning
- [ ] 27. Audit the 5 pending items already listed in `CLAUDE.md`
- [ ] 28. Triage the uncommitted `Toolbar.jsx` / `Home.jsx` work in progress —
      keep, finish, or revert
- [ ] 29. Write findings to `tasks/phase7-remediation.md` as a prioritized,
      counted backlog (no fixes in this phase)

### Phase 6G — Remediation (executed under the new system)
- [ ] 30. Work `phase7-remediation.md` top-down: each item gets a failing test
      first, then the fix, then the gate
- [ ] 31. Decompose the 6 oversized files behind characterization tests written
      *before* any extraction

---

## Resolved decisions (confirmed by Ethan, 2026-09-05)

1. **Types — hybrid.** `checkJs` + JSDoc over the existing `.js`/`.jsx` files
   *now*, and every **new** file is written in TypeScript. Vite compiles
   `.ts`/`.tsx` alongside `.jsx` with no extra config, so the two mix freely.
   This gives a real `type-check` gate immediately without a big-bang rewrite,
   and the codebase converts organically as 6G touches each file. IPC contracts
   in `electron/main` get typed first — that seam is where untyped payloads have
   caused the most bugs.
2. **Media blobs — gitignore going forward.** History stays untouched; no SHA
   rewrite, no force-push. `.git` stays 49M, which is harmless for a solo repo.
3. **Branching — `main` + feature branches + tags.** Protected `main`;
   short-lived `feature/*`, `fix/*`, `chore/*`, `hotfix/*`; releases cut from
   version tags that trigger the mac/win build workflow.
   **Solo adjustment:** protection requires a PR and a passing `PR Gate`, but
   **not** an approving review — required approvals would lock Ethan out of his
   own repo.
4. **Ordering confirmed.** 6A–6E build the system; 6F–6G do the audit and repair.
   6F cannot start before 6C exists — refactoring 18.9k untested lines without a
   harness is the original problem at a larger scale.

Working branch: `chore/engineering-system`

---

## Review

_(to be filled in when the checklist is complete)_
