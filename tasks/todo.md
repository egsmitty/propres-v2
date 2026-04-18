# Platform-Aware Title Bar

## Plan
- [x] Expose `platform` (value of `process.platform`) via `contextBridge` in `preload/index.js`
- [x] Update `TitleBar.jsx` — on macOS render traffic lights on the left (existing); on Windows render native-style buttons (− □ ×) on the right with correct hover colors

## Review
- **preload/index.js** — added `platform: process.platform` to the `contextBridge` so the renderer can read it safely via `window.electronAPI.platform`.
- **TitleBar.jsx** — reads `isMac` from `window.electronAPI?.platform`. On macOS the traffic-light block is shown on the left (unchanged). On all other platforms it's hidden and a `WinButton` group is rendered on the right (− □ ×) with standard Windows sizing (46×36px) and a red hover on the close button. No other files touched.
