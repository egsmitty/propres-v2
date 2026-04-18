import { create } from 'zustand'

export const usePresenterStore = create((set) => ({
  isPresenting: false,
  liveSlideId: null,
  liveSectionId: null,
  isBlack: false,
  isLogo: false,
  slideHistory: [],
  presenterPanelOpen: typeof window !== 'undefined' ? window.innerWidth >= 1400 : true,
  presenterPanelWidth: 320,
  allSlides: [],

  startPresenting: (sectionId, slideId) =>
    set({ isPresenting: true, liveSectionId: sectionId, liveSlideId: slideId, isBlack: false, isLogo: false }),
  stopPresenting: () =>
    set({ isPresenting: false, liveSlideId: null, liveSectionId: null, isBlack: false, isLogo: false, slideHistory: [], allSlides: [] }),
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
  setPresenterPanelOpen: (open) => set({ presenterPanelOpen: open }),
  setPresenterPanelWidth: (width) => set({ presenterPanelWidth: width }),
  setAllSlides: (slides) => set({ allSlides: slides }),
}))
