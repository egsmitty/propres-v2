import React, { useEffect } from 'react'
import { X } from 'lucide-react'
import { getPlatform, getShortcutKeys } from '@/utils/platformShortcuts'

const SHORTCUTS = [
  { group: 'File', items: [
    { shortcutTokens: ['mod', 'n'], label: 'New Presentation' },
    { shortcutTokens: ['mod', 'o'], label: 'Open Presentation' },
    { shortcutTokens: ['mod', 's'], label: 'Save' },
    { shortcutTokens: ['mod', 'shift', 's'], label: 'Save As' },
  ]},
  { group: 'Edit', items: [
    { shortcutTokens: ['mod', 'm'], label: 'New Slide' },
    { shortcutTokens: ['Double-click'], label: 'Edit slide text' },
    { shortcutTokens: ['esc'], label: 'Exit text editing / stop presenting' },
  ]},
  { group: 'Present', items: [
    { shortcutTokens: ['F5'], label: 'Start Presenting' },
    { shortcutTokens: ['esc'], label: 'Stop Presenting' },
    { shortcutTokens: ['left', 'right'], label: 'Previous / Next slide' },
    { shortcutTokens: ['b'], label: 'Black screen' },
    { shortcutTokens: ['l'], label: 'Logo screen' },
  ]},
  { group: 'Navigation', items: [
    { shortcutTokens: ['?'], label: 'Show this overlay' },
  ]},
]

export default function ShortcutsOverlay({ onClose }) {
  const platform = getPlatform()

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape' || e.key === '?') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="rounded-xl shadow-2xl overflow-hidden"
        style={{
          width: 520,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-6 h-6 rounded"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={14} />
          </button>
        </div>

        {/* Shortcut groups */}
        <div className="p-5 grid grid-cols-2 gap-6">
          {SHORTCUTS.map((group) => (
            <div key={group.group}>
              <p
                className="text-xs font-semibold uppercase tracking-wide mb-2"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {group.group}
              </p>
              <div className="flex flex-col gap-1.5">
                {group.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {item.label}
                    </span>
                    <div className="flex items-center gap-0.5 ml-3">
                      {getShortcutKeys(item.shortcutTokens, platform).map((key, ki) => (
                        <kbd
                          key={ki}
                          className="px-1.5 py-0.5 rounded text-xs font-medium"
                          style={{
                            background: 'var(--bg-app)',
                            border: '1px solid var(--border-default)',
                            color: 'var(--text-primary)',
                            fontFamily: 'monospace',
                            fontSize: 11,
                          }}
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div
          className="px-5 py-2.5 text-xs text-center"
          style={{
            color: 'var(--text-tertiary)',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          Press <kbd
            className="px-1 py-0.5 rounded mx-0.5"
            style={{
              background: 'var(--bg-app)',
              border: '1px solid var(--border-default)',
              fontFamily: 'monospace',
              fontSize: 11,
            }}
          >?</kbd> or <kbd
            className="px-1 py-0.5 rounded mx-0.5"
            style={{
              background: 'var(--bg-app)',
              border: '1px solid var(--border-default)',
              fontFamily: 'monospace',
              fontSize: 11,
            }}
          >Esc</kbd> to dismiss
        </div>
      </div>
    </div>
  )
}
