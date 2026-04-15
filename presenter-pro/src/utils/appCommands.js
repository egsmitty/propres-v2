import { useAppStore } from '@/store/appStore'
import { useEditorStore } from '@/store/editorStore'
import { usePresenterStore } from '@/store/presenterStore'
import { openOutputWindow, openPresenterView } from '@/utils/ipc'
import { startPresentationSession, stopPresentationSession } from '@/utils/presenterFlow'
import {
  createNewPresentation,
  insertNewSlideIntoCurrentPresentation,
  saveCurrentPresentation,
  saveCurrentPresentationAs,
} from '@/utils/presentationCommands'
import { resolveUnsavedChanges } from '@/utils/unsavedChanges'

export async function runAppCommand(command) {
  const appState = useAppStore.getState()
  const editorState = useEditorStore.getState()
  const presenterState = usePresenterStore.getState()

  switch (command) {
    case 'file:new':
      return createNewPresentation()
    case 'file:open':
      appState.setHomeTab('open')
      appState.setCurrentView('home')
      return true
    case 'file:save':
      return saveCurrentPresentation()
    case 'file:saveAs':
      return saveCurrentPresentationAs()
    case 'file:close': {
      const canClose = await resolveUnsavedChanges(
        {
          presentation: editorState.presentation,
          isDirty: editorState.isDirty,
          requiresInitialSave: editorState.requiresInitialSave,
          setDirty: editorState.setDirty,
          setRequiresInitialSave: editorState.setRequiresInitialSave,
          actionLabel: 'close this presentation',
        }
      )
      if (canClose) {
        appState.setHomeTab('home')
        appState.setCurrentView('home')
      }
      return canClose
    }
    case 'insert:newSlide':
    case 'insert:blank':
      return insertNewSlideIntoCurrentPresentation()
    case 'insert:song':
      appState.setSongLibraryOpen(true)
      return true
    case 'insert:image':
    case 'insert:video':
      appState.setMediaLibraryOpen(true)
      return true
    case 'view:zoomIn':
      editorState.setZoom(Math.min(2, (editorState.zoom || 1) + 0.1))
      return true
    case 'view:zoomOut':
      editorState.setZoom(Math.max(0.5, (editorState.zoom || 1) - 0.1))
      return true
    case 'view:filmstrip':
      appState.setFilmstripVisible(!appState.filmstripVisible)
      return true
    case 'view:presenterView':
      return openPresenterView()
    case 'view:outputWindow':
      return openOutputWindow()
    case 'present:start':
      if (editorState.presentation && !presenterState.isPresenting) {
        const started = await startPresentationSession(editorState.presentation)
        if (!started) {
          window.alert('Add at least one slide before presenting.')
        }
        return started
      }
      return false
    case 'present:stop':
      if (presenterState.isPresenting) return stopPresentationSession()
      return false
    case 'present:black':
      if (presenterState.isPresenting) return window.electronAPI?.sendBlack()
      return false
    case 'present:logo':
      if (presenterState.isPresenting) return window.electronAPI?.sendLogo()
      return false
    case 'help:shortcuts':
      appState.setShortcutsOpen(true)
      return true
    case 'help:tutorial':
      if (appState.currentView === 'home') {
        appState.setHomeTab('home')
      }
      appState.setTutorialStepIndex(appState.currentView === 'editor' ? 2 : 0)
      appState.setTutorialOpen(true)
      return true
    case 'help:about':
      window.alert('PresenterPro\nPowerPoint for Worship Media')
      return true
    default:
      return false
  }
}
