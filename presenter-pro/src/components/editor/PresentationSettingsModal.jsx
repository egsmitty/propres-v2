import React, { useState } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { useAppStore } from '@/store/appStore'

const PRESETS = [
  { label: '16:9 (Widescreen)', value: '16:9' },
  { label: '4:3 (Standard)', value: '4:3' },
  { label: '16:10', value: '16:10' },
  { label: '1:1 (Square)', value: '1:1' },
  { label: 'Custom', value: 'custom' },
]

export default function PresentationSettingsModal() {
  const presentation = useEditorStore((s) => s.presentation)
  const updatePresentationAspectRatio = useEditorStore((s) => s.updatePresentationAspectRatio)
  const setPresentationSettingsOpen = useAppStore((s) => s.setPresentationSettingsOpen)

  const [ratio, setRatio] = useState(presentation?.aspectRatio || '16:9')
  const [customW, setCustomW] = useState(presentation?.customAspectWidth || 1920)
  const [customH, setCustomH] = useState(presentation?.customAspectHeight || 1080)

  function handleSave() {
    updatePresentationAspectRatio(ratio, ratio === 'custom' ? Number(customW) : undefined, ratio === 'custom' ? Number(customH) : undefined)
    setPresentationSettingsOpen(false)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) setPresentationSettingsOpen(false) }}
    >
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 10,
          padding: 24,
          width: 340,
          boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
        }}
      >
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Presentation Settings
        </h2>

        <div className="mb-4">
          <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>Aspect Ratio</p>
          <div className="flex flex-col gap-1.5">
            {PRESETS.map(({ label, value }) => (
              <label
                key={value}
                className="flex items-center gap-2 cursor-pointer rounded px-2 py-1.5"
                style={{
                  background: ratio === value ? 'var(--accent-dim)' : 'transparent',
                  border: `1px solid ${ratio === value ? 'var(--accent)' : 'transparent'}`,
                }}
              >
                <input
                  type="radio"
                  name="aspectRatio"
                  value={value}
                  checked={ratio === value}
                  onChange={() => setRatio(value)}
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span className="text-xs" style={{ color: 'var(--text-primary)' }}>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {ratio === 'custom' && (
          <div className="flex items-center gap-2 mb-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Width</span>
              <input
                type="number"
                value={customW}
                min={400}
                max={7680}
                onChange={(e) => setCustomW(e.target.value)}
                className="text-xs rounded outline-none text-center"
                style={{
                  width: 80,
                  padding: '4px 6px',
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <span className="text-xs mt-4" style={{ color: 'var(--text-tertiary)' }}>×</span>
            <div className="flex flex-col gap-1">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Height</span>
              <input
                type="number"
                value={customH}
                min={300}
                max={4320}
                onChange={(e) => setCustomH(e.target.value)}
                className="text-xs rounded outline-none text-center"
                style={{
                  width: 80,
                  padding: '4px 6px',
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setPresentationSettingsOpen(false)}
            className="text-xs px-3 py-1.5 rounded"
            style={{
              background: 'var(--bg-app)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="text-xs px-3 py-1.5 rounded font-medium"
            style={{
              background: 'var(--accent)',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
