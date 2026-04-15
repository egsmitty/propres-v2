import React, { useEffect } from 'react'
import Toolbar from '@/components/layout/Toolbar'
import StatusBar from '@/components/layout/StatusBar'
import Filmstrip from '@/components/editor/Filmstrip'
import Canvas from '@/components/editor/Canvas'
import SongLibraryPanel from '@/components/library/SongLibraryPanel'
import MediaLibraryPanel from '@/components/library/MediaLibraryPanel'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import { useAppStore } from '@/store/appStore'
import { useEditorStore } from '@/store/editorStore'
import { usePresenterStore } from '@/store/presenterStore'
import { updatePresentation } from '@/utils/ipc'
import { startPresentationSession, stopPresentationSession } from '@/utils/presenterFlow'

export default function Editor() {
  const songLibraryOpen = useAppStore((s) => s.songLibraryOpen)
  const mediaLibraryOpen = useAppStore((s) => s.mediaLibraryOpen)
  const filmstripVisible = useAppStore((s) => s.filmstripVisible)
  const allowWindowClose = useAppStore((s) => s.allowWindowClose)
  const setAllowWindowClose = useAppStore((s) => s.setAllowWindowClose)
  const isPresenting = usePresenterStore((s) => s.isPresenting)
  const stopPresenting = usePresenterStore((s) => s.stopPresenting)
  const setLiveSlide = usePresenterStore((s) => s.setLiveSlide)
  const setBlack = usePresenterStore((s) => s.setBlack)
  const setLogo = usePresenterStore((s) => s.setLogo)
  const presentation = useEditorStore((s) => s.presentation)
  const isDirty = useEditorStore((s) => s.isDirty)
  const requiresInitialSave = useEditorStore((s) => s.requiresInitialSave)
  const setDirty = useEditorStore((s) => s.setDirty)
  const setRequiresInitialSave = useEditorStore((s) => s.setRequiresInitialSave)
  const editingSlideId = useEditorStore((s) => s.editingSlideId)
  const panelOpen = songLibraryOpen || mediaLibraryOpen

  // Listen for stop signal from output window (when presenter closes)
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.onPresenterStop) return
    return api.onPresenterStop(() => stopPresenting())
  }, [stopPresenting])

  // Listen for slide advance from presenter window → sync live slide in editor
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.onSlideAdvance) return
    return api.onSlideAdvance(({ slide }) => {
      if (slide?.sectionId) setLiveSlide(slide.sectionId, slide.id)
    })
  }, [setLiveSlide])

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.onOutputBlack || !api?.onOutputLogo) return

    const offBlack = api.onOutputBlack(({ active }) => setBlack(Boolean(active)))
    const offLogo = api.onOutputLogo(({ active }) => setLogo(Boolean(active)))
    return () => {
      offBlack?.()
      offLogo?.()
    }
  }, [setBlack, setLogo])

  useEffect(() => {
    function handleBeforeUnload(e) {
      if (!presentation || (!isDirty && !requiresInitialSave)) return

      if (useAppStore.getState().allowWindowClose) {
        setAllowWindowClose(false)
        return
      }

      const shouldClose = window.confirm('You have unsaved changes. Close without saving?')
      if (!shouldClose) {
        e.preventDefault()
        e.returnValue = false
        return false
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [presentation, isDirty, requiresInitialSave, allowWindowClose, setAllowWindowClose])

  useEffect(() => {
    function handleKeyDown(e) {
      if (panelOpen) return
      if (editingSlideId) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return

      const meta = e.metaKey || e.ctrlKey

      if (meta && e.key === 's') { e.preventDefault(); handleSave(); return }
      if (e.key === 'F5') { e.preventDefault(); handlePresent(); return }
      if (e.key === 'Escape' && isPresenting) { e.preventDefault(); handleStopPresenting(); return }
      if (e.key === '?' && !meta) {
        useAppStore.getState().setShortcutsOpen(!useAppStore.getState().shortcutsOpen)
        return
      }
      if ((e.key === 'b' || e.key === 'B') && isPresenting && !meta) {
        window.electronAPI?.sendBlack(); return
      }
      if ((e.key === 'l' || e.key === 'L') && isPresenting && !meta) {
        window.electronAPI?.sendLogo(); return
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editingSlideId, isPresenting, presentation, isDirty, requiresInitialSave, panelOpen])

  async function handleSave() {
    if (!presentation || (!isDirty && !requiresInitialSave)) return
    const result = await updatePresentation(presentation.id, presentation)
    if (result?.success) {
      setDirty(false)
      setRequiresInitialSave(false)
      return
    }

    window.alert(result?.error || 'Failed to save your presentation.')
  }

  async function handlePresent() {
    if (!presentation) return
    if (panelOpen) {
      window.alert('Close the Song Library or Media Library before presenting.')
      return
    }
    if (isPresenting) {
      handleStopPresenting()
      return
    }

    const started = await startPresentationSession(presentation)
    if (!started) {
      window.alert('Add at least one slide before presenting.')
    }
  }

  function handleStopPresenting() {
    stopPresentationSession()
      .catch(() => stopPresenting())
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {isPresenting && <LiveBanner onStop={handleStopPresenting} />}
      <Toolbar onPresent={handlePresent} />
      <div className="flex flex-1 overflow-hidden relative">
        {songLibraryOpen && <SongLibraryPanel />}
        {mediaLibraryOpen && <MediaLibraryPanel />}
        <div
          className="flex flex-1 overflow-hidden"
          style={{ pointerEvents: panelOpen ? 'none' : 'auto' }}
        >
          {filmstripVisible && <ErrorBoundary label="Filmstrip error"><Filmstrip /></ErrorBoundary>}
          <ErrorBoundary label="Canvas error"><Canvas onSave={handleSave} /></ErrorBoundary>
        </div>
      </div>
      <StatusBar />
    </div>
  )
}

function LiveBanner({ onStop }) {
  const presentation = useEditorStore((s) => s.presentation)
  const liveSlideId = usePresenterStore((s) => s.liveSlideId)

  let slideNum = 0
  let totalSlides = 0
  if (presentation) {
    let i = 0
    for (const sec of presentation.sections) {
      for (const sl of sec.slides) {
        i++
        totalSlides++
        if (sl.id === liveSlideId) slideNum = i
      }
    }
  }

  return (
    <div
      className="flex items-center justify-between px-4 shrink-0"
      style={{
        background: 'var(--live-bg)',
        borderBottom: '1px solid var(--live-border)',
        color: 'var(--live)',
        height: 32,
      }}
    >
      <span className="text-xs font-medium">
        Presenting{slideNum > 0 && ` — Slide ${slideNum} of ${totalSlides}`}
      </span>
      <button
        onClick={onStop}
        className="text-xs px-2 py-0.5 rounded font-medium"
        style={{
          background: 'var(--live-dim)',
          color: 'var(--live)',
          border: '1px solid var(--live-border)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--live-border)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--live-dim)')}
      >
        Stop Presenting
      </button>
    </div>
  )
}
