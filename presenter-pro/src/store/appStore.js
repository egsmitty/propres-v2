import { create } from 'zustand'

export const useAppStore = create((set) => ({
  currentView: 'home',
  recentPresentations: [],
  outputConnected: false,
  songLibraryOpen: false,
  mediaLibraryOpen: false,
  allowWindowClose: false,
  shortcutsOpen: false,
  filmstripVisible: true,

  setCurrentView: (view) => set({ currentView: view }),
  setRecentPresentations: (list) => set({ recentPresentations: list }),
  setOutputConnected: (val) => set({ outputConnected: val }),
  setSongLibraryOpen: (val) => set({ songLibraryOpen: val }),
  setMediaLibraryOpen: (val) => set({ mediaLibraryOpen: val }),
  setAllowWindowClose: (val) => set({ allowWindowClose: val }),
  setShortcutsOpen: (val) => set({ shortcutsOpen: val }),
  setFilmstripVisible: (val) => set({ filmstripVisible: val }),
}))
