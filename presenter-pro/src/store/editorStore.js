import { create } from 'zustand'
import { normalizePresentation } from '@/utils/backgrounds'

export const useEditorStore = create((set) => ({
  presentationId: null,
  presentation: null,
  selectedSectionId: null,
  selectedSlideId: null,
  editingSlideId: null,
  isDirty: false,
  requiresInitialSave: false,
  zoom: 1.0,

  setPresentation: (presentation, options = {}) =>
    set({
      presentation: normalizePresentation(presentation),
      presentationId: presentation?.id ?? null,
      isDirty: options.isDirty ?? false,
      requiresInitialSave: options.requiresInitialSave ?? false,
    }),
  setSelectedSlide: (sectionId, slideId) =>
    set({ selectedSectionId: sectionId, selectedSlideId: slideId, editingSlideId: null }),
  setEditingSlide: (slideId) => set({ editingSlideId: slideId }),
  setDirty: (val) => set({ isDirty: val }),
  setRequiresInitialSave: (val) => set({ requiresInitialSave: val }),
  setZoom: (zoom) => set({ zoom }),

  updateSlideBody: (sectionId, slideId, body) =>
    set((state) => {
      if (!state.presentation) return {}
      const sections = state.presentation.sections.map((sec) => {
        if (sec.id !== sectionId) return sec
        return { ...sec, slides: sec.slides.map((sl) => sl.id === slideId ? { ...sl, body } : sl) }
      })
      return { presentation: { ...state.presentation, sections }, isDirty: true, requiresInitialSave: state.requiresInitialSave }
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
      return { presentation: { ...state.presentation, sections }, isDirty: true, requiresInitialSave: state.requiresInitialSave }
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
      return { presentation: normalizePresentation({ ...state.presentation, sections }), isDirty: true, requiresInitialSave: state.requiresInitialSave }
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
      }
    }),

  updateSectionMeta: (sectionId, updates) =>
    set((state) => {
      if (!state.presentation) return {}
      const sections = state.presentation.sections.map((sec) =>
        sec.id === sectionId ? { ...sec, ...updates } : sec
      )
      return { presentation: normalizePresentation({ ...state.presentation, sections }), isDirty: true, requiresInitialSave: state.requiresInitialSave }
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
      }
    }),
}))
