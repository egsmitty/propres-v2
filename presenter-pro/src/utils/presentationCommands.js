import { useAppStore } from '@/store/appStore'
import { useEditorStore } from '@/store/editorStore'
import {
  createPresentation,
  createMedia,
  deletePresentation,
  getMedia,
  getPresentation,
  updatePresentation,
} from '@/utils/ipc'
import { normalizePresentation } from '@/utils/backgrounds'
import { PRESENTATION_TEMPLATES, SAMPLE_MEDIA_LIBRARY } from '@/utils/presentationTemplates'
import {
  createMediaSlide,
  createSection,
  createTextSlide,
  promptForSectionSetup,
} from '@/utils/sectionTypes'

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
  })

  if (!result?.success || !result.data) return null
  const loaded = await openPresentationInEditor(result.data.id)
  if (loaded) {
    useEditorStore.getState().setPresentation(loaded, {
      isDirty: false,
      requiresInitialSave: true,
    })
  }
  return loaded
}

export async function createPresentationFromTemplate(templateId) {
  const template = PRESENTATION_TEMPLATES.find((item) => item.id === templateId)
  if (!template) return null

  async function ensureMedia(mediaDefinition) {
    const existing = await getMedia()
    const matches = existing?.success ? existing.data : []
    const found = matches.find((item) => item.file_path === mediaDefinition.file_path)
    if (found) return found

    const created = await createMedia(mediaDefinition)
    return created?.success ? created.data : null
  }

  const payload = await template.buildPresentation({
    ensureMedia: template.featured ? ensureMedia : undefined,
    sampleMedia: SAMPLE_MEDIA_LIBRARY,
  })
  const result = await createPresentation(payload)
  if (!result?.success || !result.data) return null

  const loaded = await openPresentationInEditor(result.data.id)
  if (loaded) {
    useEditorStore.getState().setPresentation(loaded, {
      isDirty: false,
      requiresInitialSave: true,
    })
  }
  return loaded
}

export async function saveCurrentPresentation() {
  const state = useEditorStore.getState()
  const presentation = state.presentation
  if (!presentation) return null

  const result = await updatePresentation(presentation.id, presentation)
  if (result?.success) {
    state.setDirty(false)
    state.setRequiresInitialSave(false)
    if (result.data) {
      loadPresentationIntoEditor(result.data)
      useEditorStore.getState().setDirty(false)
      useEditorStore.getState().setRequiresInitialSave(false)
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
  })
  if (!result?.success || !result.data) return result

  const loaded = await openPresentationInEditor(result.data.id)
  useEditorStore.getState().setDirty(false)
  return { success: true, data: loaded }
}

export function insertNewSlideIntoCurrentPresentation() {
  const state = useEditorStore.getState()
  const presentation = state.presentation
  if (!presentation) return null

  const currentSection =
    presentation.sections.find((section) => section.id === state.selectedSectionId) ||
    presentation.sections[0] ||
    null
  let sectionType = currentSection?.type || 'announcement'
  let newSlide = createTextSlide(sectionType)
  let targetSectionId = state.selectedSectionId
  let sections = presentation.sections ? [...presentation.sections] : []

  if (!sections.length) {
    const setup = promptForSectionSetup()
    if (!setup) return null
    sectionType = setup.type
    newSlide = createTextSlide(sectionType)
    const section = createSection(sectionType, 0, {
      title: setup.title,
      slides: [newSlide],
    })
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

export function insertNewSectionIntoCurrentPresentation(sectionType = 'announcement') {
  const state = useEditorStore.getState()
  const presentation = state.presentation
  if (!presentation) return null

  const setup = promptForSectionSetup(sectionType)
  if (!setup) return null

  const section = createSection(setup.type, presentation.sections.length, {
    title: setup.title,
    slides: [createTextSlide(setup.type)],
  })

  state.addSection(section)
  state.setSelectedSlide(section.id, section.slides[0]?.id ?? null)
  return section
}

export function ensureSectionForInsertion(preferredType = null) {
  const state = useEditorStore.getState()
  const presentation = state.presentation
  if (!presentation) return null

  const existing =
    presentation.sections.find((section) => section.id === state.selectedSectionId) ||
    presentation.sections[0] ||
    null
  if (existing) return existing

  const setup = promptForSectionSetup(preferredType)
  if (!setup) return null

  const section = createSection(setup.type, presentation.sections.length, {
    title: setup.title,
    slides: [],
  })

  state.addSection(section)
  return section
}

export function insertMediaSlideIntoCurrentPresentation(media) {
  const state = useEditorStore.getState()
  const presentation = state.presentation
  if (!presentation || !media) return null

  const targetSection = ensureSectionForInsertion()
  if (!targetSection) return null

  const slide = createMediaSlide(media)
  state.insertSlideIntoSection(targetSection.id, slide)
  state.setSelectedSlide(targetSection.id, slide.id)
  return slide
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
