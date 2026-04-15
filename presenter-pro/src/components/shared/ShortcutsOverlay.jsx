import React, { useEffect } from 'react'
import { X } from 'lucide-react'

const SHORTCUTS = [
  { group: 'File', items: [
    { keys: ['⌘', 'N'], label: 'New Presentation' },
    { keys: ['⌘', 'O'], label: 'Open Presentation' },
    { keys: ['⌘', 'S'], label: 'Save' },
    { keys: ['⌘', '⇧', 'S'], label: 'Save As' },
  ]},
  { group: 'Edit', items: [
    { keys: ['⌘', 'M'], label: 'New Slide' },
    { keys: ['Double-click'], label: 'Edit slide text' },
    { keys: ['Esc'], label: 'Exit text editing / stop presenting' },
  ]},
  { group: 'Present', items: [
    { keys: ['F5'], label: 'Start Presenting' },
    { keys: ['Esc'], label: 'Stop Presenting' },
    { keys: ['←', '→'], label: 'Previous / Next slide' },
    { keys: ['B'], label: 'Black screen' },
    { keys: ['L'], label: 'Logo screen' },
  ]},
  { group: 'Navigation', items: [
    { keys: ['?'], label: 'Show this overlay' },
  ]},
]

export default function ShortcutsOverlay({ onClose }) {
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
                      {item.keys.map((k, ki) => (
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
                          {k}
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
