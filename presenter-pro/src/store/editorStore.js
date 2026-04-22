import { create } from 'zustand'
import { normalizePresentation } from '@/utils/backgrounds'
import {
  DEFAULT_TEXT_BOX,
  createDefaultTextBoxForSlide,
  createTextBox,
  getSlideTextBoxes,
  mergeTextBox,
  mergeTextStyle,
  reorderTextBoxes,
  syncLegacyTextFields,
  withUpdatedSlideTextBoxes,
} from '@/utils/textBoxes'

const HISTORY_LIMIT = 50

const snapshot = (state) => ({
  presentation: state.presentation,
  selectedSectionId: state.selectedSectionId,
  selectedSlideId: state.selectedSlideId,
  selectedSlideIds: state.selectedSlideIds,
})

const historyOf = (state) => ({
  past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
  future: [],
})

function updateSlideInPresentation(presentation, sectionId, slideId, updater) {
  return presentation.sections.map((sec) => {
    if (sec.id !== sectionId) return sec
    return {
      ...sec,
      slides: sec.slides.map((slide) => {
        if (slide.id !== slideId) return slide
        return updater(slide)
      }),
    }
  })
}

function commitTextBoxMutation(state, sectionId, slideId, updater) {
  if (!state.presentation) return {}
  const sections = updateSlideInPresentation(state.presentation, sectionId, slideId, (slide) => updater(slide))
  return {
    presentation: { ...state.presentation, sections },
    isDirty: true,
    requiresInitialSave: state.requiresInitialSave,
    ...historyOf(state),
  }
}

function targetIdsForSlide(slide, textBoxIds) {
  if (Array.isArray(textBoxIds) && textBoxIds.length) return textBoxIds
  return getSlideTextBoxes(slide).slice(0, 1).map((box) => box.id)
}

export const useEditorStore = create((set) => ({
  presentationId: null,
  presentation: null,
  selectedSectionId: null,
  selectedSlideId: null,
  selectedSlideIds: [],
  lastAddedTextBoxId: null,
  editingSlideId: null,
  isDirty: false,
  requiresInitialSave: false,
  past: [],
  future: [],

  setPresentation: (presentation, options = {}) =>
    set({
      presentation: normalizePresentation(presentation),
      presentationId: presentation?.id ?? null,
      selectedSectionId: null,
      selectedSlideId: null,
      selectedSlideIds: [],
      lastAddedTextBoxId: null,
      editingSlideId: null,
      isDirty: options.isDirty ?? false,
      requiresInitialSave: options.requiresInitialSave ?? false,
      past: [],
      future: [],
    }),
  setSelectedSlide: (sectionId, slideId) =>
    set({
      selectedSectionId: sectionId,
      selectedSlideId: slideId,
      selectedSlideIds: [],
      editingSlideId: null,
    }),
  setSelectedSlideIds: (ids) => set({ selectedSlideIds: ids }),
  clearLastAddedTextBoxId: () => set({ lastAddedTextBoxId: null }),
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
        selectedSlideIds: prev.selectedSlideIds || [],
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
        selectedSlideIds: next.selectedSlideIds || [],
        editingSlideId: null,
        isDirty: true,
      }
    }),

  updateSlideBody: (sectionId, slideId, body, textBoxId = null) =>
    set((state) =>
      commitTextBoxMutation(state, sectionId, slideId, (slide) =>
        withUpdatedSlideTextBoxes(slide, (boxes) =>
          boxes.map((box, index) => {
            const id = textBoxId || boxes[0]?.id || (index === 0 ? box.id : null)
            return box.id === id ? { ...box, body } : box
          })
        )
      )
    ),

  updateSlideStyle: (sectionId, slideId, styleProps, textBoxIds = null) =>
    set((state) =>
      commitTextBoxMutation(state, sectionId, slideId, (slide) => {
        const ids = targetIdsForSlide(slide, textBoxIds)
        return withUpdatedSlideTextBoxes(slide, (boxes) =>
          boxes.map((box) =>
            ids.includes(box.id)
              ? { ...box, textStyle: mergeTextStyle({ ...box.textStyle, ...styleProps }) }
              : box
          )
        )
      })
    ),

  updateSlideTextBox: (sectionId, slideId, textBoxProps, textBoxIds = null) =>
    set((state) =>
      commitTextBoxMutation(state, sectionId, slideId, (slide) => {
        const ids = targetIdsForSlide(slide, textBoxIds)
        return withUpdatedSlideTextBoxes(slide, (boxes) =>
          boxes.map((box) =>
            ids.includes(box.id)
              ? { ...box, ...mergeTextBox({ ...box, ...textBoxProps }) }
              : box
          )
        )
      })
    ),

  updateSlideTextBoxes: (sectionId, slideId, updater) =>
    set((state) =>
      commitTextBoxMutation(state, sectionId, slideId, (slide) =>
        syncLegacyTextFields(slide, reorderTextBoxes(updater(getSlideTextBoxes(slide))))
      )
    ),

  addSlideTextBox: (sectionId, slideId, overrides = {}) =>
    set((state) =>
      {
        const nextState = commitTextBoxMutation(state, sectionId, slideId, (slide) => {
          const boxes = getSlideTextBoxes(slide)
          const highest = boxes.reduce((max, box) => Math.max(max, box.zIndex ?? 0), -1)
          const next = createTextBox({
            ...createDefaultTextBoxForSlide(slide),
            x: DEFAULT_TEXT_BOX.x + boxes.length * 18,
          y: DEFAULT_TEXT_BOX.y + boxes.length * 18,
            zIndex: highest + 1,
            ...overrides,
          }, { autoFit: overrides.autoFit ?? undefined })
          return syncLegacyTextFields(slide, reorderTextBoxes([...boxes, next]))
        })

        const updatedSlide = nextState.presentation?.sections
          ?.find((section) => section.id === sectionId)
          ?.slides?.find((slide) => slide.id === slideId)
        const addedId = getSlideTextBoxes(updatedSlide).at(-1)?.id || null

        return {
          ...nextState,
          lastAddedTextBoxId: addedId,
        }
      }
    ),

  removeSlideTextBoxes: (sectionId, slideId, textBoxIds) =>
    set((state) =>
      commitTextBoxMutation(state, sectionId, slideId, (slide) => {
        const remaining = getSlideTextBoxes(slide).filter((box) => !textBoxIds.includes(box.id))
        return syncLegacyTextFields(slide, reorderTextBoxes(remaining))
      })
    ),

  duplicateSlideTextBoxes: (sectionId, slideId, textBoxIds) =>
    set((state) =>
      commitTextBoxMutation(state, sectionId, slideId, (slide) => {
        const boxes = getSlideTextBoxes(slide)
        const selected = boxes.filter((box) => textBoxIds.includes(box.id))
        const maxZ = boxes.reduce((max, box) => Math.max(max, box.zIndex ?? 0), -1)
        const clones = selected.map((box, index) => createTextBox({
          ...box,
          id: undefined,
          x: box.x + 24,
          y: box.y + 24,
          zIndex: maxZ + index + 1,
        }, { autoFit: box.autoFit }))
        return syncLegacyTextFields(slide, reorderTextBoxes([...boxes, ...clones]))
      })
    ),

  reorderSlideTextBoxes: (sectionId, slideId, textBoxIds, action) =>
    set((state) =>
      commitTextBoxMutation(state, sectionId, slideId, (slide) => {
        const boxes = reorderTextBoxes(getSlideTextBoxes(slide))
        let ordered = [...boxes]
        const selected = ordered.filter((box) => textBoxIds.includes(box.id))
        const rest = ordered.filter((box) => !textBoxIds.includes(box.id))

        if (action === 'front') {
          ordered = [...rest, ...selected]
        } else if (action === 'back') {
          ordered = [...selected, ...rest]
        } else if (action === 'forward') {
          for (let i = ordered.length - 2; i >= 0; i -= 1) {
            if (textBoxIds.includes(ordered[i].id) && !textBoxIds.includes(ordered[i + 1].id)) {
              ;[ordered[i], ordered[i + 1]] = [ordered[i + 1], ordered[i]]
            }
          }
        } else if (action === 'backward') {
          for (let i = 1; i < ordered.length; i += 1) {
            if (textBoxIds.includes(ordered[i].id) && !textBoxIds.includes(ordered[i - 1].id)) {
              ;[ordered[i], ordered[i - 1]] = [ordered[i - 1], ordered[i]]
            }
          }
        }

        return syncLegacyTextFields(slide, reorderTextBoxes(ordered))
      })
    ),

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
