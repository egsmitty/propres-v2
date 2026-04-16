import { create } from 'zustand'

export const useDialogStore = create((set) => ({
  dialog: null,
  show: (config) => set({ dialog: config }),
  close: () => set({ dialog: null }),
}))
