import { useAppStore } from '@/store/appStore'
import { useEditorStore } from '@/store/editorStore'
import {
  createPresentation,
  deletePresentation,
  getPresentation,
  updatePresentation,
} from '@/utils/ipc'
import { normalizePresentation, SECTION_COLORS } from '@/utils/backgrounds'
import { uuid } from '@/utils/uuid'

function selectFirstSlide(presentation) {
  const firstSection = presentation?.sections?.[0]
  const firstSlide = firstSection?.slides?.[0]
  useEditorStore.getState().setSelectedSlide(firstSection?.id ?? null, firstSlide?.id ?? null)
}

export function loadPresentationIntoEditor(presentation) {
  const normalized = normalizePresentation(presentation)
  useEditorStore.getState().setPresentation(normalized)
  selectFirstSlide(normalized)
  useAppStore.getState().setCurrentView('editor')
  return normalized
}

export async function openPresentationInEditor(id) {
  const loaded = await getPresentation(id)
  if (!loaded?.success || !loaded.data) return null
  return loadPresentationIntoEditor(loaded.data)
}

export async function createNewPresentation(title = 'Untitled Presentation') {
  const result = await createPresentation({
    title,
    sections: [],
    defaultBackgroundId: null,
  })

  if (!result?.success || !result.data) return null
  return openPresentationInEditor(result.data.id)
}

export async function saveCurrentPresentation() {
  const state = useEditorStore.getState()
  const presentation = state.presentation
  if (!presentation) return null

  const result = await updatePresentation(presentation.id, presentation)
  if (result?.success) {
    state.setDirty(false)
    if (result.data) {
      loadPresentationIntoEditor(result.data)
      useEditorStore.getState().setDirty(false)
    }
  }
  return result
}

export async function saveCurrentPresentationAs() {
  const state = useEditorStore.getState()
  const presentation = state.presentation
  if (!presentation) return null

  const suggestedTitle = presentation.title?.trim()
    ? `${presentation.title} Copy`
    : 'Untitled Presentation Copy'
  const title = window.prompt('Save presentation as:', suggestedTitle)?.trim()
  if (!title) return null

  const result = await createPresentation({
    title,
    sections: presentation.sections || [],
    defaultBackgroundId: presentation.defaultBackgroundId ?? presentation.default_background_id ?? null,
  })
  if (!result?.success || !result.data) return result

  const loaded = await openPresentationInEditor(result.data.id)
  useEditorStore.getState().setDirty(false)
  return { success: true, data: loaded }
}

function makeBlankSlide() {
  return {
    id: uuid(),
    type: 'blank',
    label: 'Slide',
    body: '',
    notes: '',
    backgroundId: null,
    textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false },
  }
}

function makeDefaultSection(index = 0) {
  return {
    id: uuid(),
    title: `Section ${index + 1}`,
    type: 'custom',
    color: SECTION_COLORS[index % SECTION_COLORS.length],
    collapsed: false,
    slides: [],
    backgroundId: null,
  }
}

export function insertNewSlideIntoCurrentPresentation() {
  const state = useEditorStore.getState()
  const presentation = state.presentation
  if (!presentation) return null

  const newSlide = makeBlankSlide()
  let targetSectionId = state.selectedSectionId
  let sections = presentation.sections ? [...presentation.sections] : []

  if (!sections.length) {
    const section = makeDefaultSection(0)
    section.slides = [newSlide]
    sections = [section]
    targetSectionId = section.id
  } else {
    const targetSection =
      sections.find((section) => section.id === targetSectionId) || sections[0]
    targetSectionId = targetSection.id
    sections = sections.map((section) =>
      section.id === targetSectionId
        ? { ...section, slides: [...section.slides, newSlide] }
        : section
    )
  }

  state.setPresentation(
    normalizePresentation({
      ...presentation,
      sections,
    })
  )
  state.setDirty(true)
  state.setSelectedSlide(targetSectionId, newSlide.id)

  return newSlide
}

export async function renamePresentationById(id, currentTitle) {
  const title = window.prompt('Rename presentation:', currentTitle || 'Untitled Presentation')?.trim()
  if (!title) return null

  const loaded = await getPresentation(id)
  if (!loaded?.success || !loaded.data) return loaded

  return updatePresentation(id, {
    ...loaded.data,
    title,
  })
}

export async function deletePresentationById(id, title) {
  if (!window.confirm(`Delete "${title}"?`)) return null
  return deletePresentation(id)
}
