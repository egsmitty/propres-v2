import React, { useState, useRef, useEffect } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { usePresenterStore } from '@/store/presenterStore';
import { useAppStore } from '@/store/appStore';
import { runAppCommand } from '@/utils/appCommands';
import { formatShortcutLabel, getPlatform } from '@/utils/platformShortcuts';

const MENUS = [
  {
    label: 'File',
    items: [
      { label: 'New Presentation', shortcutTokens: ['mod', 'n'], action: 'file:new' },
      { label: 'Open…', shortcutTokens: ['mod', 'o'], action: 'file:open' },
      { label: 'Save', shortcutTokens: ['mod', 's'], action: 'file:save' },
      { label: 'Save As…', shortcutTokens: ['mod', 'shift', 's'], action: 'file:saveAs' },
      { label: 'Revert to Last Save', action: 'file:revert' },
      { label: 'Version History…', action: 'file:versionHistory' },
      { divider: true },
      { label: 'Close', action: 'file:close' },
    ],
  },
  {
    label: 'Insert',
    items: [
      { label: 'New Slide', shortcutTokens: ['mod', 'm'], action: 'insert:newSlide' },
      { divider: true },
      { label: 'Song', action: 'insert:song' },
      { label: 'Media', action: 'insert:media' },
      { label: 'Announcement', action: 'insert:announcement' },
      { label: 'Sermon', action: 'insert:sermon' },
    ],
  },
  {
    label: 'Edit',
    items: [
      { label: 'Presentation Settings…', action: 'edit:presentationSettings' },
      { label: 'Output Settings…', action: 'view:outputSettings' },
    ],
  },
  {
    label: 'View',
    items: [
      { label: 'Service Order', action: 'view:filmstrip' },
      { label: 'Song Library', action: 'view:songLibrary' },
      { label: 'Media Library', action: 'view:mediaLibrary' },
      { label: 'Show Presenter Panel', action: 'view:presenterPanel' },
    ],
  },
  {
    label: 'Present',
    items: [
      { label: 'Start Presenting', shortcut: 'F5', action: 'present:start' },
      { label: 'Stop Presenting', shortcut: 'Esc', action: 'present:stop' },
      { divider: true },
      { label: 'Black Screen', shortcut: 'B', action: 'present:black' },
      { label: 'Logo Screen', shortcut: 'L', action: 'present:logo' },
    ],
  },
  {
    label: 'Help',
    items: [
      { label: 'Show Tutorial', action: 'help:tutorial' },
      { label: 'Keyboard Shortcuts', shortcut: '?', action: 'help:shortcuts' },
      { label: 'About PresenterPro', action: 'help:about' },
    ],
  },
];

function MenuItem({ item, onAction, onClose }) {
  if (item.divider) {
    return <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />;
  }

  const disabled = item.disabled;

  return (
    <button
      // A greyed item that is still focusable and still reports itself as
      // enabled is a keyboard/screen-reader trap (workstream E3). The click was
      // already guarded below; this makes the DOM agree.
      disabled={disabled}
      className={`w-full text-left flex items-center justify-between px-3 py-1.5 text-[12px] rounded-md ${disabled ? '' : 'hover:bg-bg-hover'}`}
      style={{
        color: disabled ? 'var(--text-tertiary)' : 'var(--text-primary)',
        cursor: disabled ? 'default' : 'pointer',
      }}
      onClick={() => {
        if (!disabled) {
          onAction(item.action);
          onClose();
        }
      }}
    >
      <span>{item.label}</span>
      {item.shortcut && (
        <span className="ml-6 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          {item.shortcut}
        </span>
      )}
    </button>
  );
}

export default function MenuBar() {
  const [openMenu, setOpenMenu] = useState(null);
  const menuRef = useRef(null);
  const platform = getPlatform();

  const filmstripVisible = useAppStore((s) => s.filmstripVisible);
  const presentation = useEditorStore((s) => s.presentation);
  const isDirty = useEditorStore((s) => s.isDirty);
  const requiresInitialSave = useEditorStore((s) => s.requiresInitialSave);
  const isPresenting = usePresenterStore((s) => s.isPresenting);
  const presenterPanelOpen = usePresenterStore((s) => s.presenterPanelOpen);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenu(null);
      }
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setOpenMenu(null);
    }
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);

  async function handleAction(action) {
    await runAppCommand(action);
  }

  const computedMenus = MENUS.map((menu) => ({
    ...menu,
    items: menu.items.map((item) => {
      if (item.divider) return item;

      let disabled = false;

      if (['file:save', 'file:saveAs', 'file:close', 'present:start'].includes(item.action)) {
        disabled = !presentation;
      }
      if (['edit:presentationSettings', 'view:outputSettings'].includes(item.action)) {
        disabled = !presentation;
      }
      if (item.action === 'file:versionHistory') {
        // Disabled mid-service: restoring replaces the presentation, and if the
        // live slide is not in the restored document PresenterPanel's liveIdx
        // becomes -1, which makes canGoNext true and sends the next spacebar to
        // slide 1 of the deck, in front of the room.
        disabled = !presentation || isPresenting;
      }
      if (item.action === 'file:revert') {
        // Nothing to revert to until the document has been saved once, and
        // nothing to revert while it matches its last save.
        disabled = !presentation || !isDirty || requiresInitialSave;
      }
      if (item.action === 'present:start') disabled = disabled || isPresenting;
      if (['present:stop', 'present:black', 'present:logo'].includes(item.action)) {
        disabled = !isPresenting;
      }
      if (
        ['view:filmstrip', 'view:songLibrary', 'view:mediaLibrary', 'view:presenterPanel'].includes(
          item.action
        )
      ) {
        disabled = !presentation;
      }
      if (item.action === 'view:filmstrip') {
        return {
          ...item,
          label: filmstripVisible ? 'Hide Service Order' : 'Show Service Order',
          disabled,
        };
      }
      if (item.action === 'view:presenterPanel') {
        return {
          ...item,
          label: presenterPanelOpen ? 'Hide Presenter Panel' : 'Show Presenter Panel',
          disabled,
        };
      }

      return {
        ...item,
        disabled,
        shortcut: item.shortcutTokens
          ? formatShortcutLabel(item.shortcutTokens, platform)
          : item.shortcut,
      };
    }),
  }));

  return (
    <div
      ref={menuRef}
      className="flex items-center px-2 h-9 shrink-0 gap-0.5 bg-bg-toolbar border-b border-border-subtle"
    >
      {computedMenus.map((menu) => (
        <div key={menu.label} className="relative">
          <button
            className="px-3 py-1 text-[12px] font-medium rounded-md"
            style={{
              color: 'var(--text-primary)',
              background: openMenu === menu.label ? 'var(--bg-hover)' : 'transparent',
            }}
            onMouseEnter={() => {
              if (openMenu !== null) setOpenMenu(menu.label);
            }}
            onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
          >
            {menu.label}
          </button>

          {openMenu === menu.label && (
            <div
              className="absolute top-full left-0 z-50 py-1 rounded-lg shadow-lg min-w-44"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                marginTop: 4,
              }}
            >
              {menu.items.map((item, i) => (
                <MenuItem
                  key={i}
                  item={item}
                  onAction={handleAction}
                  onClose={() => setOpenMenu(null)}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
