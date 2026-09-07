# Executable Plan E1 — Colour tokens + a lint rule that bans raw hex in JSX

**Workstream:** E (Design system & UX consistency) · **Decision (Ethan, 2026-09-06):** tokens + keyboard operability, lint rule banning raw hex, no visual redesign.
**Category:** one — colour literals in component code.

## Honest scope note (read first)

Ethan's decision names three things: (1) hex values → tokens, (2) a lint rule
banning raw hex in JSX, (3) inline styles → tokens. This plan does (1) and (2)
**completely** and makes them self-enforcing. It does **not** convert the 490
`style={{ … }}` objects to classes: that is a visual refactor with no
regression net — there is no screenshot harness — and "no visual redesign"
cannot be _proven_ for it. The right order is: a Playwright screenshot
baseline of the main screens first (E2, small), then the inline-style
conversion behind it (E4). Recorded in fable-notes for Ethan.

Keyboard operability is E3 (its own plan).

## Measured (2026-09-06)

184 raw hex literals in `src/**/*.{jsx,js}`; 30 existing tokens in
`src/styles/globals.css` (single light theme, `:root` only). The literals
split into two kinds:

| Kind                                                                                                                                                                                                                                                                                                                         | Count | Handling                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Data values** — colour _choices_ the user picks or that get persisted: the formatting-toolbar swatch palettes, the toolbar swatch palette, section-type colours, text-box / template defaults, output-settings defaults, the Home template themes (gradients + accents), `<input type="color">` values (which require hex) | ~95   | Move into data modules (`src/utils/colorPalettes.js`, template data) that the rule does not cover; default-value fallbacks (`style.color                                                                                                                                                                                                                                                      |     | '#ffffff'`) come from named constants in those modules |
| **UI chrome** — a component painting its own surface/text with a literal                                                                                                                                                                                                                                                     | ~89   | Replace with `var(--token)` of the **identical value**: existing tokens where the value already matches (`--bg-canvas` = `#1a1a1a`, `--accent` = `#4a7cff`, `--danger` = `#dc2626`, `--live` = `#16a34a`), new value-exact tokens for the rest (`--text-on-accent: #ffffff`, `--projector-bg: #000`, `--danger-bright: #ef4444`, a small on-dark grey scale …). Same pixels, by construction. |

## Rule (self-enforcing)

`eslint.config.mjs`, files `src/**/*.jsx`: `no-restricted-syntax` on any
string/template literal containing `#[0-9a-fA-F]{3,8}`. Data modules are
`.js` (not matched) and are the only place a hex may live. Zero violations at
merge; `--max-warnings 0` already guards the rest.

## Tests

- `src/styles/__tests__/tokens.test.ts`: every token referenced by
  `var(--…)` in `src/**/*.jsx` is defined in `globals.css` (a typo'd token is
  invisible at runtime — the colour silently falls back).
- The lint rule itself, proven by a fixture run.
- E2E 20/20 as the "nothing broke" net; a packaged-app launch.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

## Blast radius

`src/styles/globals.css` (tokens added, none changed), `eslint.config.mjs`,
new `src/utils/colorPalettes.js`, the ~20 component files listed by the
inventory (colour literals only), the token test, tasks records.

### Sanctioned escape hatch — none.

## Todos

- [x] 1. Token test written (fails on nothing yet — it is a guard); lint rule added and shown to fail on current code (count pasted).
- [x] 2. Tokens + palette module + per-file conversions; rule at zero; gate; E2E; packaged launch.
- [x] 3. Record; PR.

## Findings (2026-09-06)

- Rule red on current code: **147** raw hex literals in `src/**/*.jsx`; after
  the pass: **0** in JSX (from 184 across `src/`; the 37 that remain are in
  data modules — section-type colours, text-box and template defaults, the
  swatch palettes, the Home template themes — where hex is the right type).
- 26 tokens added to `globals.css`, every one the exact value the component
  painted with before (`--white`, `--text-on-accent`, `--projector-*`,
  `--danger-bright`, `--live-hover`/`--live-outline`, `--dirty`/`--saved`,
  three Home-specific values, an 11-step on-dark grey scale). No token's
  value changed, so no pixel changed; `var(--danger, #ef4444)` fallbacks
  were dead (`--danger` is defined) and were dropped.
- New data modules: `src/utils/colorPalettes.js` (swatch palettes, text-box
  defaults, the two checkerboard gradients) and `src/utils/templateVisuals.js`
  (the Home template themes moved out of `Home.jsx`).
- Token guard test: every `var(--…)` under `src/` is defined — it found no
  pre-existing typo, which is itself worth knowing.
- Gate 37 files / 304 tests; lint clean; E2E 20/20 (Home, editor, output
  window all render through the new tokens).
