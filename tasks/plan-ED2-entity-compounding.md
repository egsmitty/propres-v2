# Executable Plan ED2 — `&` no longer turns into `&amp;amp;` after every edit

**Source:** `tasks/fable-pass-2-audit.md` (local, untracked), Wave 2 plan **D4**,
item **ED-1** (P0) — the **narrow fix only**, which the audit tags [O]. Its
"one storage format" half changes how slide text is stored and touches every
version snapshot, so the audit tags it [F] with D8's backup/rollback rule; it
is not in this plan. (The ID is ED2 because ED1 is plan-ED1-editor-small-fixes.)

Written per `.cursor/rules/writing-executable-plans.mdc`. Branch base `main` @
`e24a2f8`.

---

## Measured

| Code | What happened |
|---|---|
| `SlideTextEditor.jsx` `saveCurrentValue` / `handleInput` | Saves `normalizeEditorHtml(ref.current.innerHTML)` — only `&nbsp;` is touched. Typing "Praise & Worship" stores `Praise &amp; Worship`: entities, no tags. |
| `SlideTextEditor.jsx` seeding effect | Re-seeds the editor with `slideBodyToHtml(body)`. |
| `slideMarkup.js` `slideBodyToHtml` | A body with no tags goes through `escapeHtml`, so `Praise &amp; Worship` becomes `Praise &amp;amp; Worship` — shown as "Praise &amp; Worship" — and the next save stores that. Reproduced in jsdom over three cycles: `Praise &amp;amp;amp; Worship`. |
| `slideMarkup.js` `slideBodyToPlainText` | Strips tags, never decodes: the stage display (`StageDisplayRenderer.jsx`) shows `&amp;` literally. |
| Callers | `Canvas.jsx`, `SlideTextEditor.jsx`, `Toolbar.jsx` (incl. `slideBodyToHtml(slideBodyToPlainText(…))` round trips), `ScaledSlideText.jsx` (thumbnails, output), `StageDisplayRenderer.jsx`. |
| Tests | No `slideMarkup` test existed; no unit test anywhere asserts `&amp;` / `&lt;` / `&gt;` text; no E2E fixture body contains an entity or an ampersand, so no visual baseline can change. |

## Decisions

1. **Decode once, then escape, for tagless bodies.** A tagless body is either raw
   text (seeds, imports: "Rock & Roll") or editor innerHTML ("Praise &amp;
   Worship"); `escapeHtml(decodeEntities(value))` renders both correctly and is
   idempotent across save cycles. Tag detection still runs on the raw value, so
   typed "<b>" (stored `&lt;b&gt;`) stays text.
2. **`decodeEntities` is a single pass** over `&amp; &lt; &gt; &quot; &apos;`,
   decimal and hex numeric entities. `&amp;amp;` becomes `&amp;`, never `&`, so a
   body whose text genuinely is "&amp;" keeps it; an entity for a code point that
   does not exist is left as written.
3. **`slideBodyToPlainText` decodes after stripping tags**, so a decoded `<b>` can
   never be removed as a tag.
4. **Bodies with real markup are unchanged** — the HTML branch is untouched.
5. **Not in this plan:** repairing rows that are already double-encoded (a stored
   `&amp;amp;` keeps showing one "&amp;" — it just stops growing); the single
   storage format ([F]); de-duplicating the two `normalizeEditorHtml` copies in
   `SlideTextEditor.jsx` and `Toolbar.jsx`.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

Comparisons: shown text and stored bodies compared exactly (`toBe` / `toEqual`);
"no markup" asserted by `querySelector('b')` being `null`.

## Blast radius

May create: `src/utils/__tests__/slideMarkup.test.ts`, this plan. May change:
`src/utils/slideMarkup.js` (`decodeEntities`, the tagless branch of
`slideBodyToHtml`, one step in `slideBodyToPlainText`), the charter row, the
notes entry. **May not** change any existing test, any caller, or any stored
data.

## Todos

- [x] 1. **Red** — `slideMarkup.test.ts`: 10 new cases, 8 fail on the old code on
  their assertions (three editor cycles, stable body, typed angle brackets,
  double-encoded body stops growing, and all four plain-text decodes). The two
  controls — a raw ampersand from seeded text, and a body with real markup —
  pass before and after.
- [x] 2. Implement Decisions 1–4.
- [x] 3. `slideMarkup.test.ts` green; the text-rendering suites
  (`ScaledSlideText`, `SlideTextEditor`, `richTextEditor`, `OutputRenderer`,
  `canvasTextStyle`) unchanged and green → 48 / 48 across six files.
- [x] 4. `npm run gate` → `gate: type-check ✓ · lint ✓ · vitest 647/647 passed`; `format:check` ✓.
- [ ] 5. Manual verification (owed to Ethan): type "Praise & Worship" in a slide,
  click away, click back in and out three times → the canvas, the filmstrip
  thumbnail and the output all read "Praise & Worship"; the Stage Display shows
  "&", not "&amp;"; type "a <b> c" → it shows as text, not bold.
- [ ] 6. Findings report in the PR body.

## Compliance Manifest

### writing-executable-plans.mdc (15 items)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; exact comparisons |
| List sampling designed against | Each entity form (named, decimal, hex) and each consumer path (HTML render, plain text) has a case |
| Quantifier erosion designed against | "every caller" = the five files found by `git grep slideBodyToHtml\|slideBodyToPlainText` (Measured); none changes |
| Sanctioned escape hatch | N/A — no allowlist |
| Bounded blast radius | Blast radius section |
| File-specific pitfall notes | Decision 2 (single pass — decoding repeatedly would turn a real "&amp;" into "&"); Decision 3 (decode after stripping tags) |
| Exact paths | Blast radius |
| Per-todo verification | Todos 1, 3, 4 |
| Snapshot policy inline | N/A — no snapshots; no E2E fixture contains an ampersand (Measured) |
| Preconditions for conditional UI | N/A — pure functions |
| Structural floor under snapshots | N/A — no snapshots |
| IPC contract pinning | N/A — no channel or payload changed |
| Manual verification steps | Todo 5 |
| Required findings report | Todo 6 |
| Data rewrites state their backup and rollback | N/A — no stored row is rewritten; already-corrupted rows are left as they are (Decision 5) |

### testing-standards.mdc (10 items)

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | Todo 1 red before Todo 2 |
| 2 | Behavior-change test edits | N/A — no existing test edited (none asserted entity text) |
| 3 | No weakened assertions | Clause verbatim; exact comparisons |
| 4 | Coverage floor | Both branches of `slideBodyToHtml`; every entity form and the invalid-code-point path of `decodeEntities` via plain text |
| 5 | Lint floor | No `.only`/`.skip`; every case asserts; no `expect` in `if`/`catch` |
| 6 | Snapshot discipline | N/A — no snapshots |
| 7 | Completion gate | Todo 4 |
| 8 | Vitest / jsdom mechanics | jsdom for the innerHTML round trip — the same seed/save the editor performs |
| 9 | Test placement | `src/utils/__tests__/` |
| 10 | Characterization before refactor | N/A — a bug fix; the two controls pin the unchanged paths |
