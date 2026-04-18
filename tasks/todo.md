# Resizable Panels + Spacebar Advance

## Observations
- Filmstrip has `w-56` (224px) hardcoded on both its return divs — need to replace with inline width
- PresenterPanel width comes from `presenterStore.presenterPanelOpen ? 300 : 0` — swap 300 for a dynamic `presenterPanelWidth` from store
- Editor.jsx inner row is `flex flex-1 overflow-hidden` — drag handles slot between panels in this row
- Spacebar advance: PresenterPanel's keydown handler already handles ArrowLeft/Right — add Space

## Plan
- [x] Add `presenterPanelWidth: 320`, `setPresenterPanelWidth` to `presenterStore.js`
- [x] Update `Filmstrip.jsx` — replace `w-56` with `style={{ width }}` driven by a `width` prop (default 224)
- [x] Update `PresenterPanel.jsx` — use `presenterPanelWidth` for open width; add spacebar → goNext in keyboard handler
- [x] Update `Editor.jsx` — local `filmstripWidth` state, two drag handles, wire resize logic with mousedown/mousemove/mouseup

## Review
- **presenterStore.js** — added `presenterPanelWidth: 320` and `setPresenterPanelWidth`.
- **Filmstrip.jsx** — accepts `width` prop (default 224); both return divs use `style={{ width }}` instead of `w-56`.
- **PresenterPanel.jsx** — reads `presenterPanelWidth` from store; inner container uses it for both `width` and `minWidth`; spacebar added to keyboard handler (`ArrowRight || Space → goNext`).
- **Editor.jsx** — `filmstripWidth` local state (224); `dragRef` tracks active drag; a single `useEffect` handles `mousemove`/`mouseup` globally. `ResizeHandle` rendered after filmstrip and before presenter panel; drag inverts dx for the right-side panel. Filmstrip receives `width={filmstripWidth}` prop.
