# Executable Plan CMDS1 — one command registry (registry-lite)

**Audit item:** CMD-S1 · P2 · [F] shape, halved — "One command registry
`{id, label, menu, shortcut, when(state), run}` consumed by `runAppCommand`,
MenuBar, a keydown dispatcher with the shared guard, the shortcuts overlay and
tooltips. `appCommands.js` already centralises commands, so this is an
increment, not a rewrite. DEFER the expensive half — the native menu rebuilt
over IPC. Pushing `enabled` … covers CMD-B4/B5/SAVE-C9 at a fraction of the
cost. Structurally fixes B4, B5, B7, B11, F1, F5, F10." Also G3's "[F]
registry" half. **What this plan actually fixes:** CMD-B4, CMD-B5, CMD-B15,
CMD-F5, CMD-F10, the CMD-S4 dead cases, and G3's registry half. It **reports**
CMD-B11 (Decision 8) and leaves CMD-B7 and CMD-F1 unchanged.

Written per `.cursor/rules/writing-executable-plans.mdc`. Branch base `main` @
`a18458f`. Two PRs: **A** the registry and its in-renderer consumers; **B** the
native menu's enabled state pushed over IPC. Each lands green on its own.

---

## Measured (read on 2026-09-14, `main` @ `a18458f`)

Four hand-written lists describe the same commands and disagree:

| List            | Where                                                                                                                                                                                   | What it knows                                                 | What it gets wrong                                                                                                                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The switch      | `src/utils/appCommands.js:38-265`, `runAppCommand(command)`                                                                                                                             | **37** `case` labels, each with its own inline guard          | 7 cases have no caller anywhere in `src/` or `electron/` (`insert:blank`, `edit:copySlide`, `edit:pasteSlide`, `edit:clearSlide`, `view:presenterView`, `view:outputWindow`, `view:stageDisplayWindow`) — CMD-S4 |
| In-app menu     | `src/components/layout/MenuBar.jsx:9-68` `MENUS` (6 menus, 25 items + 3 dividers) and `:144-203` a hand-computed `disabled` block                                                       | labels, `shortcutTokens`, enabled rules                       | Undo/Redo, Insert Image/Video, Close's ⌘W missing; Insert Song/Media/Announcement/Sermon and Service Order exist only here                                                                                       |
| Native menu     | `electron/main/nativeMenu.ts` template, built once at `index.js:1371-1376`                                                                                                              | accelerators; B/L/Esc as hints (`registerAccelerator: false`) | **no `id`, no `enabled`** — every item always enabled; `App.jsx:31-35` runs whatever arrives on `app:command` unconditionally                                                                                    |
| Shortcuts sheet | `src/components/shared/ShortcutsOverlay.jsx:5-34` `SHORTCUTS` (4 groups, 13 rows)                                                                                                       | a third copy of the labels                                    | Esc listed twice ("Exit text editing / stop presenting" and "Stop Presenting"); no Close, Undo, Redo; CMD-F10                                                                                                    |
| Tooltips        | `Toolbar.jsx:174` `title="Present (F5)"` (static — says F5 while showing Stop, CMD-B15); `:1001,1553` New Slide via `formatShortcutLabel`; `:1366-1378` B/I/U hand-written `Cmd/Ctrl+B` | —                                                             | CMD-F5                                                                                                                                                                                                           |

Facts the design depends on:

- **CMD-B4 confirmed:** `useEditorStore.presentation` is never cleared on
  Home (`presentation: null` only at `editorStore.js:66`; `file:close` and
  `TitleBar.jsx:44-48` navigate Home without clearing it), and `App.jsx:31-35`
  calls `runAppCommand` for every native command, so ⌘M / F5 / Insert Image
  from the native menu on Home act on the hidden deck. `index.js:1372` sends
  `app:command` to `mainWindow` only, so the output and stage windows never
  receive one. `useAppStore.currentView` is `'home' | 'editor'` and defaults
  to `'home'` (`appStore.js:4`). **On Home neither `MenuBar` (`App.jsx:106`)
  nor `Editor`'s keydown listener (`App.jsx:109`) is mounted, so the native
  menu is the only route into `runAppCommand` there** — a guard in
  `runAppCommand` closes CMD-B4 whatever the accelerator mechanics.
- **Two paths for the same key.** A registered native accelerator reaches the
  renderer as `app:command` → `runAppCommand`. A key typed into the page by
  Playwright (`keyboard.press('F5')`) bypasses the native menu and reaches
  `Editor.jsx:245-300` → `editorKeyAction` → local handlers (`handleSave`,
  `handlePresent` — which enforces the "close panels first" rule that
  `present:start` does not: **that is CMD-B11's mechanism**). **Verified:** a
  registered bare accelerator fires on top of the renderer's own handling
  (`nativeMenu.ts:124-128`'s own record, and F5 is registered per `:120` /
  `nativeMenu.test.ts:158`). **Unverified:** whether ⌘-accelerators are
  consumed before the renderer sees the key. This plan does not merge the two
  paths (Decision 8); it records them. `editorKeyAction` also treats
  `modalOpen` as a hard stop, which `CommandState` does not model — the two
  guards agree on view and focus, not on modals.
- **E2E specs also drive commands directly.** `sendAppCommand` in
  `autosave.spec.ts:54`, `autosaveTyping.spec.ts:52`, `recovery.spec.ts:55`,
  `versionHistory.spec.ts:63` and `revert.spec.ts:70` is
  `webContents.send('app:command', …)`, bypassing both menus; Decision 2's
  guard applies to them. Every call site sends `file:save` first — in
  `autosave.spec.ts:66-67` and `recovery.spec.ts:75-76,99-100,139-140` **right
  after clicking Blank Presentation, before `currentView` has flipped** — and
  every `insert:newSlide` / `present:start` comes after a save round-trip or an
  explicit `[data-slide-editing]` wait, i.e. from the editor view. Hence
  Decision 2's Save/Save As rule.
- **`edit:undo` / `edit:redo`** (`appCommands.js:153-166`) are focus-aware:
  in a text field they run `document.execCommand`, else the store's undo. A
  view-based guard alone would break ⌘Z inside a Home rename field.
- **IPC is contract-driven and triple-guarded.** `shared/ipcContract.ts`
  `SEND_METHODS` (`:99-101`, one entry today) → preload auto-wraps
  (`electron/preload/index.ts:43-45`, spreading the arguments, so an object
  payload needs no `ARG_SHAPERS` entry) → `src/utils/ipc.ts` must export
  exactly one wrapper per method (`ipcChannels.test.ts:75`; its collector
  matches `export function <name>(` — an `export const` arrow would not count)
  → main must register it
  through `ipc.on` (`ipcRegistry.ts:93`; `ipcChannels.test.ts:47,55` and
  `assertComplete()` at launch). `index.js:861-866` is the one existing `ipc.on`.
- **Menu items are addressable by id** in Electron (`Menu.getApplicationMenu()
.getMenuItemById(id)`, `item.enabled = …`) once the template carries `id`.
- **Existing tests that pin this code:** `MenuBar.test.tsx` (7 cases: Version
  History and Revert enabled states, found by `getByRole('button', { name })`;
  none seeds `currentView`, so they run from the Home view today);
  `src/pages/__tests__/unsavedChangesGuard.test.ts:56` (reads `appCommands.js`
  as source text for `case 'window:requestClose'`); `platformShortcuts.js`
  has **no test** though three surfaces now depend on it;
  `nativeMenu.test.ts` (`rows()` prints `label [accelerator]` — ids would not
  appear; the command order; production safety; hints not registered);
  `appCommands.present.test.ts`, `.closeGuard`, `.leaveWhilePresenting`,
  `.blockingEditors`; `editorKeyAction.test.ts`, `presenterKeymap.test.ts`,
  `shortcutGuard.test.ts`; `ipcChannels.test.ts`, `ipcRegistry.test.ts`;
  `inlineStyleBudget.test.ts` (`MenuBar.jsx: 5`, `Toolbar.jsx: 23`).
  Whether the `appCommands.*` tests set `currentView: 'editor'` is measured in
  Todo 1 — if they exercise editor commands from the default `'home'` view,
  the new guard makes them fail for a **setup** reason, and the fix is the
  test's seed state, not the assertion (stated in Todo 4).
- **E2E specs drive the in-app MenuBar by label** — `csp`, `editing`,
  `revert`, `versionHistory`, `visual-editor`, `visual-library`,
  `visual-modals`, `visual-surfaces`, `visual-hover` (`menu('View', 'Song
Library')` etc.), always from the editor view (each opens a deck and waits
  for `[data-slide-editing]` first; the bar only renders there). Labels and
  menu membership must not change. `visual-surfaces.spec.ts:85` asserts the
  literal `getByText('Show this overlay')` before capturing the sheet.
- **Baselines that can move:** `shortcuts-overlay-darwin.png` (the sheet is
  generated) and `hover-shortcuts-close-darwin.png` (`visual-hover.spec.ts:216`
  opens the sheet, clipped to its close button — the header does not change,
  so it is expected to stay). The MenuBar's closed state is pixel-identical;
  `hover-menu-item-darwin.png` opens the View menu, whose rows do not change.

## Decisions

1. **One registry, `src/utils/commandRegistry.ts`.** `COMMANDS` is a readonly
   array of `{ id, label, menu, shortcut?, hint?, when, dynamicLabel?, inApp,
native, syncEnabled }`:
   - `id` — the existing command string (`'file:save'`), unchanged.
   - `label` — the menu label; `dynamicLabel(state)` for the two toggles
     (Show/Hide Service Order, Show/Hide Presenter Panel).
   - `menu` — `'file' | 'insert' | 'edit' | 'view' | 'present' | 'help' | null`.
   - `shortcut` — tokens for `formatShortcutLabel` (`['mod','s']`, `['F5']`,
     `['esc']`, `['b']`); `hint: true` marks B/L/Esc as renderer-owned (shown,
     never registered — plan L1's rule, unchanged).
   - `when(state)` — the single enabled rule, over a **pure**
     `CommandState = { view, hasPresentation, isDirty, requiresInitialSave,
isPresenting, presenterPanelOpen, filmstripVisible, typing }`.
     `readCommandState()` builds it from the three stores and
     `isTypingTarget(document.activeElement)`.
   - `inApp` / `native` — membership in each menu, exactly today's membership.
   - `syncEnabled` — pushed to the native menu in PR B (false for undo/redo,
     whose rule depends on focus the OS menu cannot see).
     The `run` bodies **stay in `runAppCommand`'s switch** — this is
     registry-lite; moving 37 bodies is churn without a bug behind it.
2. **`runAppCommand` is guarded by the registry.** First line:
   `if (!isCommandEnabled(command, readCommandState())) return false;`. The
   rules, exhaustively:
   - always: `window:requestClose`, `file:new`, `file:open`, `help:*`.
     **`window:requestClose` must never be refused** — `runAppCommand` is the
     sole caller of `resolveWindowCloseRequest()`, and a `false` here leaves
     main's close controller waiting forever (the phase7 #11 unquittable app).
     Todo 2 asserts it enabled in every matrix state.
   - `hasPresentation` only (no view clause): `file:save`, `file:saveAs` — a
     save from Home writes the same row the editor would, and the E2E harness
     sends `file:save` before the view flips (Measured).
   - `view === 'editor' && hasPresentation`: `file:close`, `file:revert` (and
     `isDirty && !requiresInitialSave`), `file:versionHistory` (and
     `!isPresenting` — CMD-B5 / SAVE-B1), every `insert:*` (the four in-app
     Insert items were never disabled before; in the editor a presentation is
     always open, so nothing visible changes — pinned by Todo 2's matrix),
     `edit:presentationSettings`, `view:outputSettings`, every `view:*`,
     `present:start` (and `!isPresenting`).
   - `isPresenting` only: `present:stop`, `present:black`, `present:logo` —
     **never gated on the view**: `OnboardingTutorial.jsx:180` reaches Home
     without `confirmStopBeforeLeaving`, and Stop Presenting must stay
     reachable from the native menu in front of the room.
   - `view === 'editor' || typing`: `edit:undo`, `edit:redo` (a Home rename
     field keeps ⌘Z).
     Every existing inline guard inside a case stays (belt and braces; they are
     what the existing tests describe).
3. **The switch and the registry are the same set, mechanically.** A
   source-text test collects every `case '<id>':` label in `appCommands.js`
   and asserts the set equals the registry's ids, both directions, with the
   counts. The 7 dead cases are deleted in the same todo (the CMD-S4 half
   that this plan owns); the other CMD-S4 items are not touched.
4. **MenuBar renders from the registry.** A thin layout per menu
   (`IN_APP_MENU_LAYOUT: Record<Menu, (CommandId | '---')[]>`) fixes order and
   dividers; label, shortcut and enabled come from the registry. The visible
   result is identical to today **with one deliberate exception**: Close shows
   the ⌘W / Ctrl+W it has always had in the native menu (the Measured table's
   defect). Todo 5 pins today's bar first; Todo 6 changes that one row and
   names it. `view:presenterPanel` carries a `nativeLabel` ("Show / Hide
   Presenter Panel") because the native template's static label differs from
   the in-app dynamic one; Decision 7's guard compares `nativeLabel ?? label`.
5. **The shortcuts sheet is generated.** Commands with a `shortcut`, grouped by
   `menu` in layout order, plus one static `KEYS` list for the non-command keys
   (`Double-click` edit slide text, `Esc` exit text editing, `←`/`→`
   previous/next slide, `?` "Show this overlay" — that literal is asserted by
   `visual-surfaces.spec.ts:85`, so the Help menu's `help:shortcuts` is left
   out of the generated groups and the sheet lists its own key itself).
   "Stop Presenting" appears once, from the registry (CMD-F10).
   `shortcutGroups(platform)` returns token **arrays** (`['⌘', 'S']`), which
   the sheet renders one `<kbd>` each.
6. **Tooltips come from the registry.** `commandTooltip(id, state)` →
   `"Present (F5)"` / `"Stop Presenting (Esc)"` while presenting (CMD-B15),
   `"New Slide (⌘M)"`. Bold/Italic/Underline are formatting, not commands —
   unchanged.
7. **The native menu gets ids** (`id: <command>` on every clickable item) and
   nothing else in PR A. A guard test asserts every `native: true` command
   appears in the template with its id and label, and every template command
   is `native: true` — both directions, counted. PR B pushes `enabled`.
8. **Not in this plan:** the keydown dispatcher — `editorKeyAction` (plan L2)
   stays as is; the two-path finding is reported, and CMD-B11 stays an [S]
   item. CMD-F1 (native-only menu on macOS) and CMD-M12 are Ethan's. No new
   commands (CMD-M*). The native menu is not rebuilt over IPC (the deferred
   half).
9. **PR B — enabled over IPC.** `SEND_METHODS.setMenuEnabled = 'menu:setEnabled'`
   with payload `{ enabled: Record<string, boolean> }` for every `syncEnabled`
   command; `App.jsx` (main window only) subscribes to the three stores,
   computes the map with `nativeMenuEnabled(state)` and sends only when the
   JSON changes; main's `ipc.on` sets `getMenuItemById(id).enabled` for each
   known id and ignores unknown ids. With Decision 2 already in place, a late
   or missing push cannot let a disabled command run — the push is the grey
   pixels, the guard is the safety.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

Every comparison in this plan is **exact**: whole arrays with `toEqual` in
layout order; sets compared both directions with their lengths asserted.

## Blast radius

**PR A may change:** `src/utils/commandRegistry.ts` (new),
`src/utils/__tests__/commandRegistry.test.ts` (new),
`src/utils/__tests__/appCommands.registryGuard.test.ts` (new),
`src/utils/appCommands.js` (the guard line; the 7 dead cases deleted; nothing
else), `src/components/layout/MenuBar.jsx` (`MENUS` and the `disabled` block
replaced by the registry; JSX unchanged), `src/components/layout/__tests__/MenuBar.test.tsx`
(**additions only**: the layout pin of Todo 5), `src/components/shared/ShortcutsOverlay.jsx`
(`SHORTCUTS` replaced), `src/components/shared/__tests__/ShortcutsOverlay.test.tsx`
(new), `src/components/layout/Toolbar.jsx:174,1001,1553` (tooltips only),
`electron/main/nativeMenu.ts` (`id` on clickable items), `electron/main/__tests__/nativeMenu.test.ts`
(**additions only**), `e2e/visual-surfaces.spec.ts-snapshots/shortcuts-overlay-darwin.png`
(recaptured), `src/__tests__/inlineStyleBudget.test.ts` (rows only if a count
moves), this plan, the charter row, the notes entry. The `appCommands.*.test.ts`
files may gain `currentView: 'editor'` in their seed state (Todo 4) — no
assertion changes.

**PR B may change:** `shared/ipcContract.ts` (one `SEND_METHODS` entry),
`src/utils/ipc.ts` (one wrapper), `electron/main/index.js` (one `ipc.on`
handler next to `:861`), `electron/main/__tests__/menuEnabledWiring.test.ts`
(new, source-text), `src/utils/__tests__/ipc.menuEnabled.test.ts` (new),
`src/App.jsx` (one effect), `src/__tests__/App.menuEnabled.test.tsx` (new),
`src/utils/commandRegistry.ts` (`nativeMenuEnabled`), records.

**May not change:** `editorKeyAction.ts`, `presenterKeymap.ts`,
`shortcutGuard.ts`, `escapeKey.ts` and their tests (plan L2 — they DESCRIBE the
key handling); `Editor.jsx`; every `run` body in the switch; any store; the
labels, order or membership of either menu; `playwright.config.ts`; any E2E
spec. A red in the may-not-change set is a suspected regression to record.

## Todos

### PR A — the registry and its consumers

- [x] 1. **Measure the test seeds.** `grep -n "currentView" src/utils/__tests__/appCommands.*.test.ts`.
      _Measured: `appStore.currentView` defaults to `'home'` (`appStore.js:4`).
      `appCommands.blockingEditors.test.ts:64` and `.leaveWhilePresenting.test.ts:67`
      seed `currentView: 'editor'`; `.present.test.ts` and `.closeGuard.test.ts`
      do not, so they exercise `present:*` and `file:close` from the Home view
      and need the seed added (Todo 4). The 7 dead ids each occur in exactly one
      file, `appCommands.js`; the switch has 37 `case` labels._
- [x] 2. **Registry characterization (red).** `src/utils/__tests__/commandRegistry.test.ts`
      against a **stub module that exports every name with a trivially wrong
      value** (`export const COMMANDS = []`, functions returning `false`/`''`/`[]`),
      so the red is on assertions, not on module resolution — _done: 55 failed
      on `toEqual`/`toBe`_. This table is exhaustive, all 8 (plus the quit
      handshake and `nativeLabel` cases added after review):
  1. `COMMANDS.map(c => c.id)` equals the exact list of 30 ids (37 − 7 dead),
     in the order written in the registry — whole array, `toEqual`.
  2. `isCommandEnabled(id, state)` for the **enabled matrix**: a table of
     `(id, state, expected)` rows covering every `when` branch — home vs editor
     for each editor-only command; `file:revert` × (dirty, requiresInitialSave);
     `file:versionHistory` × isPresenting; `present:start` × (hasPresentation,
     isPresenting); `present:stop/black/logo` × isPresenting; undo/redo ×
     (view, typing); the always-enabled set. The table's length is asserted
     and every registry id must appear in it at least once (iterate `COMMANDS`,
     fail if any id has no row).
  3. `menuItems('file', state)` returns the in-app File items in layout order
     with `{ id, label, shortcut, disabled }` — exact array matching today's
     MenuBar for a clean, saved, editor-open state, including the divider.
  4. `dynamicLabel`: `view:filmstrip` reads "Hide Service Order" when visible,
     "Show Service Order" when not; same for the presenter panel.
  5. `shortcutGroups(platform)` for the sheet: exact groups and rows on
     `'darwin'` and on `'win32'` (⌘ vs Ctrl).
  6. `commandTooltip('present:start', state)` is `"Present (F5)"`;
     `commandTooltip('present:stop', …)` is `"Stop Presenting (Esc)"`;
     `commandTooltip('insert:newSlide', …, 'darwin')` is `"New Slide (⌘M)"`.
  7. `nativeCommands()` returns exactly the ids with `native: true` in
     registry order (asserted list).
  8. `hint` is true for exactly `present:stop`, `present:black`, `present:logo`.
     Verify: `npx vitest run src/utils/__tests__/commandRegistry.test.ts`.
- [x] 3. Write `commandRegistry.ts` (Decision 1). Green on Todo 2.
- [x] 4. **Guard (red first).** _Done: 4 failed on assertions; then green.
      `appCommands.present.test.ts` gained `currentView: 'editor'` in its
      `beforeEach` (two `present:start` cases ran from the Home view); the
      case-label regex is `/^\s*case '([a-z]+:[A-Za-z]+)':/gm`, which tolerates
      `case 'x': {`._ `src/utils/__tests__/appCommands.registryGuard.test.ts`:
      with the stores seeded to Home and a stale presentation in the editor
      store, `runAppCommand('insert:newSlide')`, `('present:start')`,
      `('insert:image')`, `('file:versionHistory')` each resolve `false` and the
      mocked action was **not** called (assert `toHaveBeenCalledTimes(0)` on
      each mock; assert the list of tried ids has length 4); on the editor view
      the same ids reach their actions; `file:versionHistory` while presenting
      resolves `false` from the editor view too; `edit:undo` on Home with a
      focused `<input>` still runs `document.execCommand('undo')`. Then the
      guard line in `runAppCommand` and the 7 dead cases deleted, plus a
      source-text test (Decision 3) asserting `case` labels === registry ids
      (both directions, `length` 30). If Todo 1 found `appCommands.*` tests
      exercising editor commands from the Home view, add
      `useAppStore.setState({ currentView: 'editor' })` to their `beforeEach` —
      a seed-state edit, named in the commit; no assertion changes.
      Verify: `npx vitest run src/utils/__tests__/appCommands`.
- [x] 5. **MenuBar pin, then swap.** Add to `MenuBar.test.tsx` a case that opens
      each of the 6 menus and asserts the exact array of item labels and
      shortcut texts (whole arrays, in order) for a clean, saved, editor-open
      state — written **before** Todo 6 against today's `MENUS` (green on
      write, as a characterization is). The file's shared `beforeEach` gains
      `currentView: 'editor'` — a seed-state edit: the 7 existing cases
      describe the editor's bar, and the registry's editor-only rules require
      the view. Verify: `npx vitest run src/components/layout`.
- [x] 6. MenuBar renders from `menuItems` (Decision 4); `MENUS` and the
      `disabled` block deleted; `MenuItem` JSX untouched. Todo 5's pin passes
      with **one named row change** (Close gains `Ctrl+W`/`⌘W`) and the 7
      existing cases pass unchanged.
- [x] 7. **Sheet pin, then generate.** `ShortcutsOverlay.test.tsx` (new,
      jsdom): the rendered `<kbd>`/label rows equal the exact expected list on
      `'darwin'` — written against the **generated** list (this is a deliberate
      content change: Close ⌘W, Undo, Redo appear; "Exit text editing / stop
      presenting" becomes "Exit text editing" under Keys and "Stop Presenting"
      appears once). State in the commit that the sheet's content changed and
      why. Then `ShortcutsOverlay.jsx` renders `shortcutGroups(platform)` +
      `KEYS`. Verify: `npx vitest run src/components/shared/__tests__/ShortcutsOverlay.test.tsx`.
- [x] 8. Tooltips (Decision 6): the three `title=` sites read
      `commandTooltip`. A `Toolbar` unit test is out of scope (it has none —
      CMD-S2 characterizes it); the tooltip strings are pinned in Todo 2.6.
- [x] 9. Native ids (Decision 7): `id: '<command>'` on every clickable item in
      `nativeMenu.ts`; **add** to `nativeMenu.test.ts` (no existing assertion
      edited): every clickable item's `id` equals the command it sends
      (collect the 21 pairs, assert the array). The registry ⇄ template guard
      (both directions, counts; labels via `nativeLabel ?? label`; hints ⇄
      `registerAccelerator: false`) lives in
      `src/utils/__tests__/commandRegistry.native.test.ts` — the electron test
      folder must not import renderer stores. Verify:
      `npx vitest run electron/main/__tests__/nativeMenu.test.ts src/utils/__tests__/commandRegistry.native.test.ts`.
- [ ] 10. `npm run gate`, `npm run format:check`; `inlineStyleBudget` rows if a
      count moved (both `MenuBar.jsx` rows, `:29` styles and `:63` hover
      handlers). Recapture on CI; triage every mover as intended /
      unintended side effect / unexplainable **before** accepting any:
      `shortcuts-overlay-darwin.png` is the expected mover (intended);
      `hover-shortcuts-close-darwin.png` is pre-authorised as a possible mover
      (the sheet is behind its clip — accept only if the diff is the sheet's
      rows, not the button); any other mover stops the PR. Commit only movers,
      named in the commit. PR with findings; charter row; notes entry.

### PR B — enabled over IPC

- [ ] 11. **Contract (red).** `src/utils/__tests__/ipc.menuEnabled.test.ts`:
      with `window.electronAPI.setMenuEnabled` mocked, `setMenuEnabled({ enabled: { 'file:save': false } })`
      calls it once with **exactly** that object. Red against a stub wrapper
      (`export function setMenuEnabled() {}` that sends nothing), not a missing
      export. The wrapper is `export function setMenuEnabled(…)` — `export const`
      would not be counted by `ipcChannels.test.ts:71`. **Todos 11 and 12 land
      as one commit**: between the contract entry and main's handler,
      `ipcChannels.test.ts:47-49` is red and `assertComplete()` throws at launch.
- [ ] 12. **Main wiring (red, source-text).** `electron/main/__tests__/menuEnabledWiring.test.ts`
      asserts `index.js` registers `ipc.on('menu:setEnabled', …)` and that the
      handler body references `getMenuItemById` and `.enabled =`. Then the
      handler: for each `[id, on]` of `payload.enabled`, `const item = Menu.getApplicationMenu()?.getMenuItemById(id); if (item) item.enabled = Boolean(on);`.
      Verify: `npx vitest run electron/main/__tests__`.
- [ ] 13. **Renderer push (red).** `src/__tests__/App.menuEnabled.test.tsx`
      (jsdom; `src/utils/ipc` mocked): on mount the push is sent once with the
      exact map for the initial state (every `syncEnabled` id present, length
      asserted); opening a presentation in the editor store sends again with
      `file:save: true`; an unrelated store change (e.g. `shortcutsOpen`) sends
      **nothing** more (`toHaveBeenCalledTimes` exact); and with
      `window.location.hash = '#/output'` set **before `App` is imported**
      (`isOutputWindow` is computed at module scope, `App.jsx:19-21` — use
      `vi.resetModules()` + a dynamic import) the push is sent **zero** times.
      That skip is load-bearing: the output and stage renderers hold their own
      stores with `currentView: 'home'` and no presentation, and an unguarded
      push from them would grey the main window's whole native menu,
      last-writer-wins. Then `nativeMenuEnabled(state)` in the registry and the
      effect in `App.jsx`.
- [ ] 14. Gate, format, PR, records. `## Review` appended to this plan.

### Both PRs

- [ ] 15. Findings report in the PR body: the two key paths (native
      accelerator → `runAppCommand` vs page keydown → `editorKeyAction`) and
      CMD-B11's cause; the 7 dead cases removed; suspected regressions; the
      one baseline refreshed. **Manual check owed** (not run — no app launches
      while Ethan is at the machine): on Home with a presentation previously
      open, press ⌘M and F5 — nothing happens and (after PR B) File ▸ Save and
      Present ▸ Start Presenting are greyed; open a presentation — they enable;
      start presenting — File ▸ Version History greys.

## Compliance Manifest

### writing-executable-plans.mdc (15 items)

| Item                                          | Disposition                                                                                                                                                                                                |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assertion weakening designed against          | Clause verbatim; every list compared whole with `toEqual`, both directions where sets are compared (Todos 2.1, 2.7, 4, 9)                                                                                  |
| List sampling designed against                | Todo 2 "all 8"; the enabled matrix asserts its length and that every registry id has a row (2.2); Todo 4 asserts the tried-id list length; Todo 13 asserts the map length                                  |
| Quantifier erosion designed against           | "Every command" is `COMMANDS` iterated (2.2, 9); "every case" is a source-text collection compared to the registry (Decision 3)                                                                            |
| Sanctioned escape hatch                       | None — no allowlist; the one expected baseline mover is named (Todo 10)                                                                                                                                    |
| Bounded blast radius                          | Blast radius per PR with a may-not-change list                                                                                                                                                             |
| File-specific pitfall notes                   | Measured: `appCommands.*` tests may run from the Home view (Todo 1/4); undo/redo depend on focus (Decision 2); the three IPC guard tests (Todo 11); `nativeMenu.test` `rows()` does not print ids (Todo 9) |
| Exact paths                                   | Blast radius; no new test directories                                                                                                                                                                      |
| Per-todo verification                         | Todos 2, 4, 5, 7, 9, 12 name their vitest command; gate at Todos 10, 14                                                                                                                                    |
| Snapshot policy inline                        | Todo 10: CI recapture, the intended / unintended-side-effect / unexplainable triage before any refresh, one expected mover and one pre-authorised possible mover, commit only movers, named in the commit  |
| Preconditions for conditional UI              | Todo 4 seeds `currentView` and a focused `<input>`; Todo 5 opens each menu before reading it; Todo 13 states the initial store state                                                                       |
| Structural floor under every snapshot         | Todo 7 pins the sheet's rows in a unit test; the baseline is paired with the existing spec's `toBeVisible` on the sheet                                                                                    |
| IPC contract pinning                          | Todo 11 (renderer wrapper, exact payload) and Todo 12 (main handler, source-text) name the channel `menu:setEnabled` and its shape                                                                         |
| Manual verification steps                     | Todo 15 (owed, not run)                                                                                                                                                                                    |
| Required findings report                      | Todo 15                                                                                                                                                                                                    |
| Data rewrites state their backup and rollback | N/A — no row or snapshot is rewritten                                                                                                                                                                      |

### testing-standards.mdc (10 items)

| #   | Item                             | Disposition                                                                                                                                                                                                                                  |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | TDD ordering                     | Todos 2→3, 4 (red first), 7, 11→(contract), 12→(handler), 13→(effect)                                                                                                                                                                        |
| 2   | Behavior-change test edits       | Todo 4's and Todo 5's seed-state additions (`currentView: 'editor'`; named in the commit, no assertion changed); Todo 6's one pinned row (Close gains ⌘W, deliberate); Todo 7's sheet content (deliberate, stated); Todo 9 is additions only |
| 3   | No weakened assertions           | Clause verbatim; whole-array `toEqual`; counts asserted                                                                                                                                                                                      |
| 4   | Coverage floor                   | Todo 2 covers every registry function and every `when` branch (2.2's matrix rule); Todos 11–13 cover each IPC side                                                                                                                           |
| 5   | Lint floor                       | No `.only`/`.skip`; `eslint --max-warnings 0` in the gate                                                                                                                                                                                    |
| 6   | Snapshot discipline              | Todo 10: triage (intended / unintended side effect / unexplainable) before any refresh; no blanket update; each refresh named in the commit                                                                                                  |
| 7   | Completion gate                  | Todos 10, 14 report type-check, lint, passed/total, noting skipped counts                                                                                                                                                                    |
| 8   | Vitest / jsdom mechanics         | Stores reset in `beforeEach` (Todos 4, 5, 13); `src/utils/ipc` mocked; `document.execCommand` stubbed in Todo 4 (jsdom has none); source-text tests for `index.js`                                                                           |
| 9   | Test placement                   | `src/utils/__tests__/`, `src/components/layout/__tests__/`, `src/components/shared/__tests__/`, `src/__tests__/`, `electron/main/__tests__/`                                                                                                 |
| 10  | Characterization before refactor | Todo 5 pins MenuBar before Todo 6; Todo 9 pins ids as additions; `nativeMenu.test.ts`'s existing cases and `MenuBar.test.tsx`'s 8 cases pass unchanged                                                                                       |
