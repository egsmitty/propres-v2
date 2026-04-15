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
import { runAppCommand } from '@/utils/appCommands'

const hash = window.location.hash
const isPresenterWindow = hash.startsWith('#/presenter')
const isOutputWindow = hash.startsWith('#/output')

export default function App() {
  const currentView = useAppStore((s) => s.currentView)
  const shortcutsOpen = useAppStore((s) => s.shortcutsOpen)
  const setShortcutsOpen = useAppStore((s) => s.setShortcutsOpen)

  React.useEffect(() => {
    const api = window.electronAPI
    if (!api?.onAppCommand) return
    api.onAppCommand((command) => {
      runAppCommand(command)
    })
  }, [])

  if (isOutputWindow) return <OutputRenderer />
  if (isPresenterWindow) return <PresenterView />

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
    </div>
  )
}
