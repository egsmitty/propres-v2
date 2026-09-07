# Executable Plan U2 — React 19

**Workstream:** U (upgrades) · **Charter:** "U2 React 19 as its own plan".
**Category:** one — a runtime major with the unit suite, the E2E suite and the screenshot net as the proof.

## Measured (2026-09-07, `main` after U3)

| Fact                                  | Value                                                                                                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Installed / latest                    | react + react-dom 18.2 / **19.2.8**; @types/react 18.3.31 / **19.2.18**; @types/react-dom 18.3.7 / **19.2.7**                                        |
| Removed-in-19 APIs in use             | **none**: no `forwardRef`, `defaultProps`, `propTypes`, string refs, `react-dom/test-utils`, `findDOMNode`, `unmountComponentAtNode`, legacy context |
| Root                                  | `createRoot` already (1 site)                                                                                                                        |
| `act`                                 | imported from `@testing-library/react` in 3 tests (the supported source)                                                                             |
| Types that changed in @types/react 19 | `useRef()` with no argument: 0; global `JSX.*`: 0; `React.ComponentProps`: 1 (unchanged in 19)                                                       |
| Ecosystem                             | @testing-library/react 16.3 (supports 19), zustand 5, lucide-react 1.41, @vitejs/plugin-react 5, eslint-plugin-react-hooks 7 — all React-19-ready    |
| Compiler / immutability               | plan D1 already made state updates compiler-safe; no compiler plugin is added here                                                                   |

## Decisions

1. **Runtime and types together**, nothing else: react, react-dom,
   @types/react, @types/react-dom to 19.2. No new feature is adopted (no
   `use`, no Actions, no `ref` cleanup functions) — that is a separate plan
   if ever wanted.
2. **Behavioural changes to watch, and how each is proven:**
   - Effects/StrictMode timing and `useSyncExternalStore` (zustand): the
     unit suite (315) and the 30 E2E specs.
   - Hydration and rendering: the **52-capture strict compare** must stay at
     0 differing pixels.
   - `act` environment warnings and any console error during tests: the gate
     runs with warnings as failures where they already do; new console
     errors in the E2E fixture's stderr are read, not ignored.
3. **Types:** whatever `tsc` reports is fixed at the site with the 19-correct
   type, never with a cast.
4. **Dependabot:** the four React-major ignore rules are removed in the same
   PR.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

## Blast radius

`package.json` / lockfile; type fixes at whatever sites `tsc` names;
`.github/dependabot.yml`. No component logic.

### Sanctioned escape hatch — none.

## Todos

- [x] 1. Install; gate (type-check first — the types are where 19 bites).
- [x] 2. E2E suite; strict compare on all 52 captures; read the app's stderr
      from the fixture for new React warnings.
- [x] 3. PR with the findings; Dependabot rules removed.

## Findings (2026-09-07)

- **Zero type errors, zero code changes.** `tsc` under @types/react 19 had
  nothing to say; the D-workstream work (derive-don't-sync, immutability,
  no legacy APIs) had already left nothing for 19 to break.
- Gate 315 green; **29 E2E specs green, the 8 visual specs at
  `VISUAL_STRICT=1` — 0 differing pixels on all 52 captures.**
- A throwaway spec drove Home → editor → song insert → text mode → shortcuts
  overlay while collecting every renderer console error/warning and the
  main-process stderr: **no React warning at all.** The single message is
  Electron's own "Insecure Content-Security-Policy" warning — pre-existing,
  not React, and worth its own small plan (C2: a CSP for the renderer).
- Dependabot's four React-major holds are lifted.
