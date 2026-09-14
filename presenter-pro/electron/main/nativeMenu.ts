// The native application menu, as a plain template (plan L1). It lived inline
// in electron/main/index.js, where nothing could test it; `index.js` now passes
// the result straight to `Menu.buildFromTemplate`.
//
// Kept free of any `electron` import so it can be unit-tested. Because the main
// process is CommonJS, `index.js` requires this file at runtime — it needs its
// own Rollup input in electron.vite.config.js or the app crashes on launch.

export type MenuItemTemplate = {
  label?: string;
  role?: string;
  type?: 'separator';
  accelerator?: string;
  registerAccelerator?: boolean;
  click?: () => void;
  submenu?: MenuItemTemplate[];
};

export function buildNativeMenuTemplate({
  isDev,
  sendCommand,
}: {
  isDev: boolean;
  sendCommand: (command: string) => void;
}): MenuItemTemplate[] {
  // Reload and DevTools only exist in development. In a packaged build a
  // reflexive Cmd+R reloaded the editor mid-service: the presenter state was
  // lost while the output window kept showing its last slide, and the reload
  // skipped the unsaved-changes handshake entirely (audit MAIN-B4).
  const devTools: MenuItemTemplate[] = isDev
    ? [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }]
    : [];

  return [
    {
      label: 'PresenterPro',
      submenu: [
        { label: 'About PresenterPro', role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Presentation',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendCommand('file:new'),
        },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => sendCommand('file:open') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendCommand('file:save') },
        {
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendCommand('file:saveAs'),
        },
        // No accelerator: Pages and Keynote give Revert none either, and an
        // unbid shortcut for a destructive action is a hazard. This app has no
        // menu-state plumbing, so the item is always enabled and the renderer
        // command alerts when there is nothing to revert.
        { label: 'Revert to Last Save', click: () => sendCommand('file:revert') },
        { label: 'Version History…', click: () => sendCommand('file:versionHistory') },
        { type: 'separator' },
        { label: 'Close', accelerator: 'CmdOrCtrl+W', click: () => sendCommand('file:close') },
      ],
    },
    {
      label: 'Insert',
      submenu: [
        {
          label: 'New Slide',
          accelerator: 'CmdOrCtrl+M',
          click: () => sendCommand('insert:newSlide'),
        },
        { type: 'separator' },
        { label: 'Insert Image…', click: () => sendCommand('insert:image') },
        { label: 'Insert Video…', click: () => sendCommand('insert:video') },
      ],
    },
    {
      label: 'Present',
      submenu: [
        { label: 'Start Presenting', accelerator: 'F5', click: () => sendCommand('present:start') },
        // Escape, B and L are shown as hints only (`registerAccelerator: false`),
        // the way Keynote shows its Play-menu keys. Registered, a bare letter or
        // Escape fired from the OS on top of the renderer's own handling —
        // toggling black on and straight back off — and could fire while
        // typing (audit CMD-B7). The renderer owns these keys.
        {
          label: 'Stop Presenting',
          accelerator: 'Escape',
          registerAccelerator: false,
          click: () => sendCommand('present:stop'),
        },
        { type: 'separator' },
        {
          label: 'Black Screen',
          accelerator: 'B',
          registerAccelerator: false,
          click: () => sendCommand('present:black'),
        },
        {
          label: 'Logo Screen',
          accelerator: 'L',
          registerAccelerator: false,
          click: () => sendCommand('present:logo'),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => sendCommand('edit:undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => sendCommand('edit:redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Presentation Settings…',
          click: () => sendCommand('edit:presentationSettings'),
        },
        { label: 'Output Settings…', click: () => sendCommand('view:outputSettings') },
      ],
    },
    {
      label: 'View',
      submenu: [
        ...devTools,
        { label: 'Song Library', click: () => sendCommand('view:songLibrary') },
        { label: 'Media Library', click: () => sendCommand('view:mediaLibrary') },
        {
          label: 'Show / Hide Presenter Panel',
          click: () => sendCommand('view:presenterPanel'),
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];
}
