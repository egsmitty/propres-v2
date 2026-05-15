import { create } from 'zustand'

const PRESENTER_PANEL_WIDTH_KEY = 'presenterpro.presenterPanelWidth'
const PRESENTER_PANEL_MIN_WIDTH = 240
const PRESENTER_PANEL_MAX_WIDTH_RATIO = 0.75

function getMaxPresenterPanelWidth() {
  if (typeof window === 'undefined') return 960
  return Math.floor(window.innerWidth * PRESENTER_PANEL_MAX_WIDTH_RATIO)
}

function getInitialPresenterPanelWidth() {
  if (typeof window === 'undefined') return 320
  const saved = Number(window.localStorage.getItem(PRESENTER_PANEL_WIDTH_KEY))
  const maxWidth = getMaxPresenterPanelWidth()
  if (Number.isFinite(saved) && saved >= PRESENTER_PANEL_MIN_WIDTH && saved <= maxWidth) {
    return saved
  }
  return 320
}

export const usePresenterStore = create((set) => ({
  isPresenting: false,
  liveSlideId: null,
  liveSectionId: null,
  isBlack: false,
  isLogo: false,
  slideHistory: [],
  presenterPanelOpen: typeof window !== 'undefined' ? window.innerWidth >= 1400 : true,
  presenterPanelWidth: getInitialPresenterPanelWidth(),
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
  setPresenterPanelWidth: (width) => {
    const nextWidth = Math.min(getMaxPresenterPanelWidth(), Math.max(PRESENTER_PANEL_MIN_WIDTH, width))
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PRESENTER_PANEL_WIDTH_KEY, String(nextWidth))
    }
    set({ presenterPanelWidth: nextWidth })
  },
  setAllSlides: (slides) => set({ allSlides: slides }),
}))
