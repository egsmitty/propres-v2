# Branching Strategy

PresenterPro is a **local-first desktop app with a single maintainer**. There is
no server and no staging environment, so it uses a trunk-based model: a
protected `main`, short-lived branches, and releases cut from version tags.

> This differs deliberately from `Motion-Worship/builder`, which uses
> `staging` → `main` because it promotes between two AWS accounts. There is
> nothing to promote here — a release is an artifact, not a deployment.

## Branch structure

```
main ──────────────────────────────────►  protected, always releasable
  ├── feature/floating-toolbar               short-lived, PR into main
  ├── fix/media-slide-background
  ├── chore/engineering-system
  └── hotfix/output-window-crash
        │
        └── tag v1.1.0 ──► Build Release workflow ──► draft GitHub Release
```

## Naming convention

| Prefix | Use for | Example |
|---|---|---|
| `feature/` | New user-facing capability | `feature/countdown-overlay` |
| `fix/` | Bug fix | `fix/toolbar-insert-media` |
| `chore/` | Tooling, CI, docs, dependencies | `chore/bump-electron-29` |
| `refactor/` | Restructuring with no behavior change | `refactor/split-canvas` |
| `hotfix/` | Urgent fix on top of a release | `hotfix/stage-display-crash` |

Use lowercase and hyphens. Keep branches short-lived — a branch open longer than
a few days is a sign the task should have been split.

## Commit convention

[Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <description>

<optional body>
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`, `perf`,
`build`, `ci`, `revert`.

```bash
git commit -m "fix(toolbar): import importMediaToSelectedSlide"
git commit -m "feat(presenter): add stage display countdown"
```

The commit type drives the version bump when cutting a release: `fix` → patch,
`feat` → minor, a `!` suffix or `BREAKING CHANGE:` footer → major.

## Workflow

### 1. Start work

```bash
git checkout main
git pull origin main
git checkout -b feature/your-feature
```

### 2. Work the plan

Write the plan to `tasks/todo.md` first and confirm it (see `CLAUDE.md`). Run
the gate before you consider anything done:

```bash
cd presenter-pro
npm run gate      # type-check → lint → vitest
npm run dev       # and verify in a real window
```

### 3. Open a PR

```bash
git push -u origin feature/your-feature
gh pr create --fill
```

The PR template requires a **Self-Review Report** and a record of manual
verification in a running window. `PR Gate` must be green before merge.

### 4. Merge

Squash-merge into `main`. The branch is deleted on merge.

## Branch protection on `main`

Configured rules:

- ✅ Require a pull request before merging
- ✅ Require status check `PR Gate` to pass
- ✅ Require branches to be up to date before merging
- ✅ Block force pushes
- ✅ Block deletions
- ❌ Require approving reviews — **intentionally off**

> Required approvals are disabled because this is a single-maintainer repo:
> GitHub will not let you approve your own PR, so requiring one approval would
> make every PR unmergeable. The `PR Gate` status check is what actually
> enforces quality here. **Turn approvals on the moment a second person joins.**

## Releases

Releases are cut from tags, and the tag is what triggers packaging:

```bash
# from an up-to-date main, with a green gate
npm version minor --workspace presenter-pro   # or patch / major
git push origin main --follow-tags
```

Pushing a `v*` tag runs `.github/workflows/build-release.yml`, which:

1. re-runs the completion gate (a release is never cut from failing code),
2. packages macOS (`dmg`, `zip`) and Windows (`nsis`, `zip`) in parallel,
3. attaches the artifacts to a **draft** GitHub Release for you to publish.

Builds are unsigned. macOS needs right-click → Open on first launch; Windows
SmartScreen needs More info → Run anyway.

## Emergency hotfix

```bash
git checkout main && git pull
git checkout -b hotfix/critical-bug
# fix + test, then:
gh pr create --fill
# after PR Gate passes and you merge:
npm version patch --workspace presenter-pro
git push origin main --follow-tags
```

Even for a hotfix, go through the PR. The gate takes a few minutes; shipping a
broken build to a church on a Sunday morning costs considerably more.

## Common situations

**"I committed straight to main."**
Protection will reject the push. Move the work onto a branch:

```bash
git branch feature/my-work
git reset --hard origin/main
git checkout feature/my-work
```

**"CI fails but it works locally."**
Check Node version first (`.nvmrc` pins 20). The `gate` job installs with
`--ignore-scripts`, so anything depending on a native `better-sqlite3` rebuild
belongs in an E2E test, not a unit test.

**"I need to fix legacy lint errors."**
They are suppressed in `eslint-suppressions.json`, not disabled. After fixing
some, shrink the baseline:

```bash
npx eslint . --prune-suppressions
```
