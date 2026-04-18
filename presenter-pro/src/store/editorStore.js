import { create } from 'zustand'
import { normalizePresentation } from '@/utils/backgrounds'

const HISTORY_LIMIT = 50

const snapshot = (state) => ({
  presentation: state.presentation,
  selectedSectionId: state.selectedSectionId,
  selectedSlideId: state.selectedSlideId,
})

const historyOf = (state) => ({
  past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
  future: [],
})

export const useEditorStore = create((set) => ({
  presentationId: null,
  presentation: null,
  selectedSectionId: null,
  selectedSlideId: null,
  editingSlideId: null,
  isDirty: false,
  requiresInitialSave: false,
  past: [],
  future: [],

  setPresentation: (presentation, options = {}) =>
    set({
      presentation: normalizePresentation(presentation),
      presentationId: presentation?.id ?? null,
      isDirty: options.isDirty ?? false,
      requiresInitialSave: options.requiresInitialSave ?? false,
      past: [],
      future: [],
    }),
  setSelectedSlide: (sectionId, slideId) =>
    set({ selectedSectionId: sectionId, selectedSlideId: slideId, editingSlideId: null }),
  setEditingSlide: (slideId) => set({ editingSlideId: slideId }),
  setDirty: (val) => set({ isDirty: val }),
  setRequiresInitialSave: (val) => set({ requiresInitialSave: val }),

  undo: () =>
    set((state) => {
      if (!state.past.length) return {}
      const prev = state.past[state.past.length - 1]
      return {
        past: state.past.slice(0, -1),
        future: [...state.future, snapshot(state)].slice(-HISTORY_LIMIT),
        presentation: prev.presentation,
        selectedSectionId: prev.selectedSectionId,
        selectedSlideId: prev.selectedSlideId,
        editingSlideId: null,
        isDirty: true,
      }
    }),
  redo: () =>
    set((state) => {
      if (!state.future.length) return {}
      const next = state.future[state.future.length - 1]
      return {
        future: state.future.slice(0, -1),
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        presentation: next.presentation,
        selectedSectionId: next.selectedSectionId,
        selectedSlideId: next.selectedSlideId,
        editingSlideId: null,
        isDirty: true,
      }
    }),

  updateSlideBody: (sectionId, slideId, body) =>
    set((state) => {
      if (!state.presentation) return {}
      const sections = state.presentation.sections.map((sec) => {
        if (sec.id !== sectionId) return sec
        return { ...sec, slides: sec.slides.map((sl) => sl.id === slideId ? { ...sl, body } : sl) }
      })
      return { presentation: { ...state.presentation, sections }, isDirty: true, requiresInitialSave: state.requiresInitialSave, ...historyOf(state) }
    }),

  updateSlideStyle: (sectionId, slideId, styleProps) =>
    set((state) => {
      if (!state.presentation) return {}
      const sections = state.presentation.sections.map((sec) => {
        if (sec.id !== sectionId) return sec
        return {
          ...sec,
          slides: sec.slides.map((sl) =>
            sl.id === slideId
              ? { ...sl, textStyle: { ...sl.textStyle, ...styleProps } }
              : sl
          )
        }
      })
      return { presentation: { ...state.presentation, sections }, isDirty: true, requiresInitialSave: state.requiresInitialSave, ...historyOf(state) }
    }),

  updateSlideTextBox: (sectionId, slideId, textBoxProps) =>
    set((state) => {
      if (!state.presentation) return {}
      const sections = state.presentation.sections.map((sec) => {
        if (sec.id !== sectionId) return sec
        return {
          ...sec,
          slides: sec.slides.map((sl) =>
            sl.id === slideId
              ? { ...sl, textBox: { ...sl.textBox, ...textBoxProps } }
              : sl
          )
        }
      })
      return { presentation: { ...state.presentation, sections }, isDirty: true, requiresInitialSave: state.requiresInitialSave, ...historyOf(state) }
    }),

  setSlideBackground: (sectionId, slideId, mediaId) =>
    set((state) => {
      if (!state.presentation) return {}
      const sections = state.presentation.sections.map((sec) => {
        if (sec.id !== sectionId) return sec
        return {
          ...sec,
          slides: sec.slides.map((sl) =>
            sl.id === slideId
              ? { ...sl, backgroundId: mediaId }
              : sl
          )
        }
      })
      return { presentation: normalizePresentation({ ...state.presentation, sections }), isDirty: true, requiresInitialSave: state.requiresInitialSave, ...historyOf(state) }
    }),

  setSectionBackground: (sectionId, mediaId) =>
    set((state) => {
      if (!state.presentation) return {}
      const sections = state.presentation.sections.map((section) =>
        section.id === sectionId
          ? { ...section, backgroundId: mediaId }
          : section
      )
      return {
        presentation: normalizePresentation({ ...state.presentation, sections }),
        isDirty: true,
        requiresInitialSave: state.requiresInitialSave,
        ...historyOf(state),
      }
    }),

  updateSectionMeta: (sectionId, updates) =>
    set((state) => {
      if (!state.presentation) return {}
      const sections = state.presentation.sections.map((sec) =>
        sec.id === sectionId ? { ...sec, ...updates } : sec
      )
      return { presentation: normalizePresentation({ ...state.presentation, sections }), isDirty: true, requiresInitialSave: state.requiresInitialSave, ...historyOf(state) }
    }),

  moveSlideToSection: (slideId, targetSectionId) =>
    set((state) => {
      if (!state.presentation) return {}

      let movedSlide = null
      const sections = state.presentation.sections.map((sec) => {
        const found = sec.slides.find((slide) => slide.id === slideId)
        if (found) movedSlide = found
        return found
          ? { ...sec, slides: sec.slides.filter((slide) => slide.id !== slideId) }
          : sec
      }).map((sec) => {
        if (sec.id !== targetSectionId || !movedSlide) return sec
        return { ...sec, slides: [...sec.slides, movedSlide] }
      })

      return {
        presentation: normalizePresentation({ ...state.presentation, sections }),
        isDirty: true,
        requiresInitialSave: state.requiresInitialSave,
        ...historyOf(state),
      }
    }),

  addSection: (section) =>
    set((state) => {
      if (!state.presentation) return {}
      return {
        presentation: normalizePresentation({
          ...state.presentation,
          sections: [...state.presentation.sections, section]
        }),
        isDirty: true,
        requiresInitialSave: state.requiresInitialSave,
        ...historyOf(state),
      }
    }),

  insertSlideIntoSection: (sectionId, slide) =>
    set((state) => {
      if (!state.presentation) return {}
      const sections = state.presentation.sections.map((section) =>
        section.id === sectionId
          ? { ...section, slides: [...section.slides, slide] }
          : section
      )
      return {
        presentation: normalizePresentation({ ...state.presentation, sections }),
        isDirty: true,
        requiresInitialSave: state.requiresInitialSave,
        ...historyOf(state),
      }
    }),

  mutateSections: (fn) =>
    set((state) => {
      if (!state.presentation) return {}
      const sections = fn(state.presentation.sections)
      return {
        presentation: normalizePresentation({ ...state.presentation, sections }),
        isDirty: true,
        requiresInitialSave: state.requiresInitialSave,
        ...historyOf(state),
      }
    }),

  updatePresentationAspectRatio: (aspectRatio, customAspectWidth, customAspectHeight) =>
    set((state) => {
      if (!state.presentation) return {}
      return {
        presentation: {
          ...state.presentation,
          aspectRatio,
          customAspectWidth: customAspectWidth ?? state.presentation.customAspectWidth,
          customAspectHeight: customAspectHeight ?? state.presentation.customAspectHeight,
        },
        isDirty: true,
        requiresInitialSave: state.requiresInitialSave,
      }
    }),
}))
