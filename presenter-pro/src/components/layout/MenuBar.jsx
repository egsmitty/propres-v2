import React, { useState, useRef, useEffect } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { usePresenterStore } from '@/store/presenterStore';
import { useAppStore } from '@/store/appStore';
import { useLatest } from '@/hooks/useLatest';
import { runAppCommand } from '@/utils/appCommands';
import { getPlatform } from '@/utils/platformShortcuts';
import { IN_APP_MENU_ORDER, MENU_TITLES, menuItems } from '@/utils/commandRegistry';

// Plan CMDS1: the menus, their labels, shortcuts and enabled rules come from
// the command registry — the same list the shortcuts sheet, the toolbar
// tooltips and `runAppCommand`'s guard read. Nothing is spelled twice.

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
  const openMenuRef = useLatest(openMenu);
  const menuRef = useRef(null);
  const platform = getPlatform();

  const currentView = useAppStore((s) => s.currentView);
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
    // Capture phase, and consumed ONLY when a menu is actually open: closing a
    // menu must not also stop a live presentation, but an Escape with no menu
    // open still belongs to the Editor (plan L1).
    function handleEscape(e) {
      if (e.key !== 'Escape' || openMenuRef.current === null) return;
      e.preventDefault();
      setOpenMenu(null);
    }
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEscape, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape, true);
    };
  }, [openMenuRef]);

  async function handleAction(action) {
    await runAppCommand(action);
  }

  // The menu never reads focus, so `typing` is false here; the guard in
  // runAppCommand reads the live value when a command actually runs.
  const commandState = {
    view: currentView === 'editor' ? 'editor' : 'home',
    hasPresentation: Boolean(presentation),
    isDirty: Boolean(isDirty),
    requiresInitialSave: Boolean(requiresInitialSave),
    isPresenting: Boolean(isPresenting),
    presenterPanelOpen: Boolean(presenterPanelOpen),
    filmstripVisible: Boolean(filmstripVisible),
    typing: false,
  };

  const computedMenus = IN_APP_MENU_ORDER.map((menu) => ({
    label: MENU_TITLES[menu],
    items: menuItems(menu, commandState, platform).map((row) =>
      row.divider
        ? row
        : { label: row.label, shortcut: row.shortcut, action: row.id, disabled: row.disabled }
    ),
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
