import React from 'react'
import { useAppStore } from '@/store/appStore'
import TitleBar from '@/components/layout/TitleBar'
import MenuBar from '@/components/layout/MenuBar'
import Home from '@/pages/Home'
import Editor from '@/pages/Editor'
import PresenterView from '@/components/presenter/PresenterView'
import OutputRenderer from '@/components/presenter/OutputRenderer'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import ShortcutsOverlay from '@/components/shared/ShortcutsOverlay'
import OnboardingTutorial from '@/components/shared/OnboardingTutorial'
import DialogHost from '@/components/shared/Dialog'
import { runAppCommand } from '@/utils/appCommands'
import { getSettings, setSetting } from '@/utils/ipc'

const hash = window.location.hash
const isPresenterWindow = hash.startsWith('#/presenter')
const isOutputWindow = hash.startsWith('#/output')

export default function App() {
  const currentView = useAppStore((s) => s.currentView)
  const shortcutsOpen = useAppStore((s) => s.shortcutsOpen)
  const setShortcutsOpen = useAppStore((s) => s.setShortcutsOpen)
  const tutorialOpen = useAppStore((s) => s.tutorialOpen)
  const setTutorialOpen = useAppStore((s) => s.setTutorialOpen)
  const setTutorialStepIndex = useAppStore((s) => s.setTutorialStepIndex)

  React.useEffect(() => {
    const api = window.electronAPI
    if (!api?.onAppCommand) return
    return api.onAppCommand((command) => {
      runAppCommand(command)
    })
  }, [])

  React.useEffect(() => {
    if (isPresenterWindow || isOutputWindow) return

    let cancelled = false

    async function loadTutorialState() {
      const result = await getSettings()
      if (cancelled) return

      const shouldShow = result?.success
        ? result.data?.tutorial_completed !== 'true'
        : true

      setTutorialStepIndex(0)
      setTutorialOpen(shouldShow)
    }

    loadTutorialState()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleDismissTutorial() {
    setTutorialOpen(false)
    setTutorialStepIndex(0)
    await setSetting('tutorial_completed', 'true')
  }

  if (isOutputWindow) return <><OutputRenderer /><DialogHost /></>
  if (isPresenterWindow) return <><PresenterView /><DialogHost /></>

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TitleBar />
      {currentView === 'editor' && <MenuBar />}
      <div className="flex-1 overflow-hidden">
        <ErrorBoundary label="Failed to load view">
          {currentView === 'home' ? <Home /> : <Editor />}
        </ErrorBoundary>
      </div>
      {shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}
      {tutorialOpen && <OnboardingTutorial onComplete={handleDismissTutorial} />}
      <DialogHost />
    </div>
  )
}
