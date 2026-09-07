# Executable Plan C2 — A Content-Security-Policy for the renderer

**Workstream:** C (lifecycle / process hygiene) · found during U2: Electron prints
"Insecure Content-Security-Policy" for every renderer window.
**Category:** one — the built app declares what its windows may load; nothing it loads today changes.

## Measured (2026-09-07)

| Fact           | Value                                                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows        | main, output, stage display — all `loadFile(out/renderer/index.html)` in the built app (`file:` origin), `loadURL(dev server)` in dev                          |
| Scripts        | one bundled module script; no inline script, no `eval`/`new Function`, no workers, no WebSocket, no `fetch` in the renderer                                    |
| Styles         | one bundled stylesheet; **197 inline `style=` attributes remain** (plan E4's dynamic ones) → `style-src` needs `'unsafe-inline'` (attributes cannot be hashed) |
| Images / video | media through the app's own `presenterpro-media:` scheme (privileged, `standard`, `secure`) and `file:` URLs for paths outside it; no `data:` URLs produced    |
| Fonts          | none loaded — Inter/system stack, no `@font-face`                                                                                                              |
| Dev server     | Vite HMR + React refresh inject inline scripts and a websocket — a strict CSP in dev would break it, and dev is not what ships                                 |

## Decisions

1. **The policy is injected at build time, not in dev.** A tiny Vite plugin
   in `electron.vite.config.js` (`transformIndexHtml`, `apply: 'build'`)
   adds one `<meta http-equiv="Content-Security-Policy">` to the built
   `index.html`. All three windows share that file, so all three get it.
   Dev keeps working unchanged; Electron's warning is dev-only noise there.
2. **Least privilege, from the measurements:**
   `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' presenterpro-media: file:; media-src 'self'
presenterpro-media: file:; font-src 'self'; connect-src 'self'
presenterpro-media:; object-src 'none'; base-uri 'self'; form-action
'none'; frame-src 'none'`. `'unsafe-inline'` for styles is the honest
   consequence of the 197 remaining inline style props; it goes when they
   do.
3. **Proof is behavioural:** a new E2E spec asserts the built app carries
   the meta, then drives Home, the editor (with a background image set from
   the media library), the output window and the stage display while
   collecting every console error — **zero CSP violations** ("Refused to
   …") and the Electron warning gone. The 52-capture net stays at 0
   differing pixels (a blocked stylesheet or image would show).

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

A violation means the policy is missing a source the app legitimately uses
— add that source with the evidence, never `*`.

## Blast radius

`electron.vite.config.js` (one plugin), `e2e/csp.spec.ts`, records.

### Sanctioned escape hatch — none.

## Todos

- [x] 1. E2E spec first: asserts the meta exists → red on the current build.
- [x] 2. Plugin; build; spec green; full E2E; strict compare on 52 captures.
- [x] 3. Record; PR.

## Findings (2026-09-07)

- Spec red first (`Received: null` for the meta), green after the plugin.
- Under the policy: **30 E2E specs green** (the new one drives a real image
  through `presenterpro-media:` as a slide background, opens the output
  window and the stage display, and collects every console error from all
  three windows — **zero violations, Electron's warning gone**), and the 8
  visual specs at `VISUAL_STRICT=1` — 0 differing pixels on all 52 captures.
- The policy is honest about the one thing it cannot tighten yet: `style-src
'unsafe-inline'` because of the 197 dynamic inline style attributes. When
  those go, so does that source.
- Dev is untouched (plugin `apply: 'build'`); the warning still prints there,
  by design.
