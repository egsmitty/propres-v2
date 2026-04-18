import React, { useState } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { useAppStore } from '@/store/appStore'

const PRESETS = [
  { label: '16:9 (Widescreen)', value: '16:9' },
  { label: '4:3 (Standard)', value: '4:3' },
  { label: '16:10', value: '16:10' },
  { label: 'Custom', value: 'custom' },
]

export default function PresentationSettingsModal() {
  const presentation = useEditorStore((s) => s.presentation)
  const updatePresentationAspectRatio = useEditorStore((s) => s.updatePresentationAspectRatio)
  const setPresentationSettingsOpen = useAppStore((s) => s.setPresentationSettingsOpen)

  const [ratio, setRatio] = useState(presentation?.aspectRatio || '16:9')
  const [customW, setCustomW] = useState(presentation?.customAspectWidth || 1920)
  const [customH, setCustomH] = useState(presentation?.customAspectHeight || 1080)
  const customWidth = Number(customW)
  const customHeight = Number(customH)
  const customValid = Number.isFinite(customWidth) && Number.isFinite(customHeight) && customWidth >= 400 && customHeight >= 300

  function handleSave() {
    if (ratio === 'custom' && !customValid) return
    updatePresentationAspectRatio(
      ratio,
      ratio === 'custom' ? customWidth : undefined,
      ratio === 'custom' ? customHeight : undefined
    )
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
          <select
            value={ratio}
            onChange={(e) => setRatio(e.target.value)}
            className="w-full text-xs rounded outline-none"
            style={{
              background: 'var(--bg-app)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
              padding: '8px 10px',
            }}
          >
            {PRESETS.map(({ label, value }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {ratio === 'custom' && (
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-1 flex-1">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Width</span>
                <input
                  type="number"
                  value={customW}
                  min={400}
                  max={7680}
                  onChange={(e) => setCustomW(e.target.value)}
                  className="text-xs rounded outline-none text-center"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    background: 'var(--bg-app)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
              <span className="text-xs mt-5" style={{ color: 'var(--text-tertiary)' }}>×</span>
              <div className="flex flex-col gap-1 flex-1">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Height</span>
                <input
                  type="number"
                  value={customH}
                  min={300}
                  max={4320}
                  onChange={(e) => setCustomH(e.target.value)}
                  className="text-xs rounded outline-none text-center"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    background: 'var(--bg-app)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </div>
            <div className="mt-2 text-xs" style={{ color: customValid ? 'var(--text-tertiary)' : 'var(--danger, #ef4444)' }}>
              {customValid
                ? 'Custom output is saved per presentation.'
                : 'Enter a width of at least 400 and a height of at least 300.'}
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
              background: ratio === 'custom' && !customValid ? 'var(--bg-hover)' : 'var(--accent)',
              border: 'none',
              color: ratio === 'custom' && !customValid ? 'var(--text-tertiary)' : '#fff',
              cursor: ratio === 'custom' && !customValid ? 'default' : 'pointer',
            }}
            disabled={ratio === 'custom' && !customValid}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
