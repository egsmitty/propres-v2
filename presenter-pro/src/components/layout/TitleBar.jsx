import React, { useState, useRef, useEffect } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { useAppStore } from '@/store/appStore'
import { resolveUnsavedChanges } from '@/utils/unsavedChanges'

export default function TitleBar() {
  const presentation = useEditorStore((s) => s.presentation)
  const isDirty = useEditorStore((s) => s.isDirty)
  const setDirty = useEditorStore((s) => s.setDirty)
  const setPresentation = useEditorStore((s) => s.setPresentation)
  const currentView = useAppStore((s) => s.currentView)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const setAllowWindowClose = useAppStore((s) => s.setAllowWindowClose)
  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState('')
  const renameRef = useRef(null)

  useEffect(() => {
    if (renaming && renameRef.current) {
      renameRef.current.focus()
      renameRef.current.select()
    }
  }, [renaming])

  async function handleClose() {
    const canClose = await resolveUnsavedChanges(presentation, isDirty, setDirty, 'close the window')
    if (!canClose) return

    setAllowWindowClose(true)
    window.electronAPI?.windowClose()
  }
  function handleMinimize() { window.electronAPI?.windowMinimize() }
  function handleMaximize() { window.electronAPI?.windowMaximize() }

  async function handleBack() {
    const canLeave = await resolveUnsavedChanges(presentation, isDirty, setDirty, 'go back home')
    if (!canLeave) return

    setCurrentView('home')
  }

  function startRename() {
    setRenameVal(presentation.title)
    setRenaming(true)
  }

  function commitRename() {
    const title = renameVal.trim() || presentation.title
    setPresentation({ ...presentation, title })
    setDirty(true)
    setRenaming(false)
  }

  function handleRenameKey(e) {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') setRenaming(false)
  }

  return (
    <div
      className="flex items-center h-9 px-3 shrink-0"
      style={{
        background: 'var(--bg-toolbar)',
        borderBottom: '1px solid var(--border-subtle)',
        WebkitAppRegion: 'drag',
      }}
    >
      {/* Window controls */}
      <div className="flex items-center gap-1.5 mr-3" style={{ WebkitAppRegion: 'no-drag' }}>
        <button onClick={handleClose} className="w-3 h-3 rounded-full" style={{ background: '#ff5f57' }} title="Close" />
        <button onClick={handleMinimize} className="w-3 h-3 rounded-full" style={{ background: '#febc2e' }} title="Minimize" />
        <button onClick={handleMaximize} className="w-3 h-3 rounded-full" style={{ background: '#28c840' }} title="Maximize" />
      </div>

      {/* Back button */}
      {currentView === 'editor' && (
        <button
          onClick={handleBack}
          className="flex items-center gap-0.5 mr-2 px-1 py-0.5 rounded text-xs"
          style={{ color: 'var(--text-secondary)', WebkitAppRegion: 'no-drag' }}
          title="Back to Home"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
        >
          <ChevronLeft size={13} />
          Home
        </button>
      )}

      {/* App name */}
      <span className="text-xs font-medium mr-2" style={{ color: 'var(--text-secondary)' }}>
        PresenterPro
      </span>

      {/* Presentation title — double-click to rename */}
      {currentView === 'editor' && presentation && (
        <>
          <span style={{ color: 'var(--text-tertiary)' }} className="mr-2 text-xs">—</span>
          {renaming ? (
            <input
              ref={renameRef}
              value={renameVal}
              onChange={(e) => setRenameVal(e.target.value)}
              onBlur={commitRename}
              onKeyDown={handleRenameKey}
              className="text-xs px-1 rounded outline-none"
              style={{
                color: 'var(--text-primary)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-focus)',
                WebkitAppRegion: 'no-drag',
                minWidth: 120,
              }}
            />
          ) : (
            <span
              className="text-xs cursor-default"
              style={{ color: isDirty ? 'var(--text-primary)' : 'var(--text-secondary)', WebkitAppRegion: 'no-drag' }}
              onDoubleClick={startRename}
              title="Double-click to rename"
            >
              {presentation.title}
            </span>
          )}
          {isDirty && !renaming && (
            <span
              className="ml-1.5 inline-block w-2 h-2 rounded-full"
              style={{ background: '#f97316' }}
              title="Unsaved changes"
            />
          )}
        </>
      )}
    </div>
  )
}
