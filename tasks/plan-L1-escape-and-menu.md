# Executable Plan L1 — Escape and the menu can no longer end a service by accident

**Source:** `tasks/fable-pass-2-audit.md` (local, untracked), Wave 1 plan **L1**:
**MAIN-B4** (= CMD-B3 = LIVE-A12) Reload and DevTools ship in production ·
**CMD-B7** (= MAIN-F6) single-key menu accelerators · **LIVE-A11** (= CMD-B2)
Escape meant for an overlay also stops presenting.

Written per `.cursor/rules/writing-executable-plans.mdc`. Builds on L0
(`plan-L0-presenting-characterization.md`), whose 28 cases must stay unchanged.

---

## Measured (2026-09-13, `main` @ `ab65e2d`)

**MAIN-B4.** `electron/main/index.js` View menu: `{ role: 'reload' }, { role:
'toggleDevTools' }` with no gate, although `const isDev = !app.isPackaged`
already exists at the top of the file. ⌘R mid-service reloads the editor: the
presenter store is lost, the output window keeps its last slide, and the reload
skips the unsaved-changes handshake.

**CMD-B7.** The Present menu registers `accelerator: 'B'`, `'L'` and `'Escape'`
with the OS. The renderer already handles all three (`Editor.jsx`), and main's
black/logo are toggles, so one key press can reach both paths. SUSPECTED (native
accelerator routing is invisible to Playwright), so the fix removes the second
path rather than proving the double fire.

**LIVE-A11.** Every keydown listener in the renderer, by phase:

| Listener | Target / phase | Escape consumed? |
|---|---|---|
| `Editor.jsx` stop presenting | window, bubble, **registered at Editor mount** | — |
| `Canvas.jsx` deselect / exit edit | window, **capture** | yes (`preventDefault`) |
| `Dialog.jsx` (DialogHost) | window, bubble | `preventDefault`, but too late |
| `PresentationSettingsModal` / `VersionHistoryModal` / `OutputSettingsModal` | window, bubble | `preventDefault`, but too late |
| `ShortcutsOverlay.jsx` | window, bubble | no |
| `MenuBar.jsx` | window, bubble | no |
| `ContextMenu.jsx` | document, bubble | no |

Window bubble listeners run in registration order, and every overlay mounts
after the Editor, so the Editor always ran first. Even the overlays that called
`preventDefault()` did it after the projector had already been stopped.

## Decisions

1. **Overlays take Escape in the window capture phase and consume it.** Capture
   on `window` runs before any bubble listener, whatever the registration order.
   The Editor stops presenting only on an Escape nobody consumed —
   `shouldStopPresentingOnEscape(event, isPresenting)` in `src/utils/escapeKey.ts`.
2. **Only Escape moves.** Dialog's Enter stays in the bubble phase (after the
   dialog's own fields). ShortcutsOverlay's `?` stays in the bubble phase — the
   Editor toggles the sheet on `?` too, and closing it first in capture would
   let that toggle reopen it.
3. **MenuBar consumes Escape only when a menu is open.** With no menu open,
   Escape still belongs to the Editor (asserted).
4. **ContextMenu stays a document listener** (document bubble already runs
   before window bubble) and just calls `preventDefault()`.
5. **The native menu becomes a tested pure template**, `electron/main/nativeMenu.ts`,
   extracted **verbatim first** and pinned item-for-item, then changed. It needs
   its own Rollup input (`main/nativeMenu`) — the main process is CommonJS and a
   missing entry crashes the app on launch.
6. **Reload/DevTools are dev-only**, and their separator goes with them.
7. **Escape, B and L become label-only** (`registerAccelerator: false`): still
   shown in the menu, as Keynote shows its Play-menu keys, but not registered
   with the OS. F5 and every modifier shortcut stay registered.
8. Toolbar popovers still do not handle Escape at all — that is CMD-F6, a
   separate item. Esc with a popover open still stops presenting, as before.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

Comparisons: the menu rows and sent commands are **exact, ordered** lists; each
overlay case asserts `seen` is **exactly** `[true]` (one event, consumed); the
negative case exactly `[false]`.

## Blast radius

May change: `electron/main/nativeMenu.ts` (new), `electron/main/index.js`
(require + `buildNativeMenu` body only), `electron.vite.config.js` (one input),
`src/utils/escapeKey.ts` (new), `src/pages/Editor.jsx` (import + the Escape
condition only), `src/components/shared/{Dialog,ShortcutsOverlay,ContextMenu}.jsx`,
`src/components/layout/MenuBar.jsx`,
`src/components/editor/{PresentationSettings,VersionHistory,OutputSettings}Modal.jsx`
(listener phase only), the three new test files, this plan, the charter row, the
notes entry. **May not** change the L0 tests, `menuBarEscape.test.tsx` or
`settingsModalsEscape.test.tsx` — they must pass unchanged.

## Todos

- [x] 1. Extract the template verbatim into `nativeMenu.ts`;
  `electron/main/__tests__/nativeMenu.test.ts` pins all **44** rows and all
  **21** sent commands in order → **pass** on the verbatim copy.
- [x] 2. **Red:** production has no Reload/DevTools (and no leading separator);
  B / L / Escape are `registerAccelerator: false` while F5 is not → **2 fail**.
- [x] 3. **Red:** `src/utils/__tests__/escapeKey.test.ts` (4 cases) → fails,
  module missing. `src/components/shared/__tests__/escapeConsumed.test.tsx` — a
  window listener registered before each overlay mounts must see Escape
  consumed: **7 overlays, count asserted**, plus the no-menu MenuBar negative →
  **all 7 fail**, the negative and the count pass.
- [x] 4. Implement Decisions 1–7. Verify: the three files plus
  `menuBarEscape.test.tsx` and `settingsModalsEscape.test.tsx` → **21 / 21**.
- [ ] 5. `npm run gate` + `npm run format:check`; the L0 files still 28 / 28.
- [ ] 6. Manual verification — **packaged app, both macOS and Windows** (E2E
  cannot see native accelerators or the packaged menu): (a) View menu has no
  Reload / Toggle Developer Tools; ⌘R / Ctrl+R does nothing; (b) start
  presenting, press B once → black; again → back (not a double toggle); (c) with
  focus in the song-library search box, typing `b` types a `b` and does not
  black the output; (d) while presenting, open Output Settings, press Esc → the
  modal closes and the projector keeps its slide; same for `?` sheet, a right-click
  menu, an open menu-bar menu, a confirm dialog; (e) with nothing open, Esc stops
  presenting. **Not done by this session** (standing rule 7 — no app launches
  while Ethan is at the machine); listed in the PR for Ethan.
- [ ] 7. Findings report in the PR body.

## Compliance Manifest

### writing-executable-plans.mdc (14 items)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; exactness stated under Decisions |
| List sampling designed against | 44 menu rows and 21 commands compared whole; overlay table length asserted (7) |
| Quantifier erosion designed against | "every overlay" is the enumerated `CASES` table with a length assertion |
| Sanctioned escape hatch | N/A — no allowlist; toolbar popovers are named out of scope (Decision 8) |
| Bounded blast radius | Blast radius section |
| File-specific pitfall notes | Decision 2 (`?` must stay bubble), Decision 5 (Rollup input or launch crash) |
| Exact paths | Blast radius |
| Per-todo verification | Todos 1–5 |
| Snapshot policy inline | N/A — no snapshots |
| Preconditions for conditional UI | Each overlay case seeds its open state (store flag, dialog config, clicked menu) and asserts it rendered before pressing Escape where it can |
| Structural floor under snapshots | N/A — no snapshots |
| IPC contract pinning | N/A — no channel added or changed; `app:command` payloads are pinned by the 21-command list |
| Manual verification steps | Todo 6 (packaged app, both OSes) |
| Required findings report | Todo 7 |

### testing-standards.mdc (10 items)

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | Todos 2–3 red before Todo 4 |
| 2 | Behavior-change test edits | N/A — no existing test modified |
| 3 | No weakened assertions | Clause verbatim; exact comparisons |
| 4 | Coverage floor | One case per overlay, per menu rule, per helper branch |
| 5 | Lint floor | No `.only`/`.skip`; every case asserts; no `expect` in `if`/`catch` |
| 6 | Snapshot discipline | N/A — no snapshots |
| 7 | Completion gate | Todo 5 |
| 8 | Vitest / jsdom mechanics | jsdom header; app/dialog/editor stores reset; `@/utils/ipc` mocked; no `electron` import (`nativeMenu.ts` is electron-free by design) |
| 9 | Test placement | `electron/main/__tests__/`, `src/utils/__tests__/`, `src/components/shared/__tests__/` |
| 10 | Characterization before refactor | Todo 1 pins the template verbatim before Todo 2 changes it; L0's 28 cases and the two existing Escape tests unchanged |
