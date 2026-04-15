import { create } from 'zustand'

export const useAppStore = create((set) => ({
  currentView: 'home',
  homeTab: 'home',
  recentPresentations: [],
  outputConnected: false,
  songLibraryOpen: false,
  mediaLibraryOpen: false,
  allowWindowClose: false,
  shortcutsOpen: false,
  filmstripVisible: true,
  tutorialOpen: false,
  tutorialStepIndex: 0,

  setCurrentView: (view) => set({ currentView: view }),
  setHomeTab: (tab) => set({ homeTab: tab }),
  setRecentPresentations: (list) => set({ recentPresentations: list }),
  setOutputConnected: (val) => set({ outputConnected: val }),
  setSongLibraryOpen: (val) => set({ songLibraryOpen: val }),
  setMediaLibraryOpen: (val) => set({ mediaLibraryOpen: val }),
  setAllowWindowClose: (val) => set({ allowWindowClose: val }),
  setShortcutsOpen: (val) => set({ shortcutsOpen: val }),
  setFilmstripVisible: (val) => set({ filmstripVisible: val }),
  setTutorialOpen: (val) => set({ tutorialOpen: val }),
  setTutorialStepIndex: (val) => set({ tutorialStepIndex: val }),
}))
