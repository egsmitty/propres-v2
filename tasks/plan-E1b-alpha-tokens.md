# Executable Plan E1b — Colour literals with alpha → token opacity modifiers

**Workstream:** E · **Charter row:** "E1b rgba literals → alpha tokens".
**Category:** one — a colour written as a literal becomes the same colour written as its token, proven identical.

## Measured (2026-09-07, `main` after C2)

| Fact                                              | Value                                                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `rgba(…)` literals in JSX                         | **146**, 19 base colours, in 22 files                                                                                                            |
| … in class strings (Tailwind arbitrary values)    | **63**: `shadow-[…]` 23, `bg-[…]` 21, `border-[…]` 13, `text-[…]` 6                                                                              |
| … in JavaScript (inline style objects, ternaries) | 83 — the dynamic values E4 left inline; out of scope here                                                                                        |
| Class-string literals whose base is a token       | **29** in 13 files: accent `#4a7cff`, white, black, danger `#dc2626`, dirty `#f97316` — 21 distinct alphas, every one a whole percent            |
| Class-string literals with no token base          | 9 (`rgb(18,18,18)`, `rgb(15,23,42)`, `rgb(47,115,255)`, …) and the 23 shadows — stay literal                                                     |
| The design decision E1 deferred                   | gone: Tailwind 4 writes `bg-accent/12` as `color-mix(in oklab, var(--color-accent) 12%, transparent)`, which works on the hex tokens as they are |

## Decisions

1. **Only class strings, only token bases.** `bg-[rgba(74,124,255,0.12)]` →
   `bg-accent/12`; `border-[rgba(255,255,255,0.18)]` → `border-white/18`;
   `text-[rgba(255,255,255,0.92)]` → `text-white/92`. The 9 non-token bases
   and the 23 shadow literals stay as they are (a shadow's colour goes
   through `--tw-shadow-color`, a different mechanism, and none of those
   bases is a token).
2. **The pixels decide whether `color-mix` is exact.** Mixing with
   `transparent` in premultiplied OKLab leaves the colour and sets the
   alpha, then round-trips to sRGB; if any channel lands off by one, the
   52-capture strict compare says so, and that finding ends the plan
   honestly rather than adding tolerance.
3. **No new lint rule yet.** A ban on `rgba(` in JSX would also hit the 83
   dynamic values; that is a follow-up once those move.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

## Blast radius

Class strings in 13 `.jsx` files; records.

### Sanctioned escape hatch — none.

## Todos

- [x] 1. Script the 29 replacements (class strings only); gate.
- [x] 2. Strict compare on all 52 captures.
- [x] 3. Record; PR.

## Findings (2026-09-07)

- 29 replacements in 13 files; gate 315 green.
- **`color-mix` is pixel-exact here:** Tailwind 4 emits `bg-accent/8` as
  `color-mix(in oklab, var(--color-accent) 8%, transparent)` (with a plain
  fallback under `@supports`), and the strict compare came back at **0
  differing pixels on all 52 captures** — the premultiplied mix with
  `transparent` keeps the channels and only sets the alpha.
- Left literal, by decision: 9 class-string colours whose base is no token
  and the 23 shadow literals; and the 83 in JavaScript, which are E4's
  dynamic values.
