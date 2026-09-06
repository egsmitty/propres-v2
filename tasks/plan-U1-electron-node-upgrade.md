# Executable Plan U1 — Electron 29 → 44, Node 20 → 22, toolchain

**Workstream:** U (Upgrades) · **Depends on:** P2 (E2E harness), A1–A3b merged
**Decision (Ethan, 2026-09-06):** plan U1 next, after A2, behind the E2E harness; Node 20 → 22 with it.

## Why now

Electron 29 left support in 2024 (three-major window). Every Chromium and Node security fix since then is missing from the shipped app. Three dependency lines are blocked on it: `@electron/rebuild` 4 (Node ≥ 22.12), `electron-vite` 5 (Vite 7, Node ≥ 20.19/22.12), and `better-sqlite3` 13 (Node ≥ 22).

## Targets (all verified against npm on 2026-09-06)

| Package                    | From                          | To                                 | Constraint that fixed the choice                                           |
| -------------------------- | ----------------------------- | ---------------------------------- | -------------------------------------------------------------------------- |
| electron                   | 29.4.6                        | **44.2.0**                         | npm `latest`; bundles Node 24.20 / Chrome 152 / ABI 149                    |
| electron-vite              | 2.3.0                         | **5.0.0**                          | peers `vite ^5 \|\| ^6 \|\| ^7` — so **not** Vite 8                        |
| vite                       | 5.4.21                        | **7.3.6**                          | satisfies electron-vite 5, vitest 4 (`^6 \|\| ^7 \|\| ^8`), plugin-react 5 |
| @vitejs/plugin-react       | 4.2.1                         | **5.2.0**                          | plugin-react 6 peers `vite ^8` only                                        |
| better-sqlite3             | 9.6.0                         | **13.0.3**                         | Node ≥ 22; 13.0 moved to N-API                                             |
| @electron/rebuild          | 3.7.2                         | **4.2.0**                          | Node ≥ 22.12                                                               |
| @types/node                | absent                        | **^22**                            | matches the dev runtime                                                    |
| Node (`.nvmrc`, `engines`) | 20                            | **22** (22.23.2 installed via nvm) | Ethan's decision; 22 is LTS to 2027-04                                     |
| actions/setup-node         | v4 in `e2e.yml`, v7 elsewhere | **v7 everywhere**                  | consistency                                                                |

Not touched: electron-builder (26.x, Node ≥ 14, already current), Playwright 1.63 (current), React, Tailwind, TypeScript (pinned 5.x by the typescript-eslint decision).

## Breaking-change review, Electron 30 → 44 (source: `docs/breaking-changes.md`, main)

Items that touch this code — **none require a code change**:

| Version | Item                                                       | This app                                                                                                                                          |
| ------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 32      | `File.path` removed → `webUtils.getPathForFile`            | Not used: media import goes through `dialog.showOpenDialog` (`electron/main/index.js:1176`, `:1215`); no renderer code reads `.path` off a `File` |
| 33      | `registerFileProtocol` broken on Windows paths             | Already on `protocol.handle`                                                                                                                      |
| 33 / 38 | macOS 10.15 then 11 dropped → **macOS 12+**                | README requirement updated                                                                                                                        |
| 33      | native modules need C++20                                  | better-sqlite3 13 builds with it (and is N-API)                                                                                                   |
| 36      | `app.commandLine` lower-cases switches                     | `app.commandLine` not used; `--user-data-dir` is Chromium's own switch and stays                                                                  |
| 38      | `plugin-crashed` event removed                             | Not used; main already listens to `render-process-gone`                                                                                           |
| 40      | `clipboard` from renderer deprecated                       | Renderer never imports Electron (contextIsolation on, nodeIntegration off at `index.js:668`, `:846`, `:933`)                                      |
| 42      | `electron` no longer downloads its binary in `postinstall` | **Must verify** CI + Playwright still find a binary after `npm ci` — todo 3                                                                       |
| 43      | dialogs default `defaultPath` to Downloads                 | Media import dialog will open in Downloads instead of the last folder. Accepted; recorded in notes as a possible follow-up                        |
| 44      | `window.open` children sandboxed                           | `window.open` not used; all windows are `BrowserWindow`s from main                                                                                |

Ruled out (checked by grep, one line each): BrowserView (30, not used); WebSQL (31); `nativeImage.toDataURL`/`toBitmap` colour space (31/43, only `createFromPath`); `flashFrame` (31); `navigationHistory` deprecations (32, not used); `textured` window type, `accessibilityDisplayShouldReduceTransparency` (33); menu bar fullscreen on Windows (34, no menu bar shown fullscreen); `setPreloads`/`getPreloads`, `console-message` args, `WebRequestFilter.urls` (35, none used); `PrinterInfo`, `clearStorageData`, `session.extensions`, `isAeroGlassEnabled`, GTK 4 (36, none); utility process / WebUSB / WebSerial / `ProtocolResponse.session` (37, none); ozone / XDG env (38, Linux); `--host-rules`, popups resizable, `desktopCapturer` plist, OSR (39, none); dSYM (40); PDF WebContents, cookie change cause (41, none); notifications, OSR scale, `clearStorageData.quotas`, `hslShift` (42, none); Linux rounded corners / WCO, `chrome.scripting`, `showHiddenFiles` (43, none); `display-capture`, `requestStorageAccessFor`, ASAR fds (44, none — ASAR fds only matter for native code or child processes reading files out of the asar; better-sqlite3 is unpacked by electron-builder).

## electron-vite 2 → 5 (source: CHANGELOG.md)

- 4.0: Node ≥ 20.19/22.12; Vite 7; **ESM-only distribution**. Our `electron.vite.config.js` uses ESM syntax plus `__dirname`; electron-vite bundles the config, so `__dirname` is expected to keep working — **verify in todo 4**, else switch to `import.meta.dirname`.
- 5.0: config interfaces restructured; nested config fields no longer accept functions (we pass none); `externalizeDepsPlugin` **deprecated** in favour of `build.externalizeDeps` — migrate if a deprecation warning appears; new `isolatedEntries` option for preload/renderer (not needed; the main-process CJS entries stay as explicit `rollupOptions.input`). `@swc/core` peer is optional (bytecode only).
- Guard that must keep passing: `electron/main/__tests__/lifecycleListeners.test.ts` pins the main rollup entries, and the E2E fixture launches `out/main/index.js`. The `out/` layout must not change.

## better-sqlite3 9 → 13

10: adds Node 22; 11: drops Node 21 / Electron 25; 12: drops Node 18 / Electron 26–28, adds Node 24; **13: N-API** — "prebuilt binaries across different versions of Node.js and Electron". No API changes affect us (`prepare/run/get/all/exec/transaction/pragma/backup` unchanged).

**Open question, settled by evidence in todo 5:** with an N-API build, one binary should load under both Node 22 (Vitest) and Electron 44. If `new Database(':memory:')` works in both from the same `build/` output, the `postinstall` rebuild is redundant and the "never instantiate better-sqlite3 in unit tests" trap (memory + notes) is retired. If it does not, keep `electron-rebuild` and the trap stands.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

## Bounded blast radius

| File                                                      | Action                                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `presenter-pro/package.json`, `package-lock.json`         | version bumps; `engines.node >=22.12.0`; `postinstall` per todo 5                          |
| `.nvmrc`                                                  | `20` → `22`                                                                                |
| `.github/workflows/e2e.yml`                               | `setup-node@v4` → `@v7`                                                                    |
| `.github/dependabot.yml`                                  | remove the `@electron/rebuild` ignore; keep the TypeScript one                             |
| `presenter-pro/electron.vite.config.js`                   | only if electron-vite 5 requires it (todo 4)                                               |
| `presenter-pro/electron/main/__tests__/toolchain.test.ts` | create — pins that `.nvmrc`, `engines.node` and `@types/node` agree on the same Node major |
| `README.md`                                               | macOS 12+ requirement; nothing else                                                        |
| `tasks/fable-notes.md`, `tasks/fable-pass-plan.md`        | record                                                                                     |

**Do NOT modify:** any renderer code, any main-process behaviour, migrations, E2E specs (they are the verification — if one fails, that is a finding, not a spec to edit), lint/coverage floors.

### Sanctioned escape hatch — none.

## Todos (each with its verification) — all done 2026-09-06, evidence in PR

1. **Test first:** `toolchain.test.ts` asserting the Node-major agreement fails against `.nvmrc = 20` with no `@types/node`. _Verify:_ FAIL pasted.
2. `.nvmrc` 22, `engines`, `@types/node`; `nvm use 22`; bump every target in the table with `npm install` (scripts allowed — the rebuild must run). _Verify:_ `npm ls electron electron-vite vite better-sqlite3 @electron/rebuild` shows the targets; the new test passes.
3. **Electron binary on demand (42+).** After `rm -rf node_modules && npm ci`, check `node_modules/electron/dist` exists; if not, determine what triggers the download (`npx electron --version`) and add that step where it is needed (a `postinstall` step is the durable fix — CI, Dependabot lockfile refreshes and fresh clones all go through it). _Verify:_ fresh `npm ci` → `npx playwright test e2e/launch.spec.ts` passes without manual steps.
4. `npm run build` under electron-vite 5. _Verify:_ zero deprecation warnings in the build log, `out/main/index.js`, `out/preload/index.js`, `out/renderer/index.html` present, `lifecycleListeners.test.ts` green.
5. **better-sqlite3 N-API check.** Under Node 22: `node -e "new (require('better-sqlite3'))(':memory:').prepare('select sqlite_version() v').get()"`; under Electron 44: same via `ELECTRON_RUN_AS_NODE=1 npx electron -e …`. Both succeed from one binary → remove `postinstall` rebuild, keep `@electron/rebuild` only if electron-builder still needs it (it does not: builder runs its own `install-app-deps`; it will be dropped entirely then). _Verify:_ the E2E migrations specs (real SQLite inside Electron) pass either way.
6. Gate, `format:check`, E2E ×2, `npm run verify:db` on the real library DB, `npm run dist:dir` and launch `dist/mac-arm64/PresenterPro.app` once with a temp `--user-data-dir` to prove the packaged native module loads. _Verify:_ all pasted in the PR.
7. Docs + Dependabot ignore + close #26 as superseded. Findings report in the PR.

## Compliance Manifest — `writing-executable-plans.mdc`

| Item                | Disposition                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assertion weakening | clause verbatim; E2E specs are off-limits                                                                                                                                 |
| List sampling       | every breaking-change item 30–44 listed as touching or ruled out                                                                                                          |
| Quantifier erosion  | "zero deprecation warnings", "every target", "both runtimes"                                                                                                              |
| Escape hatch        | none                                                                                                                                                                      |
| Blast radius        | 9-file table; do-not-touch list                                                                                                                                           |
| Pitfalls            | Electron 42 on-demand download; ESM-only electron-vite config; N-API may retire the ABI trap; Dependabot lockfiles must be refreshed with `--ignore-scripts` (still true) |
| IPC pinning         | `N/A — no channel change`                                                                                                                                                 |
| Manual verification | packaged app launch in todo 6                                                                                                                                             |
| Findings report     | required                                                                                                                                                                  |

### `testing-standards.mdc`

| #   | Disposition                                                 |
| --- | ----------------------------------------------------------- |
| 1   | toolchain test before the bump, failure pasted              |
| 2   | no existing test edited; if one must change it is a finding |
| 3   | verbatim                                                    |
| 4–5 | one assertion per agreement; lint floor                     |
| 7   | gate                                                        |
| 8   | E2E is the integration proof                                |
| 10  | `N/A`                                                       |

## Findings (2026-09-06)

- TDD proof: toolchain test failed on `.nvmrc = 20` / no `@types/node` before the bump.
- **better-sqlite3 13 is N-API with prebuilds for 8 platforms.** One binary
  loaded under Node 22.23 and under Electron 44 (Node 24.20, ABI 149). The
  `postinstall` rebuild and `@electron/rebuild` were removed; `build.npmRebuild`
  set to `false` so electron-builder does not node-gyp the prebuilt module. The
  packaged app was launched from `dist/` with a temp user-data dir and ran
  migrations 1–4 on real SQLite. **The "never instantiate better-sqlite3 in
  unit tests" trap is retired** — see fable-notes for the follow-up opinion.
- **Electron 42+ downloads its binary on first use, not on install.**
  `require('electron')` spawns the installer itself, so Playwright's launch
  after a clean `npm ci` self-heals (proven: dist absent after `npm ci`, launch
  spec passed, dist present after). No workflow change needed.
- electron-vite 5 built with zero deprecation warnings; `out/` layout unchanged;
  `externalizeDepsPlugin` still accepted (deprecated only in name — migrate when
  it warns).
- Electron breaking changes 30–44: none required code changes (table above).
  Behaviour noted: open dialogs now default to Downloads (43).
