import React, { useEffect, useRef } from 'react'

export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Keep menu on screen
  const menuWidth = 220
  const menuHeight = items.reduce((total, item) => total + (item.divider ? 12 : 42), 10)
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 8)
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 8)

  return (
    <div
      ref={ref}
      data-context-menu="true"
      className="fixed z-50 py-1.5 rounded-2xl shadow-xl"
      style={{
        top: adjustedY,
        left: adjustedX,
        width: menuWidth,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        boxShadow: '0 18px 42px rgba(8,14,30,0.16)',
      }}
    >
      {items.map((item, i) => {
        if (item.divider) {
          return (
            <div
              key={i}
              style={{ height: 1, background: 'var(--border-subtle)', margin: '6px 10px' }}
            />
          )
        }
        const Icon = item.icon
        return (
          <button
            key={i}
            className="w-full text-left px-3.5 py-2.5 text-sm rounded-xl mx-1"
            style={{
              color: item.disabled
                ? 'var(--text-tertiary)'
                : item.danger
                ? 'var(--danger)'
                : 'var(--text-primary)',
              cursor: item.disabled ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
            onMouseEnter={(e) => {
              if (item.disabled) return
              e.currentTarget.style.background = item.danger
                ? 'var(--danger-dim)'
                : 'var(--bg-hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
            onClick={() => {
              if (item.disabled) return
              item.onClick()
              onClose()
            }}
            disabled={item.disabled}
          >
            {Icon ? <Icon size={16} strokeWidth={2} style={{ flexShrink: 0 }} /> : null}
            <span>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
