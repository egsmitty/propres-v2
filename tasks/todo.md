# Session 6 — Presenter Panel as Right Sidebar

## Key observations before planning
- `presenterFlow.js` → `startPresentationSession` currently opens BOTH presenterWindow and outputWindow, waits for both to be ready, then sends slides. In the sidebar world we only open outputWindow (no presenterWindow). Need a new start function.
- `presenterStore.js` → has `startPresenting(sectionId, slideId)` but no `presenterPanelOpen` or `allSlides`. Need to add both.
- `Editor.jsx` → layout is `flex flex-col h-full`, inner row is `flex flex-1 overflow-hidden relative`. The panel slots in after `<Canvas>` in that inner row.
- `main.js` → `createPresenterWindow()` and its IPC handlers (`presenter:open`, `presenter:close`, `presenter:start`, `presenter:updateSlides`, `presenter:goToSlide`, `presenter:waitReady`, `presenter:ready`) need to be commented out. The `output:stop` handler currently also closes presenterWindow — need to remove that line. `broadcast()` sends to presenterWindow — that line can stay (guard already exists).
- The `startPresentationSession` in `presenterFlow.js` calls `openPresenterView()` — this will be removed from the new sidebar start flow. The old function stays for rollback reference.
- `flattenPresentationSlides` in `presenterFlow.js` already does what we need for allSlides. Re-use it.
- Keyboard shortcuts for B/L/Escape already exist in `Editor.jsx`. Arrow keys for prev/next do NOT exist — add them in `PresenterPanel.jsx`.

## Plan
- [x] Add `presenterPanelOpen`, `allSlides`, `setPresenterPanelOpen`, `setAllSlides` to `presenterStore.js`
- [x] Comment out presenterWindow code in `main.js` (createPresenterWindow, its IPC handlers, references in output:stop and closed handler)
- [x] Create `src/components/presenter/PresenterPanel.jsx` with all 4 sections
- [x] Update `Editor.jsx` — add panel to layout, add toggle button in Toolbar area, update startPresenting flow to sidebar version
- [x] Update CLAUDE.md
- [ ] Commit

## Review
- **presenterStore.js** — added `presenterPanelOpen` (defaults to true if window ≥ 1400px), `allSlides`, `setPresenterPanelOpen`, `setAllSlides`. `stopPresenting` now also clears `allSlides`.
- **main.js** — `createPresenterWindow()` and all `presenter:open/close/ready/waitReady/start/updateSlides/goToSlide` IPC handlers commented out with rollback notes. `output:stop` presenterWindow send line commented. `mainWindow.on('closed')` presenterWindow close commented.
- **presenterFlow.js** — old `startPresentationSession` replaced with `startSidebarPresentationSession` (output window only, waits only for outputReady, populates allSlides). `syncPresentationSession` now updates allSlides in store instead of calling the disabled IPC. Removed `openPresenterView`/`updatePresentationSlides` imports.
- **PresenterPanel.jsx** — new component with 4 sections: live preview (green dot + border when presenting), Start/Stop/Black/Logo controls, 2-column slide grid grouped by section with color strips and live highlight, PREV/NEXT navigation. Arrow key listener active only while presenting.
- **Toolbar.jsx** — accepts `onTogglePanel`/`presenterPanelOpen` props; renders "⊞ Presenter" toggle button.
- **Editor.jsx** — renders `<PresenterPanel />`, passes toggle props to Toolbar, uses `startSidebarPresentationSession`.
- **appCommands.js** — `view:presenterView` toggles the panel; `present:start` uses new sidebar function.
- Output window unchanged throughout.
