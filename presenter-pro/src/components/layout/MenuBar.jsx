import React, { useState, useRef, useEffect } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { usePresenterStore } from '@/store/presenterStore'
import { useAppStore } from '@/store/appStore'
import { runAppCommand } from '@/utils/appCommands'

const MENUS = [
  {
    label: 'File',
    items: [
      { label: 'New Presentation', shortcut: '⌘N', action: 'file:new' },
      { label: 'Open…', shortcut: '⌘O', action: 'file:open' },
      { label: 'Save', shortcut: '⌘S', action: 'file:save' },
      { label: 'Save As…', shortcut: '⌘⇧S', action: 'file:saveAs' },
      { divider: true },
      { label: 'Close', action: 'file:close' },
    ]
  },
  {
    label: 'Insert',
    items: [
      { label: 'New Slide', shortcut: '⌘M', action: 'insert:newSlide' },
      { divider: true },
      { label: 'Song from Library', action: 'insert:song' },
      { divider: true },
      { label: 'Image…', action: 'insert:image' },
      { label: 'Video…', action: 'insert:video' },
      { label: 'Blank Slide', action: 'insert:blank' },
    ]
  },
  {
    label: 'Edit',
    items: [
      { label: 'Undo', shortcut: '⌘Z', action: 'edit:undo' },
      { label: 'Redo', shortcut: '⌘⇧Z', action: 'edit:redo' },
      { divider: true },
      { label: 'Presentation Settings…', action: 'edit:presentationSettings' },
    ]
  },
  {
    label: 'View',
    items: [
      { label: 'Zoom In', shortcut: '⌘+', action: 'view:zoomIn' },
      { label: 'Zoom Out', shortcut: '⌘-', action: 'view:zoomOut' },
      { divider: true },
      { label: 'Filmstrip', action: 'view:filmstrip' },
      { divider: true },
      { label: 'Presenter View', action: 'view:presenterView' },
      { label: 'Output Window', action: 'view:outputWindow' },
    ]
  },
  {
    label: 'Present',
    items: [
      { label: 'Start Presenting', shortcut: 'F5', action: 'present:start' },
      { label: 'Stop Presenting', shortcut: 'Esc', action: 'present:stop' },
      { divider: true },
      { label: 'Black Screen', shortcut: 'B', action: 'present:black' },
      { label: 'Logo Screen', shortcut: 'L', action: 'present:logo' },
    ]
  },
  {
    label: 'Help',
    items: [
      { label: 'Show Tutorial', action: 'help:tutorial' },
      { label: 'Keyboard Shortcuts', shortcut: '?', action: 'help:shortcuts' },
      { label: 'About PresenterPro', action: 'help:about' },
    ]
  }
]

function MenuItem({ item, onAction, onClose }) {
  if (item.divider) {
    return <div style={{ height: 1, background: 'var(--border-subtle)', margin: '3px 0' }} />
  }

  const disabled = item.disabled

  return (
    <button
      className="w-full text-left flex items-center justify-between px-3 py-1 text-xs rounded"
      style={{
        color: disabled ? 'var(--text-tertiary)' : 'var(--text-primary)',
        cursor: disabled ? 'default' : 'pointer',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
      onClick={() => {
        if (!disabled) {
          onAction(item.action)
          onClose()
        }
      }}
    >
      <span>{item.label}</span>
      {item.shortcut && (
        <span className="ml-6 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {item.shortcut}
        </span>
      )}
    </button>
  )
}

export default function MenuBar() {
  const [openMenu, setOpenMenu] = useState(null)
  const menuRef = useRef(null)

  const filmstripVisible = useAppStore((s) => s.filmstripVisible)
  const presentation = useEditorStore((s) => s.presentation)
  const isDirty = useEditorStore((s) => s.isDirty)
  const isPresenting = usePresenterStore((s) => s.isPresenting)

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleAction(action) {
    await runAppCommand(action)
  }

  const computedMenus = MENUS.map((menu) => ({
    ...menu,
    items: menu.items.map((item) => {
      if (item.divider) return item

      let disabled = false

      if (['file:save', 'file:saveAs', 'file:close', 'present:start'].includes(item.action)) {
        disabled = !presentation
      }
      if (['edit:undo', 'edit:redo', 'edit:presentationSettings'].includes(item.action)) {
        disabled = !presentation
      }
      if (item.action === 'present:start') disabled = disabled || isPresenting
      if (['present:stop', 'present:black', 'present:logo'].includes(item.action)) {
        disabled = !isPresenting
      }
      if (['view:zoomIn', 'view:zoomOut', 'view:filmstrip'].includes(item.action)) {
        disabled = !presentation
      }

      if (item.action === 'view:filmstrip') {
        return {
          ...item,
          label: filmstripVisible ? 'Hide Filmstrip' : 'Show Filmstrip',
          disabled,
        }
      }

      return { ...item, disabled }
    }),
  }))

  return (
    <div
      ref={menuRef}
      className="flex items-center px-1 h-7 shrink-0"
      style={{
        background: 'var(--bg-toolbar)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {computedMenus.map((menu) => (
        <div key={menu.label} className="relative">
          <button
            className="px-2.5 py-0.5 text-xs rounded"
            style={{
              color: 'var(--text-primary)',
              background: openMenu === menu.label ? 'var(--bg-hover)' : 'transparent',
            }}
            onMouseEnter={() => {
              if (openMenu !== null) setOpenMenu(menu.label)
            }}
            onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
          >
            {menu.label}
          </button>

          {openMenu === menu.label && (
            <div
              className="absolute top-full left-0 z-50 py-1 rounded shadow-lg min-w-40"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                marginTop: 2,
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
  )
}
