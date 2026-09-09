import React from 'react';
import { useAppStore } from '@/store/appStore';
import TitleBar from '@/components/layout/TitleBar';
import MenuBar from '@/components/layout/MenuBar';
import Home from '@/pages/Home';
import Editor from '@/pages/Editor';
import OutputRenderer from '@/components/presenter/OutputRenderer';
import StageDisplayRenderer from '@/components/presenter/StageDisplayRenderer';
import ErrorBoundary from '@/components/shared/ErrorBoundary';
import ShortcutsOverlay from '@/components/shared/ShortcutsOverlay';
import OnboardingTutorial from '@/components/shared/OnboardingTutorial';
import DialogHost from '@/components/shared/Dialog';
import { offerRecoveryOnStartup } from '@/utils/recoveryJournalSync';
import { startAutosave } from '@/utils/autosaveSync';
import { runAppCommand } from '@/utils/appCommands';
import { ensureBuiltInSongsSeeded } from '@/utils/builtInSongSeed';
import { getSettings, onAppCommand, setSetting } from '@/utils/ipc';

const hash = window.location.hash;
const isOutputWindow = hash.startsWith('#/output');
const isStageDisplayWindow = hash.startsWith('#/stage-display');

export default function App() {
  const currentView = useAppStore((s) => s.currentView);
  const shortcutsOpen = useAppStore((s) => s.shortcutsOpen);
  const setShortcutsOpen = useAppStore((s) => s.setShortcutsOpen);
  const tutorialOpen = useAppStore((s) => s.tutorialOpen);
  const setTutorialOpen = useAppStore((s) => s.setTutorialOpen);
  const setTutorialStepIndex = useAppStore((s) => s.setTutorialStepIndex);

  React.useEffect(() => {
    return onAppCommand((command) => {
      runAppCommand(command);
    });
  }, []);

  // Drain any journal left by a pre-autosave build (plan A5 slice 3). Nothing
  // writes journals any more — autosave puts edits in the real record — so this
  // finds nothing on a profile that has already been drained once.
  React.useEffect(() => {
    if (isOutputWindow || isStageDisplayWindow) return;
    offerRecoveryOnStartup().catch((error) => {
      console.error('[recovery] failed to check for unsaved work:', error);
    });
  }, []);

  // Autosave (plan A5): main window only. The output and stage windows never
  // edit, and three processes writing the same row would race.
  React.useEffect(() => {
    if (isOutputWindow || isStageDisplayWindow) return;
    return startAutosave();
  }, []);

  React.useEffect(() => {
    if (isOutputWindow || isStageDisplayWindow) return;

    let cancelled = false;

    async function loadTutorialState() {
      const result = await getSettings();
      if (cancelled) return;

      const shouldShow = result?.success ? result.data?.tutorial_completed !== 'true' : true;

      setTutorialStepIndex(0);
      setTutorialOpen(shouldShow);
    }

    loadTutorialState();
    return () => {
      cancelled = true;
    };
  }, [setTutorialOpen, setTutorialStepIndex]);

  React.useEffect(() => {
    if (isOutputWindow || isStageDisplayWindow) return;
    ensureBuiltInSongsSeeded().catch((error) => {
      console.error('Failed to seed built-in songs', error);
    });
  }, []);

  async function handleDismissTutorial() {
    setTutorialOpen(false);
    setTutorialStepIndex(0);
    await setSetting('tutorial_completed', 'true');
  }

  if (isOutputWindow)
    return (
      <>
        <OutputRenderer />
        <DialogHost />
      </>
    );
  if (isStageDisplayWindow)
    return (
      <>
        <StageDisplayRenderer />
        <DialogHost />
      </>
    );

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
  );
}
