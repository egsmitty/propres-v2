import React, { useEffect, useRef, useState } from 'react'
import { ChevronLeft, Pencil } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { useAppStore } from '@/store/appStore'
import { touchPresentation } from '@/utils/ipc'
import { resolveUnsavedChanges } from '@/utils/unsavedChanges'

export default function TitleBar() {
  const presentation = useEditorStore((s) => s.presentation)
  const isDirty = useEditorStore((s) => s.isDirty)
  const requiresInitialSave = useEditorStore((s) => s.requiresInitialSave)
  const setDirty = useEditorStore((s) => s.setDirty)
  const setRequiresInitialSave = useEditorStore((s) => s.setRequiresInitialSave)
  const setPresentation = useEditorStore((s) => s.setPresentation)
  const currentView = useAppStore((s) => s.currentView)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const setHomeTab = useAppStore((s) => s.setHomeTab)
  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState('')
  const renameRef = useRef(null)

  useEffect(() => {
    if (renaming && renameRef.current) {
      renameRef.current.focus()
      renameRef.current.select()
    }
  }, [renaming])

  async function handleBack() {
    const canLeave = await resolveUnsavedChanges({
      presentation,
      isDirty,
      requiresInitialSave,
      setDirty,
      setRequiresInitialSave,
      actionLabel: 'go back home',
    })
    if (!canLeave) return

    if (presentation?.id) {
      await touchPresentation(presentation.id)
    }
    setHomeTab('home')
    setCurrentView('home')
  }

  function startRename() {
    setRenameVal(presentation.title)
    setRenaming(true)
  }

  function commitRename() {
    const title = renameVal.trim() || presentation.title
    if (title !== presentation.title) {
      setPresentation({ ...presentation, title })
      setDirty(true)
    }
    setRenaming(false)
  }

  function handleRenameKey(e) {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') setRenaming(false)
  }

  if (currentView !== 'editor' || !presentation) {
    return null
  }

  return (
    <div
      className="flex items-center justify-between gap-4 px-4 py-2.5 shrink-0"
      style={{
        background: 'var(--bg-toolbar)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium shrink-0"
          style={{
            color: 'var(--text-primary)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
          }}
          title="Back to Home"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-surface)' }}
        >
          <ChevronLeft size={13} />
          Home
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {!renaming ? (
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                {presentation.title}
              </p>
            ) : null}
            {!renaming && (
              <button
                type="button"
                onClick={startRename}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium shrink-0"
                style={{
                  color: 'var(--text-primary)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-surface)' }}
              >
                <Pencil size={12} />
                Rename
              </button>
            )}
          </div>
          {renaming ? (
            <input
              ref={renameRef}
              value={renameVal}
              onChange={(e) => setRenameVal(e.target.value)}
              onBlur={commitRename}
              onKeyDown={handleRenameKey}
              className="mt-1 text-sm px-2 py-1 rounded outline-none w-full max-w-[22rem]"
              style={{
                color: 'var(--text-primary)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-focus)',
              }}
            />
          ) : (
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              Presentation title
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium"
          style={{
            color: isDirty || requiresInitialSave ? '#9a3412' : 'var(--text-secondary)',
            background: isDirty || requiresInitialSave ? 'rgba(249,115,22,0.12)' : 'var(--bg-surface)',
            border: `1px solid ${isDirty || requiresInitialSave ? 'rgba(249,115,22,0.22)' : 'var(--border-default)'}`,
          }}
          title={isDirty || requiresInitialSave ? 'Unsaved changes' : 'Saved'}
        >
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: isDirty || requiresInitialSave ? '#f97316' : '#10b981' }}
          />
          {isDirty || requiresInitialSave ? 'Unsaved changes' : 'Saved'}
        </span>
      </div>
    </div>
  )
}
