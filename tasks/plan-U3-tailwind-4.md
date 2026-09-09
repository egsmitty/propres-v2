# Executable Plan U3 — Tailwind 4

**Workstream:** U (upgrades) · **Charter:** "U3 Tailwind 4 as its own plan".
**Category:** one — a build-tool major with a pixel-exact "nothing changed" proof.

## Why now

E2 built a 52-capture screenshot net and E4/E4b moved every static style
and hover look into Tailwind classes. A Tailwind major is exactly the change
that net was built to prove: the CSS engine changes, the app must not.
Dependabot has been holding the major (#60 closed with an ignore rule).

## Measured (2026-09-07, `main` after E4b)

| Fact                                        | Value                                                                                                                                                                                                 |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Installed / latest                          | tailwindcss 3.4.19 / **4.3.3**; `@tailwindcss/postcss` 4.3.3                                                                                                                                          |
| Pipeline                                    | PostCSS (`postcss.config.cjs`: tailwindcss + autoprefixer) under electron-vite 5 / Vite 7                                                                                                             |
| Config                                      | `tailwind.config.js`: `content` globs + 54 colour keys and 1 background image, all `var(--token)` (E4 slice 0); `tailwindTokens.test.ts` pins config ↔ stylesheet                                     |
| Utilities whose meaning changes in v4       | bare `rounded` **165**, bare `shadow` **46**, bare `blur` **5**, `outline-none` **1** (v4 shifts the scale: `rounded` → 0.125rem, `shadow` → the old `shadow-sm`, `outline-none` → no outline at all) |
| Bare `border` with no colour on the element | **0** after a precise scan (a rough grep said 13; every `border` in the JSX carries a colour or an inline border) — v4's default border colour is `currentColor`, v3's was gray-200                   |
| `space-x/y`                                 | 2 (v4 changes the selector; visually the same in a simple flex row)                                                                                                                                   |
| Removed/renamed things we do not use        | `@apply` 0, `theme()` 0, `bg-opacity-*` 0, `!important` prefix 0, `flex-shrink-*` 0, `[--var]` shorthand 0                                                                                            |
| Preflight changes that matter               | buttons default to `cursor: default` (v3: pointer); placeholder colour becomes currentColor at 50 %; `hover:` only applies under `@media (hover: hover)`                                              |

## Decisions

1. **Value-identical, class by class.** Every utility whose scale moved is
   renamed to the v4 name that produces the _same_ CSS: `rounded` →
   `rounded-sm`, `shadow` → `shadow-sm`, `blur` → `blur-sm`, `outline-none` →
   `outline-hidden`. Word-boundary replacements only; `rounded-full`,
   `rounded-[28px]`, `shadow-2xl` are untouched.
2. **Borders keep their colour.** Any bare `border` without a colour would
   get `border-gray-200` (v3's default); the precise scan found none, so
   nothing to do. The hex ban in JSX is not touched.
3. **Config moves into the stylesheet.** `tailwind.config.js` is deleted;
   `globals.css` starts with `@import 'tailwindcss'` and an `@theme` block
   that names every token the same way (`--color-bg-surface: var(--bg-surface)`
   → `bg-bg-surface` still works). `tailwindTokens.test.ts` reads the
   `@theme` block instead of the config; the drift guarantee is unchanged.
4. **v3 behaviours we keep, explicitly:** `@custom-variant hover (&:hover)`
   (v4's media-query hover would never fire on a runner without a pointing
   device and would change touch behaviour); a base rule restoring
   `cursor: pointer` on enabled buttons; the placeholder colour restored to
   v3's value. Each is a line in `globals.css` with a comment saying why.
5. **PostCSS stays.** `@tailwindcss/postcss` replaces `tailwindcss` and
   `autoprefixer` in `postcss.config.cjs` (v4 prefixes itself).
6. **Proof:** local base capture on `main`, upgrade, strict compare — **0
   differing pixels on all 52 captures**; gate; then CI at its own
   baselines. Anything that differs is investigated, never tolerated.
7. **Dependabot:** the `tailwindcss` major ignore rule is removed in the same
   PR.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

## Blast radius

`package.json` / lockfile, `postcss.config.cjs`, `tailwind.config.js`
(deleted), `src/styles/globals.css` (head), `src/__tests__/tailwindTokens.test.ts`,
the `.jsx` files that carry the renamed utilities (class strings only),
`.github/dependabot.yml`.

### Sanctioned escape hatch — none.

## Todos

- [x] 1. Base capture on `main`; branch; install; config → `@theme`; renames;
      base rules; tokens test; gate.
- [x] 2. Strict compare, investigate every differing capture to a root cause.
- [x] 3. PR with the findings; Dependabot rule removed.

## Findings (2026-09-07)

Four root causes stood between "installed" and "0 differing pixels on all
52 captures". None was a Tailwind bug; each was a v3 habit the new engine
no longer forgives, and each is now one commented line in `globals.css`.

1. **Real cascade layers.** v4 emits utilities inside `@layer utilities`; an
   _unlayered_ rule beats a layered one whatever its specificity. The app's
   `* { margin: 0; padding: 0 }` reset therefore silenced every `p-*`/`m-*`
   utility — the "Back to Home" button lost its padding, every screen
   collapsed by 16–34 %. The element resets now live in `@layer base`, which
   is the precedence v3's flat output gave them (below utilities). Rules with
   class-level specificity (`:focus-visible`, the scrollbar pseudo-elements)
   stay unlayered: in v3 they beat utilities by order, and still do.
2. **Dynamic spacing.** v3 had a fixed spacing scale, so `px-4.5` and
   `pb-4.5` on Home's hero template card produced no CSS at all; v4 computes
   any multiple and painted 18px that had never been there. The two classes
   are removed; a scan found no others outside the v3 scale. This is a
   latent design intent Ethan may want back — recorded, not restored.
3. **Unitless line-heights.** v4's theme defines `--text-xs--line-height` as
   `calc(1 / 0.75)`; v3 used `1rem`. A child with a smaller font inherits a
   ratio, not a length: the shortcuts overlay's 11px `<kbd>` went from 16px
   to 14.67px. The theme now pins the v3 values for `xs`…`4xl`.
4. **Source detection.** Left to itself the scanner picked up class names
   from docs and tests; the sources are declared (`@source '../'`,
   `index.html`) with `source(none)`.

Also changed, deliberately: `rounded` → `rounded-sm`, `shadow` → `shadow-sm`,
`blur` → `blur-sm`, `outline-none` → `outline-hidden` (68 renames, class
strings only — a first script that renamed inside any string also renamed a
`.blur()` call and a `'blur'` event name; caught by lint, redone scoped);
`@custom-variant hover (&:hover)` keeps `hover:` working on a runner with
no pointing device; a base rule keeps the pointer cursor on buttons and the
v3 placeholder colour. `autoprefixer` is gone (v4 prefixes itself);
`tailwind.config.js` is gone; `tailwindTokens.test.ts` now pins the `@theme`
block to the token definitions.

Proof: gate green (315 tests); **0 differing pixels on all 52 captures**;
then CI at its own baselines.

- **2026-09-09, Ethan's decision on finding 2:** the hero card's 18px
  padding was the intent. `px-4.5 / pb-4.5` are back and now paint; Home's
  baselines were recaptured on the runner for it (a deliberate visual
  change, the first since E2 began).
