import React, { useEffect, useState } from 'react'
import { useAppStore } from '@/store/appStore'
import { getSettings, getSystemDisplays, openOutputWindow, openStageDisplayWindow, closeOutputWindow, closeStageDisplayWindow, setSetting } from '@/utils/ipc'

const DEFAULT_THEME = {
  fontSize: 84,
  textColor: '#ffffff',
  backgroundColor: '#000000',
}

function parseTheme(value) {
  try {
    return { ...DEFAULT_THEME, ...(value ? JSON.parse(value) : {}) }
  } catch {
    return DEFAULT_THEME
  }
}

function getDisplayLabel(display) {
  const baseLabel = display.label?.trim() || `Display ${display.id}`
  const size = `${display.bounds.width}×${display.bounds.height}`
  return display.primary ? `${baseLabel} (${size}, Primary)` : `${baseLabel} (${size})`
}

export default function OutputSettingsModal() {
  const setOutputSettingsOpen = useAppStore((s) => s.setOutputSettingsOpen)
  const [loading, setLoading] = useState(true)
  const [displays, setDisplays] = useState([])
  const [mainDisplayId, setMainDisplayId] = useState('')
  const [stageDisplayId, setStageDisplayId] = useState('')
  const [theme, setTheme] = useState(DEFAULT_THEME)
  const [saving, setSaving] = useState(false)
  const [mainPreviewOpen, setMainPreviewOpen] = useState(false)
  const [stagePreviewOpen, setStagePreviewOpen] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const [settingsResult, displaysResult] = await Promise.all([getSettings(), getSystemDisplays()])
      if (cancelled) return

      const settings = settingsResult?.success ? settingsResult.data || {} : {}
      setMainDisplayId(settings['output.mainDisplayId'] || '')
      setStageDisplayId(settings['output.stageDisplayId'] || '')
      setTheme(parseTheme(settings['stageDisplay.theme']))
      setDisplays(displaysResult?.success ? displaysResult.data || [] : [])
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const hasDisplayConflict = Boolean(mainDisplayId && stageDisplayId && mainDisplayId === stageDisplayId)

  async function handleClose() {
    if (mainPreviewOpen) { await closeOutputWindow(); setMainPreviewOpen(false) }
    if (stagePreviewOpen) { await closeStageDisplayWindow(); setStagePreviewOpen(false) }
    setOutputSettingsOpen(false)
  }

  async function handleSave() {
    if (hasDisplayConflict) return
    setSaving(true)
    await Promise.all([
      setSetting('output.mainDisplayId', mainDisplayId),
      setSetting('output.stageDisplayId', stageDisplayId),
      setSetting('stageDisplay.theme', JSON.stringify(theme)),
    ])
    setSaving(false)
    await handleClose()
  }

  async function toggleMainPreview() {
    if (mainPreviewOpen) {
      await closeOutputWindow()
      setMainPreviewOpen(false)
    } else {
      await openOutputWindow(mainDisplayId ? { displayId: Number(mainDisplayId) } : { useConfiguredDisplay: false })
      setMainPreviewOpen(true)
    }
  }

  async function toggleStagePreview() {
    if (stagePreviewOpen) {
      await closeStageDisplayWindow()
      setStagePreviewOpen(false)
    } else {
      await openStageDisplayWindow(stageDisplayId ? { displayId: Number(stageDisplayId) } : { useConfiguredDisplay: false })
      setStagePreviewOpen(true)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.62)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div
        className="rounded-xl"
        style={{
          width: 720,
          maxWidth: '92vw',
          maxHeight: '88vh',
          overflowY: 'auto',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.38)',
          padding: 24,
        }}
      >
        <div className="mb-5">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Output Settings
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Assign graphics windows to desktop displays and tune the dedicated Stage Display theme.
          </p>
        </div>

        {loading ? (
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Loading display configuration…
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <section
              className="rounded-lg p-4"
              style={{ background: 'var(--bg-app)', border: '1px solid var(--border-subtle)' }}
            >
              <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                Graphics Outputs
              </h3>
              <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Main Output Display</span>
                  <select
                    value={mainDisplayId}
                    onChange={(e) => setMainDisplayId(e.target.value)}
                    className="text-xs rounded outline-none"
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-default)',
                      color: 'var(--text-primary)',
                      padding: '8px 10px',
                    }}
                  >
                    <option value="">Open in a window</option>
                    {displays.map((display) => (
                      <option key={display.id} value={String(display.id)}>{getDisplayLabel(display)}</option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Stage Display</span>
                  <select
                    value={stageDisplayId}
                    onChange={(e) => setStageDisplayId(e.target.value)}
                    className="text-xs rounded outline-none"
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-default)',
                      color: 'var(--text-primary)',
                      padding: '8px 10px',
                    }}
                  >
                    <option value="">Do not auto-open</option>
                    {displays.map((display) => (
                      <option key={display.id} value={String(display.id)}>{getDisplayLabel(display)}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={toggleMainPreview}
                  className="text-xs px-3 py-1.5 rounded"
                  style={{ background: mainPreviewOpen ? 'var(--bg-hover)' : 'var(--accent)', color: mainPreviewOpen ? 'var(--text-primary)' : '#fff', border: mainPreviewOpen ? '1px solid var(--border-default)' : 'none' }}
                >
                  {mainPreviewOpen ? 'Close Main Preview' : 'Open Main Output Preview'}
                </button>
                <button
                  type="button"
                  onClick={toggleStagePreview}
                  className="text-xs px-3 py-1.5 rounded"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                >
                  {stagePreviewOpen ? 'Close Stage Preview' : 'Open Stage Display Preview'}
                </button>
              </div>

              <p className="text-xs mt-2" style={{ color: hasDisplayConflict ? 'var(--danger, #ef4444)' : 'var(--text-tertiary)' }}>
                {hasDisplayConflict
                  ? 'Main Output and Stage Display should be assigned to different displays.'
                  : 'PresenterPro uses Electron display APIs so these assignments work on both macOS and Windows.'}
              </p>
            </section>

            <section
              className="rounded-lg p-4"
              style={{ background: 'var(--bg-app)', border: '1px solid var(--border-subtle)' }}
            >
              <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                Stage Display Theme
              </h3>
              <div className="grid gap-3" style={{ gridTemplateColumns: '1.2fr 1fr 1fr' }}>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Font Size</span>
                  <input
                    type="number"
                    min={36}
                    max={180}
                    value={theme.fontSize}
                    onChange={(e) => setTheme((prev) => ({ ...prev, fontSize: Math.max(36, Math.min(180, Number(e.target.value) || DEFAULT_THEME.fontSize)) }))}
                    className="text-xs rounded outline-none"
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-default)',
                      color: 'var(--text-primary)',
                      padding: '8px 10px',
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Text Color</span>
                  <input type="color" value={theme.textColor} onChange={(e) => setTheme((prev) => ({ ...prev, textColor: e.target.value }))} style={{ height: 38 }} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Background</span>
                  <input type="color" value={theme.backgroundColor} onChange={(e) => setTheme((prev) => ({ ...prev, backgroundColor: e.target.value }))} style={{ height: 38 }} />
                </label>
              </div>
            </section>

            <section
              className="rounded-lg p-4"
              style={{ background: 'var(--bg-app)', border: '1px solid var(--border-subtle)' }}
            >
              <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Video Outputs (SMPTE)
              </h3>
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                DeckLink and other SMPTE/video interfaces are treated separately from desktop display outputs.
              </p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                Planned architecture stub: Blackmagic DeckLink Duo 2 exposes 4 ports, Quad 2 exposes 8 ports, and those PCIe or Thunderbolt 3 video outputs will be configured in a dedicated video-output manager rather than through the graphics display assignments above.
              </p>
            </section>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={handleClose}
            className="text-xs px-3 py-1.5 rounded"
            style={{ background: 'var(--bg-app)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading || saving || hasDisplayConflict}
            onClick={handleSave}
            className="text-xs px-3 py-1.5 rounded font-medium"
            style={{
              background: loading || saving || hasDisplayConflict ? 'var(--bg-hover)' : 'var(--accent)',
              color: loading || saving || hasDisplayConflict ? 'var(--text-tertiary)' : '#fff',
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
