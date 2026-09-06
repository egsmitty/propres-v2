# Phase 8 — Architecture Audit

A systematic pass over PresenterPro for code that is *structurally* wrong, not
just buggy. Companion to `phase7-remediation.md` (which holds the flat list of
findings); this file defines **the goal, how to find things, and what a finding
must produce** before it counts as done.

---

## Goal

**Make whole categories of defect impossible, not just fix instances.**

The motivating example: PresenterPro cannot be quit with `Cmd+Q`. The cause is
not a typo — it is a **missing lifecycle contract**. There is no `before-quit`
listener, so the window `close` handler's `preventDefault()` silently cancels
every quit. Nobody wrote that listener because nothing required one to exist,
and nothing detected its absence for months.

Compare with what the Phase 6 lint pass did: it did not merely fix two
`ReferenceError` crashes, it made *"calling a function you forgot to import"*
mechanically impossible for the rest of the project's life. That is the bar.

So the pass is judged on **rules added**, not lines changed. If the audit ends
with 40 fixes and 0 new mechanical checks, it failed — the same defects will
regrow, exactly as `CLAUDE.md` claimed Insert Media worked for three phases
while it was throwing.

### Non-goals

- Rewriting working features because they are unfashionable.
- Style churn — Prettier already owns formatting.
- Restructuring anything that has no test under it (see **Ordering**).

---

## What every finding must produce

A finding is not done until it has all three. Record them in the finding's entry
in `phase7-remediation.md`.

| # | Artifact | Why |
|---|---|---|
| 1 | **The fix** | Root cause, never a symptom mask. Never delete a feature to go green. |
| 2 | **A failing test** | Written *first*. It must fail under the old code and pass under the new — state this explicitly in the PR. |
| 3 | **A mechanical rule** *(where the category allows)* | A lint rule, a type, a CI check, or a self-enforcing test that iterates a registry. This is what stops the category from regrowing. |

When #3 is genuinely impossible, say so in one line and explain why. "Hard" is
not "impossible" — an ESLint rule with a custom selector or a test that walks
`ipcMain` handler names is usually within reach.

### The escalation ladder for rule #3

Prefer the highest rung that works:

1. **Type** — make the bad state unrepresentable (typed IPC payloads).
2. **Lint rule** — `no-restricted-syntax` with an AST selector catches most
   structural mistakes without writing a plugin.
3. **Self-enforcing test** — iterate the real registry and assert coverage, so
   a new unhandled entry fails. Pattern already used in
   `sectionTypes.test.ts` and `editorStore.test.ts`.
4. **CI check** — a script in the gate.
5. **Documented convention** — the weakest rung. Prose degrades under
   execution; use it only when nothing above applies.

---

## How to find things

Detection technique per category. These are starting points, not an exhaustive
script — read what they surface rather than trusting counts.

### A. Process lifecycle and window management

The highest-risk area, and the least covered by any test.

```bash
# Every Electron lifecycle event this app does NOT listen for.
for e in before-quit will-quit window-all-closed activate second-instance \
         render-process-gone child-process-gone browser-window-created; do
  printf '%-22s %s\n' "$e" "$(grep -c "'$e'" electron/main/index.js)"
done

# Every preventDefault on a close/quit path — each one must have a guaranteed
# path back to actually closing.
grep -n "preventDefault" electron/main/index.js

# Flags that gate closing: find every set site and prove each can be reached
# and cleared.
grep -n "allowMainWindowClose\|appIsQuitting\|CloseRequestPending" electron/main/index.js
```

> **Verified 2026-09-05** — the command above returns:
> `before-quit 0` · `will-quit 0` · `second-instance 0` ·
> `render-process-gone 0` · `child-process-gone 0` · `window-all-closed 1` ·
> `activate 1`.
> The two zeros that matter most are `before-quit` (the direct cause of the
> unquittable app) and `render-process-gone` (a renderer crash currently leaves
> the close handshake permanently unresolvable).

**What to look for:** any boolean that gates `close` and can latch `true` with
no timeout; any `preventDefault()` whose resolution depends on a renderer reply
that may never arrive; windows created but never destroyed
(`outputWindow`, `stageDisplayWindow`).

**Rule to add:** a test that asserts every `preventDefault()` path in the close
handler has a corresponding resolution path, plus a hard timeout on the
renderer handshake.

### B. IPC contract integrity

`src/utils/ipc.js` promises `{ success, data, error }` by **convention only** —
nothing validates it, nothing types it, and three windows depend on it.

```bash
# Handlers registered in main vs. channels used in preload. The two must agree.
grep -oE "ipcMain\.(handle|on)\('[^']+'" electron/main/index.js \
  | sed "s/.*('//; s/'$//" | sort -u > /tmp/main.txt
grep -oE "invoke\('[^']+'|on\('[^']+'|send\('[^']+'" electron/preload/index.js \
  | sed "s/.*('//; s/'$//" | sort -u > /tmp/preload.txt

comm -23 /tmp/main.txt /tmp/preload.txt   # handler with no wrapper  → dead code
comm -13 /tmp/main.txt /tmp/preload.txt   # wrapper with no handler  → hangs/throws

# Handlers that can throw without returning the error envelope.
grep -n "ipcMain.handle" -A 12 electron/main/index.js | grep -n "throw\|await" | head -40
```

> **Verified 2026-09-05:** 54 handlers, 54 preload channels, **zero drift**.
> The surface is consistent *today*, so converting this check into a test locks
> in a good state rather than exposing a backlog — which makes it cheap to do
> early. The envelope discipline (`{ success, data, error }`) is the part that
> is still unenforced.

**What to look for:** a channel in main with no preload wrapper (dead), a
preload wrapper with no handler (crashes on call), handlers that `throw`
instead of returning `{ success: false, error }`, and renderer call sites that
ignore `success` and read `data` directly.

**Rule to add:** typed channel map in TypeScript (new files are `.ts` already),
plus a self-enforcing test that diffs the three lists and fails on drift. This
is rung 1 + rung 3 together and is the single highest-value rule in the audit.

### C. Swallowed errors

```bash
# Empty catch blocks — 11 known.
npx eslint . --rule '{"no-empty":"error"}' -f json 2>/dev/null \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{JSON.parse(d).forEach(f=>f.messages.filter(m=>m.ruleId==='no-empty').forEach(m=>console.log(f.filePath.split('presenter-pro/')[1]+':'+m.line)))})"

# Catches that swallow without logging or rethrowing.
grep -rn "catch" -A 3 src/ electron/ | grep -B 1 "^\s*}" | head -30
```

**What to look for:** every empty catch hides a failure mode. Each one is
either (a) a real error that should surface to the user, (b) an expected
condition that deserves a comment, or (c) a bug being masked.

**Rule to add:** keep `no-empty` as an error and prune the suppressions as they
are fixed — the ratchet is already in place.

### D. React correctness

```bash
npx eslint . -f json 2>/dev/null | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const m={};
JSON.parse(d).forEach(f=>f.messages.filter(x=>x.ruleId?.startsWith('react-hooks/'))
.forEach(x=>{const k=x.ruleId+' :: '+f.filePath.split('presenter-pro/')[1];m[k]=(m[k]||0)+1}));
Object.entries(m).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(String(v).padStart(3),k))})"
```

**What to look for:** the 17 `set-state-in-effect` errors are **not** bulk
fixable. Each is either a legitimate external-store sync (convert to
`useSyncExternalStore`) or a real cascading-render bug (derive the value
instead). Triage individually. The 4 `immutability` violations are the more
urgent subset — direct mutation of values React treats as immutable is a real
correctness risk.

### E. Dead and vestigial code

```bash
# Exported but never imported anywhere.
for f in $(find src -name '*.js' -o -name '*.jsx' | grep -v __tests__); do
  grep -oE "^export (function|const) [A-Za-z0-9_]+" "$f" | awk '{print $3}' | while read -r sym; do
    n=$(grep -rl "\b$sym\b" src/ electron/ --include='*.js' --include='*.jsx' --include='*.ts' | grep -v "$f" | wc -l)
    [ "$n" -eq 0 ] && echo "UNUSED  $f :: $sym"
  done
done

# Functions that ignore their arguments (stubs left after a feature was removed).
grep -rn "export function [a-zA-Z]*([a-zA-Z]" src/utils/ -A 2 | grep -B 1 "return null;\|return \[\];\|return;"

# Commented-out blocks larger than a few lines.
grep -rn "^\s*//" electron/ src/ | awk -F: '{print $1}' | uniq -c | sort -rn | head
```

**Known instances:** `getPresentationBackgroundId()` returns `null` and ignores
its `presentation` argument; `normalizePresentation()` still writes
`defaultBackgroundId: null` — both vestigial from the Phase 5A removal of
presentation-wide backgrounds. The commented-out `presenterWindow` block in
`electron/main/index.js` (~line 732) was kept "for rollback" several phases ago;
git history is the rollback mechanism, so delete it.

**Caution:** an unused export is sometimes the visible half of a feature that
was never wired up — the same mistake as the toolbar's missing import, in the
opposite direction. Check for a *missing call site* before deleting.

### F. Domain modeling

**Known instance:** `src/utils/sectionTypes.js` holds two different vocabularies
under confusingly similar names — `SECTION_TYPES` (verse/chorus/bridge: song
*parts*) and `SECTION_TYPE_META` (song/announcement/sermon: presentation
*section kinds*). `normalizeSectionType('verse')` returns `'announcement'`,
which is a landmine for anyone who assumes the two are related.

```bash
# Names that collide across concepts.
grep -rn "SECTION_TYPE\|sectionType\|section.type" src/ | wc -l
```

**Fix shape:** rename to `SONG_PART_TYPES` vs `SECTION_KINDS`, or move them into
separate modules. This is a rename with wide reach — it needs the
characterization tests in `sectionTypes.test.ts` (already written) to stay green
throughout.

### G. Oversized files

```bash
find src electron shared -name '*.js' -o -name '*.jsx' | xargs wc -l | sort -rn | head -10
```

Current: `Toolbar.jsx` 1634 · `Canvas.jsx` 1542 · `electron/main/index.js` 1364 ·
`SongEditorModal.jsx` 1275 · `Home.jsx` 1221 · `Filmstrip.jsx` 1188.

**Blocked** — see Ordering.

---

## Ordering

Strictly sequenced. Each stage unblocks the next.

1. **Lifecycle (A)** — start here. It is the only category with a *known
   user-facing P0* (the quit bug), it is self-contained in `electron/main`, and
   it needs no new coverage elsewhere.
2. **IPC contracts (B)** — highest leverage rule in the audit; do it before
   touching anything that crosses the process boundary.
3. **Swallowed errors (C)** and **dead code (E)** — cheap, independent, safe to
   interleave.
4. **React correctness (D)** — individually triaged, no bulk edits.
5. **Domain modeling (F)** — wide-reaching rename; needs D settled first so
   render behavior is stable.
6. **Oversized files (G)** — **blocked until coverage under each target file is
   real.** Line coverage is currently 2.6%. Characterization tests must land
   under `Canvas.jsx` and `electron/main/index.js` *before* any extraction, or
   the refactor is a rewrite with no safety net. This is the same mistake that
   produced the current state, at a larger scale.

---

## Execution model

Use the Planner/Executor/Reviewer split in `AI_OPERATING_MANUAL.md` — this pass
is exactly what it was designed for, and running it as unstructured churn is how
the codebase got here.

- **One category per plan.** Never mix categories in a single pass; a plan that
  spans lifecycle *and* React correctness will have its second half sampled.
- **Planner** (strong model) writes the plan with a full Compliance Manifest and
  an explicit, counted file list.
- **Executor** (fast model) implements it literally and stays inside that list.
- **Reviewer** (fresh context) audits the diff, re-runs `npm run gate` itself,
  and issues PASS/FAIL.
- **Architect** verifies in a running window — mandatory for anything touching
  windows, output, or presentation mode, which unit tests cannot cover.

Each category ships as its own PR with a `fix/` or `refactor/` branch.

---

## Definition of done

The audit is complete when:

- [ ] Every finding in `phase7-remediation.md` is fixed, or has a recorded
      decision not to fix with a reason.
- [ ] Every category above has at least one **mechanical rule** added, or a
      one-line justification for why none is possible.
- [ ] `eslint-suppressions.json` is empty or every remaining entry has a
      justifying comment (`npx eslint . --prune-suppressions`).
- [ ] Coverage thresholds in `vitest.config.mjs` have been raised to the new
      measured floor.
- [ ] `CLAUDE.md`'s "Known Issues" and "What's Pending" reflect reality — no
      claim of a working feature that is not covered by a test.

That last item is the honest summary of what went wrong before: the
documentation described intent, and nothing checked it against the code.
