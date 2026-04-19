import React, { useState } from 'react'

const FONT_OPTIONS = [
  'Arial, sans-serif',
  'Georgia, serif',
  'Times New Roman, serif',
  'Trebuchet MS, sans-serif',
  'Courier New, monospace',
]

export default function ApplyThemeModal({ count, onClose, onApply }) {
  const [fontFamily, setFontFamily] = useState('Arial, sans-serif')
  const [size, setSize] = useState(48)
  const [color, setColor] = useState('#ffffff')
  const [align, setAlign] = useState('center')
  const [lineHeight, setLineHeight] = useState(1.2)

  function handleApply() {
    onApply({ fontFamily, size: Number(size), color, align, lineHeight: Number(lineHeight) })
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="rounded-xl"
        style={{
          width: 380,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          boxShadow: '0 20px 48px rgba(0,0,0,0.36)',
          padding: 20,
        }}
      >
        <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          Apply Theme
        </h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-tertiary)' }}>
          Apply text style to {count} selected slides.
        </p>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Font Family</span>
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              className="text-xs rounded outline-none"
              style={{
                background: 'var(--bg-app)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                padding: '6px 8px',
              }}
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f} value={f}>{f.split(',')[0]}</option>
              ))}
            </select>
          </label>

          <div className="flex gap-3">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Font Size</span>
              <input
                type="number"
                min={12}
                max={200}
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="text-xs rounded outline-none"
                style={{
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  padding: '6px 8px',
                }}
              />
            </label>

            <label className="flex flex-col gap-1 flex-1">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Line Height</span>
              <input
                type="number"
                min={0.8}
                max={3}
                step={0.1}
                value={lineHeight}
                onChange={(e) => setLineHeight(e.target.value)}
                className="text-xs rounded outline-none"
                style={{
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  padding: '6px 8px',
                }}
              />
            </label>
          </div>

          <div className="flex gap-3 items-end">
            <label className="flex flex-col gap-1">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Text Color</span>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                style={{ height: 34, width: 48, padding: 2, borderRadius: 4, border: '1px solid var(--border-default)', background: 'var(--bg-app)', cursor: 'pointer' }}
              />
            </label>

            <label className="flex flex-col gap-1 flex-1">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Alignment</span>
              <select
                value={align}
                onChange={(e) => setAlign(e.target.value)}
                className="text-xs rounded outline-none"
                style={{
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  padding: '6px 8px',
                }}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded"
            style={{ background: 'var(--bg-app)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="text-xs px-3 py-1.5 rounded font-medium"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            Apply to {count} Slides
          </button>
        </div>
      </div>
    </div>
  )
}
