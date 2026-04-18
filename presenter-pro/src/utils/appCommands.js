import { useAppStore } from '@/store/appStore'
import { useEditorStore } from '@/store/editorStore'
import { usePresenterStore } from '@/store/presenterStore'

function isTextFieldFocused() {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable === true
}
import { openOutputWindow } from '@/utils/ipc'
import { startSidebarPresentationSession, stopPresentationSession } from '@/utils/presenterFlow'
import {
  createNewPresentation,
  insertNewSlideIntoCurrentPresentation,
  saveCurrentPresentation,
  saveCurrentPresentationAs,
} from '@/utils/presentationCommands'
import { resolveUnsavedChanges } from '@/utils/unsavedChanges'
import { alertDialog } from '@/utils/dialog'

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
    case 'edit:presentationSettings':
      if (appState.currentView === 'editor') {
        appState.setPresentationSettingsOpen(true)
        return true
      }
      return false
    case 'edit:undo':
      if (isTextFieldFocused()) {
        document.execCommand('undo')
      } else {
        useEditorStore.getState().undo()
      }
      return true
    case 'edit:redo':
      if (isTextFieldFocused()) {
        document.execCommand('redo')
      } else {
        useEditorStore.getState().redo()
      }
      return true
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
    case 'view:filmstrip':
      appState.setFilmstripVisible(!appState.filmstripVisible)
      return true
    case 'view:presenterView': {
      // Presenter view is now the sidebar panel — toggle it
      const open = usePresenterStore.getState().presenterPanelOpen
      usePresenterStore.getState().setPresenterPanelOpen(!open)
      return true
    }
    case 'view:outputWindow':
      return openOutputWindow()
    case 'present:start':
      if (editorState.presentation && !presenterState.isPresenting) {
        const started = await startSidebarPresentationSession(editorState.presentation)
        if (!started) {
          await alertDialog('Add at least one slide before presenting.', { title: 'Nothing to Present' })
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
      await alertDialog('PowerPoint for Worship Media', { title: 'PresenterPro' })
      return true
    default:
      return false
  }
}
