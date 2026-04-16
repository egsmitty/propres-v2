import React, { useEffect, useRef, useState } from 'react'
import { useDialogStore } from '@/store/dialogStore'

export default function DialogHost() {
  const dialog = useDialogStore((s) => s.dialog)
  if (!dialog) return null
  return <Dialog dialog={dialog} key={dialog.title + (dialog.description || '')} />
}

function Dialog({ dialog }) {
  const { title, description, fields = [], actions = [], resolve } = dialog

  const [values, setValues] = useState(() => {
    const initial = {}
    fields.forEach((f) => { initial[f.name] = f.defaultValue ?? '' })
    return initial
  })

  const firstInputRef = useRef(null)

  useEffect(() => {
    if (firstInputRef.current) {
      firstInputRef.current.focus()
      if (firstInputRef.current.select) firstInputRef.current.select()
    }
  }, [])

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        const cancel = actions.find((a) => a.cancel) || actions[0]
        resolve(cancel ? { action: cancel.value, values } : null)
      } else if (e.key === 'Enter' && !e.shiftKey) {
        const primary = actions.find((a) => a.primary)
        if (primary) {
          e.preventDefault()
          resolve({ action: primary.value, values })
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [values, actions, resolve])

  function setField(name, value) {
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.44)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'fade-in 120ms ease',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const cancel = actions.find((a) => a.cancel) || actions[0]
          resolve(cancel ? { action: cancel.value, values } : null)
        }
      }}
    >
      <div
        style={{
          background: 'var(--bg-surface)',
          borderRadius: 18,
          boxShadow: '0 24px 56px rgba(15,23,42,0.22)',
          border: '1px solid var(--border-default)',
          minWidth: 360,
          maxWidth: 520,
          padding: 26,
        }}
      >
        <h2 style={{ fontSize: 17, fontWeight: 650, color: 'var(--text-primary)', marginBottom: description ? 10 : 18 }}>
          {title}
        </h2>
        {description && (
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.45 }}>
            {description}
          </p>
        )}

        {fields.map((field, idx) => (
          <div key={field.name} style={{ marginBottom: 12 }}>
            {field.label && (
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: 4,
                }}
              >
                {field.label}
              </label>
            )}
            {field.type === 'select' ? (
              <select
                ref={idx === 0 ? firstInputRef : null}
                value={values[field.name]}
                onChange={(e) => setField(field.name, e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  fontSize: 13,
                  borderRadius: 6,
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-app)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              >
                {(field.options || []).map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <input
                ref={idx === 0 ? firstInputRef : null}
                type={field.type || 'text'}
                value={values[field.name]}
                placeholder={field.placeholder || ''}
                onChange={(e) => setField(field.name, e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  fontSize: 13,
                  borderRadius: 6,
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-app)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            )}
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
          {actions.map((action, idx) => (
            <button
              key={idx}
              onClick={() => resolve({ action: action.value, values })}
              style={{
                minWidth: 132,
                height: 48,
                padding: '0 18px',
                fontSize: 15,
                fontWeight: 600,
                borderRadius: 14,
                cursor: 'pointer',
                border: '1px solid',
                ...buttonStyle(action.variant, action.primary),
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function buttonStyle(variant, primary) {
  if (variant === 'danger') {
    return {
      background: 'rgba(220, 38, 38, 0.08)',
      borderColor: 'rgba(220, 38, 38, 0.18)',
      color: 'var(--danger)',
    }
  }
  if (primary || variant === 'primary') {
    return {
      background: 'var(--accent)',
      borderColor: 'var(--accent)',
      color: '#fff',
      boxShadow: '0 10px 24px rgba(74, 124, 255, 0.18)',
    }
  }
  return {
    background: 'var(--bg-app)',
    borderColor: 'var(--border-default)',
    color: 'var(--text-primary)',
  }
}
