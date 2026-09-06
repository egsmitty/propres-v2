# Executable Plan B1 — IPC contract: one source of truth, enforced envelope, no bypasses

**Workstream:** B (IPC contract integrity) · **Depends on:** S1 merged (dead channels gone)
**Category:** contract enforcement (one category).

## The problem, precisely (measured 2026-09-06 on `main` after S1)

- The channel names live in three places by hand: 52 `ipcMain.handle/on` calls
  in `electron/main/index.js`, 52 `ipcRenderer.invoke/send` wrappers in
  `electron/preload/index.js`, and free-form `export async function` wrappers
  in `src/utils/ipc.js`. A regex test keeps the first two equal. Nothing keeps
  the third honest, and nothing says what a channel's arguments or result are.
- The `{ success, data, error }` envelope is a convention, not a contract:
  `window:close`, `window:minimize`, `window:maximize` return `undefined`;
  every other handler hand-writes its own `try/catch`. A handler that throws
  (or a future one that forgets the try) rejects the renderer's `invoke` with a
  serialized Error instead of an envelope, and every call site that checks
  `result.success` then dereferences `undefined`.
- Eight renderer files bypass `src/utils/ipc.js` and call `window.electronAPI`
  directly (`App.jsx`, `Editor.jsx`, `appCommands.js`, `presenterFlow.js`,
  `platformShortcuts.js`, `OutputRenderer.jsx`, `StageDisplayRenderer.jsx`,
  `OutputSettingsModal.jsx`, `PresenterPanel.jsx`). Those are the calls no
  wrapper can type or normalise.

## Design

### `shared/ipcContract.ts` — the single source of truth (new, pure TS)

- `INVOKE_METHODS`: `{ [preloadMethodName]: channel }` as const — every
  renderer→main request (49 invoke channels). `SEND_METHODS`: the one
  fire-and-forget (`resolveWindowCloseRequest → window:closeRequestResolved`).
  `EVENT_METHODS`: `{ [onXxx]: channel }` — every main→renderer event that
  main actually emits (12; `window:requestClose` arrives via `app:command`
  routing and stays as is).
- `ARG_SHAPERS`: the five methods whose preload wrapper boxes positional
  arguments into an object (`pickMedia`, `sendSlide`, `setPresentationSessionSlides`,
  `startCountdown`, `refreshLiveSlide`) — kept byte-identical so main's
  destructuring is untouched.
- Types: `Envelope<T>`, `IpcInvokeMap` (args + data per channel; domain
  payloads are `unknown`-typed records for now — **this plan types the
  contract's shape and exhaustiveness, not the domain models**, which do not
  exist as TS types yet; stated as the next ratchet), `ElectronApi` (the exact
  `window.electronAPI` surface, derived from the three tables).
- Helpers: `ok(data)`, `fail(error)`, `isEnvelope(value)`, `errorMessage(e)`.

### `electron/main/ipcRegistry.ts` — enforced envelope (new rollup entry)

`createIpcRegistry(ipcMain, { log })` → `{ handle, on, assertComplete }`.

- `handle(channel, fn)`: throws at registration if `channel` is not in the
  contract; wraps `fn` so that a sync or async **throw becomes
  `fail(message)`** (logged), **`undefined` becomes `ok()`**, and a
  **non-envelope return becomes `fail('handler returned a non-envelope')`**
  (logged) — the renderer can never receive anything but an envelope.
- `assertComplete()`: throws naming every contract channel with no handler.
  Called at the end of `registerIpcHandlers()`, so a missing handler fails at
  launch (the E2E launch spec catches it), not on first click.
- `electron/main/index.js`: every `ipcMain.handle(` → `ipc.handle(`, every
  `ipcMain.on(` → `ipc.on(` (mechanical; the existing try/catch blocks stay —
  they are correct, just no longer the only line of defence).

### `electron/preload/index.js` — generated from the contract

Builds `electronAPI` by iterating the three tables (+ shapers). Method names
and signatures are unchanged, so the renderer surface is identical. Adds
`// @ts-check` with the `ElectronApi` type: the first file of the IPC seam to
opt in, per the tsconfig ratchet.

### `src/utils/ipc.ts` — the only door (renamed from `.js`)

One typed export per contract method (imports resolve `@/utils/ipc` unchanged;
tests that mock the module keep working). Adds the wrappers the bypass sites
need (`platform`, window controls, preview state, every `onXxx` subscription).
`src/types/electron-api.d.ts` declares `Window.electronAPI: ElectronApi`.

### The nine bypass sites

Each switches to the `ipc.ts` wrapper. Behaviour identical; the optional-chain
guards (`api?.onOutputBlack?.`) go away because the wrapper is always present.

## Rules that make it self-enforcing (tests, written first)

1. `shared/__tests__/ipcContract.test.ts`: channels unique across the three
   tables; every method name unique; `isEnvelope` / `ok` / `fail` behaviour.
2. `electron/main/__tests__/ipcRegistry.test.ts` (fake `ipcMain`): unknown
   channel throws at registration; sync throw → `fail`; async throw → `fail`;
   `undefined` → `ok`; non-envelope → `fail` + logged; envelope passes through
   untouched; `assertComplete` names each missing channel; `on` registers.
3. `electron/main/__tests__/ipcChannels.test.ts` (rewritten): contract ↔ main
   registrations (regex, comments stripped) equal sets; contract methods ↔
   `ipc.ts` exports equal sets; **no `electronAPI` identifier anywhere under
   `src/` except `src/utils/ipc.ts`** (the bypass guard).
4. E2E: the existing 16 specs exercise launch-time `assertComplete`, the
   presentations/journal/settings/songs channels, and window close. A
   presenting-flow E2E is still the C1 gap, not this plan's.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

## Bounded blast radius

| File                                                                          | Action                                                                      |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `shared/ipcContract.ts`, `shared/__tests__/ipcContract.test.ts`               | create                                                                      |
| `electron/main/ipcRegistry.ts`, `electron/main/__tests__/ipcRegistry.test.ts` | create                                                                      |
| `electron/main/index.js`                                                      | `ipcMain.handle/on` → registry; `assertComplete()`; no handler body changes |
| `electron/main/__tests__/ipcChannels.test.ts`                                 | rewrite against the contract                                                |
| `electron/main/__tests__/lifecycleListeners.test.ts`                          | add the two new rollup entries to the guard                                 |
| `electron.vite.config.js`                                                     | entries `main/ipcRegistry`, `shared/ipcContract`                            |
| `electron/preload/index.js`                                                   | generated from the contract; `@ts-check`                                    |
| `src/utils/ipc.js` → `src/utils/ipc.ts`; `src/types/electron-api.d.ts`        | typed wrappers; window type                                                 |
| the nine bypass files                                                         | call the wrapper instead of `window.electronAPI`                            |
| `vitest.config.mjs`                                                           | thresholds only                                                             |
| `tasks/fable-notes.md`, `tasks/fable-pass-plan.md`                            | record                                                                      |

**Do NOT modify:** any handler's logic, any channel name, any renderer
behaviour, E2E specs.

### Sanctioned escape hatch — none.

## Todos

- [x] 1. Contract + registry + guard tests written; FAIL pasted (modules absent; bypass guard names the nine files).
- [x] 2. Contract, registry, preload, `ipc.ts`, d.ts. Contract/registry tests green.
- [x] 3. Main registration swap + `assertComplete`. Build; `out/main/ipcRegistry.js` and `out/shared/ipcContract.js` exist; launch spec green.
- [x] 4. Bypass sites; bypass guard green; gate; E2E ×2; `dist:dir` launch (preload is generated now — the packaged path must be proven).
- [x] 5. Record; PR with findings.

## Compliance Manifest — `writing-executable-plans.mdc`

| Item                | Disposition                                                            |
| ------------------- | ---------------------------------------------------------------------- |
| Assertion weakening | clause verbatim                                                        |
| List sampling       | counts stated: 49 invoke, 1 send, 12 events, 5 shapers, 9 bypass files |
| Quantifier erosion  | "every", "no `electronAPI` outside ipc.ts"                             |
| Escape hatch        | none                                                                   |
| Blast radius        | table; do-not-touch                                                    |
| IPC pinning         | contract is the pin; channel set unchanged from S1                     |
| Findings report     | required                                                               |

### `testing-standards.mdc`

| #   | Disposition                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | tests first; failure pasted                                                                                                                         |
| 2   | `ipcChannels.test.ts` rewrite stated; `appCommands.closeGuard.test.ts` stubs `electronAPI` and keeps working because `ipc.ts` reads it at call time |
| 3   | verbatim                                                                                                                                            |
| 8   | fake `ipcMain`; no Electron import in unit tests                                                                                                    |
| 10  | `N/A`                                                                                                                                               |

## Findings (2026-09-06)

- TDD: all three test files failed to load before the modules existed; the
  bypass guard then named all nine files; the export guard caught the generic
  wrapper signatures it did not yet parse.
- **Preload must be ESM.** electron-vite bundles only ES imports into the
  preload output; a CommonJS `require('../../shared/ipcContract')` was left
  external and the app launched with no `electronAPI` at all (E2E 8/16 red).
  Preload is now `electron/preload/index.ts` and the contract is inlined into
  `out/preload/index.js` (verified: one `require("electron")`, contract strings
  present). Recorded in the file header so nobody undoes it.
- `platformShortcuts.js` already exported its own `getPlatform`; the wrapper's
  static getter is `getElectronPlatform` and is defensive for bare-Node tests.
- Behaviour-change test edit (stated): `appCommands.closeGuard.test.ts` mocked
  `window.electronAPI` for the window controls; it now mocks `@/utils/ipc`,
  because that is the only door. Same assertions, same counts.
- Gate 25 files / 225 tests; lint 0 errors / 15 warnings; E2E 16/16 ×2;
  packaged app probe: `window.electronAPI` present with 63 members (49 + 1 +
  12 + `platform`), `getSongs()` returned a success envelope with 7 rows.
- Coverage 6.78/5.51/6.14/7.14 → 7.41/5.87/6.75/7.79; thresholds raised.
