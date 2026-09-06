# What changed

<!-- One or two sentences. What does this PR do, and why? -->

Closes #

---

## Self-Review Report

<!--
Required by AI_OPERATING_MANUAL.md §3.2. Run the review in a FRESH context —
the reviewer must not be the same pass that wrote the code. Delete a section
only if it is genuinely inapplicable, and say why.
-->

**1. Manifest Audit** — every item in the plan's Compliance Manifest checked;
no blanks, no unjustified `N/A`.

**2. Scope Integrity** — the diff stays inside the plan's file list.

<!-- Any file changed that was not in the plan? Name it, even if justified. -->

**3. Assertion Integrity** — no weakened comparisons, deleted assertions, or
loosened checks.

<!-- Searched for .sort() on both sides, set-compares, toContain where toEqual
     was meant. -->

**4. Escape Hatches** — every allowlist entry has a justifying comment.

**5. Snapshots** — every refreshed snapshot has a stated cause
("my edit to X changed Y, which renders as Z"). No blanket `vitest -u`.

**6. Gate Results** — re-run by the reviewer, not copied from the author:

```
gate: type-check ✓ · lint ✓ · vitest __/__ passed (_ skipped)
```

**7. IPC Surface** — did this change any `ipcMain` / `ipcRenderer` channel or
payload shape? If yes, name the channel and the test that pins the new shape.

**8. Verdict** — PASS / FAIL, plus the top issues the architect must check
locally.

---

## Manual verification

<!--
A green gate is necessary but NOT sufficient for a desktop app. List the exact
click-path verified in a running window (`npm run dev`). Note the display setup
if output assignment is involved.
-->

- [ ] Verified in a running app window
- [ ] Multi-display behavior checked (or `N/A` — no output/display change)

Steps performed:

1.

---

## Checklist

- [ ] Tests were written **before** the implementation (TDD) for new behavior
- [ ] Any modified existing test changed because the behavior intentionally
      changed — it fails under the old code and passes under the new
- [ ] No regression accepted to make the gate green
- [ ] `eslint-suppressions.json` was not grown (run
      `npx eslint . --prune-suppressions` if you fixed legacy violations)
- [ ] Coverage thresholds in `vitest.config.mjs` raised if coverage improved
- [ ] Commit messages follow Conventional Commits
