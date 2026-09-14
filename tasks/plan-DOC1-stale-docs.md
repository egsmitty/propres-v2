# Executable Plan DOC1 — stale docs sweep

**Source:** repo audit item DOC1, all 8 sub-items exhaustive (CLAUDE.md,
AGENTS.md, `.github/BRANCHING.md`, README.md, root `HANDOFF.md`,
`.github/pull_request_template.md` (DOCS-39), `writing-executable-plans.mdc`
(D8), `tasks/todo.md`).

Written per `.cursor/rules/writing-executable-plans.mdc`, modeled on
`tasks/plan-R22-worktree-hooks.md`.

Docs-only change. No source or test files are touched.

---

## Measured (2026-09-13, `main` @ `ab65e2d`)

**Stack / versions**

- `presenter-pro/package.json`: `"electron": "^44.2.0"`, `"react": "^19.2.8"`,
  `"react-dom": "^19.2.8"`, `"zustand": "^5.0.15"`, `"tailwindcss": "^4.3.3"`.
- `.nvmrc` (repo root): `22`.
- `presenter-pro/tsconfig.json:26`: `"checkJs": false`, with a comment
  (lines 4–17) explaining the ratchet: new files are `.ts`/`.tsx` and fully
  checked; an existing `.js`/`.jsx` file opts in per-file via `// @ts-check`.

**CLAUDE.md**

- `CLAUDE.md:45`: `**Stack:** Electron 29 + React 18 + Zustand + Tailwind...` —
  stale; package.json majors are 44 / 19 / 5 / 4.
- `CLAUDE.md:63`: `...presenter panel moved to an in-editor right sidebar
  (300px, collapsible)...` — `presenter-pro/src/store/presenterStore.js:4,19`:
  `PRESENTER_PANEL_MIN_WIDTH = 240`, default width `320` (both the SSR fallback
  at line 13 and the invalid-saved-value fallback at line 19). Also already
  flagged in `tasks/fable-notes.md` ("Found and not fixed: CLAUDE.md says the
  presenter panel is 300px. It is 320 default, 240 minimum.").
- `CLAUDE.md:97`: `Start a fresh session from \`tasks/HANDOFF-2026-09-09.md\`.`
  — only `tasks/HANDOFF-2026-09-09.md` is tracked; newer handoffs
  (e.g. `tasks/HANDOFF-2026-09-11.md`, referenced in the user's own memory
  notes) are local/untracked by design and do not exist in a fresh checkout of
  this worktree. The same section also omits that F1 and G1–G3 have landed
  since 2026-09-09: `tasks/fable-pass-plan.md:256` records "F1 pure-helper
  characterization (opens workstream F)" as done, and rows for G1, G2, G3 are
  also `done`. `tasks/fable-pass-plan.md:157` still labels workstream F
  "_(blocked — see Sequencing)_", but F1 was the named gate
  (`tasks/fable-pass-plan.md:194-197`), so that gate has been cleared even
  though the file's own workstream heading has not been edited to say so.
- `CLAUDE.md:21` and `:31`: both instruct writing the plan / review to
  `tasks/todo.md`. Actual practice (`tasks/plan-R22-worktree-hooks.md`,
  `tasks/plan-G3-song-editor.md`, this very plan) is one file per piece of
  work, `tasks/plan-<id>-<name>.md`.

**AGENTS.md**

- `AGENTS.md:40`: `**Renderer:** React 18 + Zustand + Tailwind...` — stale,
  same as above.
- `AGENTS.md:50`: `Existing \`.js\` / \`.jsx\` files are type-checked via
  \`checkJs\` + JSDoc.` — false. `checkJs` is `false` project-wide
  (`tsconfig.json:26`); a file is checked only after opting in with
  `// @ts-check` (`tsconfig.json:10-12`).

**.github/BRANCHING.md**

- `:165`: `Check Node version first (\`.nvmrc\` pins 20).` — `.nvmrc` is `22`.
- `:97`: `✅ Require status check \`PR Gate\` to pass` (and the surrounding
  list) names only one check.
  `gh api repos/egsmitty/propres-v2/branches/main/protection --jq
  '.required_status_checks.contexts'` → `["PR Gate","E2E (macOS)"]`. Confirmed
  independently in `.github/workflows/e2e.yml:9-11`: "A REQUIRED check on main
  since 2026-09-08 (branch protection lists 'E2E (macOS)' next to 'PR Gate')."
- `:69`: `Write the plan to \`tasks/todo.md\` first...` — same stale
  convention as CLAUDE.md.
- `:125`: `npm version minor --workspace presenter-pro   # or patch / major`
  and `:146`: `npm version patch --workspace presenter-pro` — there is no root
  `package.json` (`ls package.json` at repo root: no such file) and no npm
  workspaces, so `--workspace presenter-pro` cannot resolve; both commands
  fail as written. `.github/workflows/build-release.yml:5-6,10`: triggers
  `on: push: tags: ['v*']`, confirming the working replacement (bump inside
  `presenter-pro/`, tag and push separately) still drives the same workflow.

**README.md**

- `:89`: `...the **PR Gate** check (gate + macOS and Windows builds) must
  pass...` — omits the second required check, `E2E (macOS)` (same
  branch-protection measurement as above).
- `:55`: `\`tsc --noEmit\` over the whole project (JS is type-checked too)` —
  false, same `checkJs: false` finding as AGENTS.md.
- `:74`: describes crash recovery as active journaling on every edit
  (`"unsaved presentation edits are journaled a couple of seconds after each
  change"`). Per `CLAUDE.md`'s own "Save model (plan A5)" section: "The
  crash-recovery journal from plan A2 is no longer written: autosave bumps
  `updated_at`, which would make every journal row stale before it was read.
  Its table and startup drain remain for profiles written by older builds."
- `:19`: `| \`test-media/\` | Sample images and video used by the app and the
  E2E suite |` — `.gitignore:16-18` shows `test-media/` is gitignored (with a
  comment: "tracked history is left intact, but new media is not versioned");
  `git ls-files test-media` returns 0 files, and the directory does not exist
  in this fresh worktree checkout. It genuinely is read at runtime
  (`presenter-pro/electron/main/index.js:291-298`,
  `resolveBuiltInMediaAssetPath`) and bundled by
  `presenter-pro/package.json:53-56` (`build.extraResources`, `"from":
  "../test-media"`), so "used by the app" is true — but the table omits that
  it is gitignored and absent from a fresh clone.
- `:51` (coverage-threshold claim) — measured and left untouched per
  instruction; a parallel PR is making it true.

**Root `HANDOFF.md`**

- Dated 2026-09-06, gives the project location as
  `~/Desktop/ClaudeAccess/ProPresV2` — the iCloud path the repo was moved out
  of. `grep -rln "HANDOFF\.md" --include="*.md" .` (excluding
  `tasks/HANDOFF-*.md` matches) finds no other file linking to it.

**`.github/pull_request_template.md` (DOCS-39)**

- Current template's headings ("What changed", "Self-Review Report", "Manual
  verification", "Checklist") appear in none of the last 5 merged PRs (#115,
  #114, #113, #112, #111 range checked via `gh pr list --state merged --limit
  5`). PR #115 and #114 both instead use `## Summary` / `## Proof` /
  `## Findings` / `## Records`.

**`.cursor/rules/writing-executable-plans.mdc` (D8)**

- No existing bullet in "Patterns that work" or the "Reviewer checklist"
  requires a data-rewriting plan to name its backup/rollback mechanism.
  `presenter-pro/electron/db/migrationRunner.ts:41`: `export const
  BACKUP_FILE_PATTERN = /^presenterpro\.backup-v(\d+)-(\d{8}T\d{6}Z)\.db$/;`
  and lines 96-100 describe the `VACUUM INTO` backup written before any
  migration applies.

**`tasks/todo.md`**

- Dated 2026-09-06 (Phase 6), cites `~/Desktop/ClaudeAccess/builder` as a
  reference repo (line 7) — a fossil of the pre-move layout. Files linking to
  it (`grep -rln "tasks/todo\.md"`, all extensions):
  `AI_OPERATING_MANUAL.md:152`, `.gitignore:17`, `CLAUDE.md` (fixed by DOC1-1),
  `HANDOFF.md` (deleted by DOC1-5), `.github/BRANCHING.md` (fixed by DOC1-3).

## Decisions

1. **Majors only, no re-derivable minor versions.** Stack lines name Electron
   44 / React 19 / Zustand 5 / Tailwind 4 — majors, matching the instruction to
   prefer wording that will not go stale over hard-coded minors.
2. **CLAUDE.md `In Progress` gets a general rule, not a specific filename.**
   Point at "the newest `tasks/HANDOFF-*.md` on disk," falling back to the
   tracked `tasks/HANDOFF-2026-09-09.md`, since newer handoffs are local and
   untracked by the owner's own choice (per the user's memory notes) and this
   worktree cannot see them.
3. **`AI_OPERATING_MANUAL.md:152` is left untouched.** It is explicitly
   out-of-scope governance philosophy per the task brief, and its
   `tasks/todo.md` mention reads as a generic placeholder for "the current
   plan file," not a citation of the Phase 6 fossil specifically. Recorded as
   a finding in the PR body instead of edited.
4. **`.gitignore:17`'s comment is fixed alongside the `git mv`.** It is a
   direct, two-word, mechanical consequence of moving `tasks/todo.md` to
   `tasks/phase6-todo.md` — the same class of fix item 8 already requires for
   every other `.md` reference, just in a non-`.md` file the grep also caught.
5. **REL-18 replacement sequence is two PRs, not one.** The version bump
   commit must go through the same protected-branch PR flow as everything
   else (`BRANCHING.md`'s own rule), so the documented sequence bumps
   `package.json`/`package-lock.json` in a small PR, merges it, then tags the
   merge commit — it does not tag from a feature branch.
6. **PR template (DOCS-39) is replaced, not amended.** The Self-Review-Report
   template documents a process no recent PR follows; the observed
   Summary/Proof/Findings/Records shape (matching the "Records" instruction in
   this very task) becomes the new template.
7. **D8 bullet cites the exact export name** (`BACKUP_FILE_PATTERN`) and the
   `VACUUM INTO` mechanism so a future plan author can grep for it rather than
   re-deriving it.

**Anti-weakening clause (verbatim):** *If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression.*

(No test assertions exist in this docs-only plan; the clause is carried here
because `writing-executable-plans.mdc` requires it verbatim in every plan, not
because a comparison in this plan's own todos evaluates it — see Compliance
Manifest.)

## Blast radius

May change: `CLAUDE.md`, `AGENTS.md`, `.github/BRANCHING.md`, `README.md`,
`.github/pull_request_template.md`, `.cursor/rules/writing-executable-plans.mdc`,
`.gitignore` (one comment line only), this plan file, `tasks/fable-pass-plan.md`
(status table row), `tasks/fable-notes.md` (new dated section). `git rm
HANDOFF.md`. `git mv tasks/todo.md tasks/phase6-todo.md`.

**May not** change: any file under `presenter-pro/src/`, `presenter-pro/electron/`,
`presenter-pro/e2e/`, any `*.test.*` file, `AI_OPERATING_MANUAL.md`, or any
other `.cursor/rules/*.mdc` file besides `writing-executable-plans.mdc`.

## Todos

- [x] 1. **CLAUDE.md** — fix stack line (`:45`), sidebar width (`:63`), the
  `In Progress` handoff pointer + F1/G1–G3 status (`:97` area), and Workflow
  steps 1 and 7 (`:21`, `:31`) to the `tasks/plan-<id>-<name>.md` convention.
  Verify: `grep -n "Electron 29\|300px\|HANDOFF-2026-09-09\.md\`\.\|tasks/todo\.md" CLAUDE.md` returns nothing.
- [x] 2. **AGENTS.md** — fix stack line (`:40`) and the `checkJs` + JSDoc claim
  (`:50`) to describe the real `// @ts-check` opt-in ratchet.
  Verify: `grep -n "React 18\|checkJs\` + JSDoc" AGENTS.md` returns nothing.
- [x] 3. **.github/BRANCHING.md** — fix Node version claim (`:165`), the
  required-checks list (`:97` area), the `tasks/todo.md` plan pointer (`:69`),
  and both release command blocks (`:125`, `:146`) per REL-18's working
  sequence.
  Verify: `grep -n "pins 20\|--workspace presenter-pro\|Require status check \`PR Gate\` to pass$" .github/BRANCHING.md` returns nothing.
- [x] 4. **README.md** — add `E2E (macOS)` to the required-checks line (`:89`),
  fix the `JS is type-checked too` claim (`:55`), rewrite the crash-recovery
  paragraph (`:74`) to match the Save model (plan A5), and describe
  `test-media/` accurately (`:19`). Leave `:51` (coverage claim) untouched.
  Verify: `grep -n "JS is type-checked too\|journaled a couple of seconds after each change\." README.md` returns nothing; `:51` line unchanged (`git diff README.md` shows no hunk touching it).
- [x] 5. **Root HANDOFF.md** — `git rm HANDOFF.md`. Confirmed via Measured: no
  other file links to it.
- [x] 6. **DOCS-39** — replace `.github/pull_request_template.md` with the
  Summary/Proof/Findings/Records shape, kept short.
- [x] 7. **D8** — add the backup/rollback bullet to "Patterns that work" and a
  matching line to the "Reviewer checklist" in
  `.cursor/rules/writing-executable-plans.mdc`, naming
  `BACKUP_FILE_PATTERN` / `VACUUM INTO` from `migrationRunner.ts`.
  Verify: `grep -n "BACKUP_FILE_PATTERN\|VACUUM INTO" .cursor/rules/writing-executable-plans.mdc` shows one hit in each of the two sections (2 total).
- [x] 8. **tasks/todo.md** — `git mv tasks/todo.md tasks/phase6-todo.md`; fix
  the `.gitignore:17` comment link (Decision 4). Leave
  `AI_OPERATING_MANUAL.md:152` per Decision 3.
  Verify: `grep -rln "tasks/todo\.md" . --exclude-dir=node_modules --exclude-dir=.git` returns only `AI_OPERATING_MANUAL.md`.
- [x] 9. **Records** — append one row to the status table at the end of
  `tasks/fable-pass-plan.md` and a `## DOC1 — <plain title> (2026-09-13)`
  section at the end of `tasks/fable-notes.md`.
- [x] 10. `cd presenter-pro && npm run gate && npm run format:check`. Report
  `gate: type-check ✓ · lint ✓ · vitest N/N passed (0 skipped)`. This is a
  docs-only change, so the gate is expected to be a no-op proof of
  non-interference, not new coverage.
- [x] 11. Findings report in the PR body (Summary / Proof / Findings, per the
  new template this plan just introduced), plus the commit recipe from the
  task brief.

Comparisons in this plan are prose-fact corrections, not code assertions:
each Todo's "Verify" grep is exact-match (a hit means the stale text is still
present, i.e. failure) — order and count are not applicable since every target
is a single stale phrase per file.

## Compliance Manifest

### writing-executable-plans.mdc (this rule)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | N/A — no test assertions in a docs-only plan; anti-weakening clause carried verbatim above per rule requirement |
| List sampling designed against | The 8 items and their sub-parts are itemized as Todos 1–8, each naming every stale line found in Measured — no prose enumeration |
| Quantifier erosion designed against | N/A — no "every X" runtime claim; each Todo names exact `file:line` targets from Measured |
| Sanctioned escape hatch | N/A — no allowlist; nothing to exempt |
| Bounded blast radius | "Blast radius" section |
| File-specific pitfall notes | Measured section: AI_OPERATING_MANUAL.md exception (Decision 3), REL-18 two-PR sequence (Decision 5), `.gitignore` comment (Decision 4) |
| Exact paths | Blast radius lists every file; Todos cite exact line numbers |
| Per-todo verification | Todos 1–9 each name a `grep` command; Todo 10 names the gate command |
| Snapshot policy inline | N/A — no snapshots, docs-only |
| Preconditions for conditional UI | N/A — no UI change |
| Structural floor under snapshots | N/A — no snapshots |
| IPC contract pinning | N/A — no IPC channel touched |
| Manual verification steps | N/A — no user-facing runtime behavior changed; gate + `format:check` is the applicable proof (Todo 10) |
| Required findings report | Todo 11 |

### testing-standards.mdc (10 items)

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | N/A — docs-only plan, no new behavior to test |
| 2 | Behavior-change test edits | N/A — no test file touched |
| 3 | No weakened assertions | N/A — no test assertions; anti-weakening clause still carried verbatim above per rule |
| 4 | Coverage floor | N/A — no new function or edge case; nothing to cover |
| 5 | Lint floor | N/A — no test file touched |
| 6 | Snapshot discipline | N/A — no snapshots |
| 7 | Completion gate | Todo 10 |
| 8 | Vitest / jsdom mechanics | N/A — no test file touched |
| 9 | Test placement | N/A — no test file added or moved |
| 10 | Characterization before refactor | N/A — no source file restructured; this is a documentation correction, not a refactor |

## Review

All 8 items fixed, verified against code before writing (package.json majors,
`.nvmrc`, `presenterStore.js`, `tsconfig.json`, `gh api` branch protection,
`.gitignore`, `migrationRunner.ts`, `build-release.yml`, the last 5 merged
PRs). Docs-only: no file under `presenter-pro/src/`, `presenter-pro/electron/`,
or `presenter-pro/e2e/` changed. One deliberate exception:
`AI_OPERATING_MANUAL.md:152`'s `tasks/todo.md` mention was left alone (out of
scope per the task brief) even though the rename made it stale — flagged in
`tasks/fable-notes.md` and the PR body instead.
