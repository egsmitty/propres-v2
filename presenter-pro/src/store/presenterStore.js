import { create } from 'zustand'

export const usePresenterStore = create((set) => ({
  isPresenting: false,
  liveSlideId: null,
  liveSectionId: null,
  isBlack: false,
  isLogo: false,
  slideHistory: [],

  startPresenting: (sectionId, slideId) =>
    set({ isPresenting: true, liveSectionId: sectionId, liveSlideId: slideId, isBlack: false, isLogo: false }),
  stopPresenting: () =>
    set({ isPresenting: false, liveSlideId: null, liveSectionId: null, isBlack: false, isLogo: false, slideHistory: [] }),
  setLiveSlide: (sectionId, slideId) =>
    set((state) => ({
      liveSectionId: sectionId,
      liveSlideId: slideId,
      slideHistory: state.liveSlideId
        ? [...state.slideHistory, { sectionId: state.liveSectionId, slideId: state.liveSlideId }]
        : state.slideHistory
    })),
  setBlack: (val) => set({ isBlack: val, isLogo: false }),
  setLogo: (val) => set({ isLogo: val, isBlack: false }),
}))
