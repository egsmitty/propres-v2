import { useAppStore } from '@/store/appStore'
import { useEditorStore } from '@/store/editorStore'
import {
  createPresentation,
  createMedia,
  deletePresentation,
  getMedia,
  pickMedia,
  getPresentation,
  updatePresentation,
} from '@/utils/ipc'
import { normalizePresentation } from '@/utils/backgrounds'
import { PRESENTATION_TEMPLATES, SAMPLE_MEDIA_LIBRARY } from '@/utils/presentationTemplates'
import { uuid } from '@/utils/uuid'
import {
  createMediaSlide,
  createSection,
  createTextSlide,
  promptForSectionSetup,
} from '@/utils/sectionTypes'
import { alertDialog, confirmDialog, promptDialog } from '@/utils/dialog'

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

function markPresentationFreshOpen() {
  const state = useEditorStore.getState()
  state.setDirty(false)
  state.setRequiresInitialSave(true)
}

export async function createNewPresentation(title = 'Untitled Presentation') {
  const initialSection = createSection('announcement', 0, {
    title: 'Slides',
    slides: [createTextSlide('announcement')],
  })

  const result = await createPresentation({
    title,
    sections: [initialSection],
  })

  if (!result?.success || !result.data) return null
  const loaded = await openPresentationInEditor(result.data.id)
  if (loaded) markPresentationFreshOpen()
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
  if (loaded) markPresentationFreshOpen()
  return loaded
}

export async function saveCurrentPresentation() {
  const state = useEditorStore.getState()
  const presentation = state.presentation
  if (!presentation) return null

  const result = await updatePresentation(presentation.id, presentation)
  if (result?.success && result.data) {
    loadPresentationIntoEditor(result.data)
  } else if (result?.success) {
    state.setDirty(false)
    state.setRequiresInitialSave(false)
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
  const title = await promptDialog('Save presentation as:', suggestedTitle, { title: 'Save As', confirmLabel: 'Save' })
  if (!title) return null

  const result = await createPresentation({
    title,
    sections: presentation.sections || [],
    aspectRatio: presentation.aspectRatio || '16:9',
    customAspectWidth: presentation.customAspectWidth ?? null,
    customAspectHeight: presentation.customAspectHeight ?? null,
  })
  if (!result?.success || !result.data) return result

  const loaded = await openPresentationInEditor(result.data.id)
  if (loaded) useEditorStore.getState().setDirty(false)
  return { success: true, data: loaded }
}

export async function insertNewSlideIntoCurrentPresentation() {
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
    sectionType = 'announcement'
    newSlide = createTextSlide(sectionType)
    const section = createSection(sectionType, 0, {
      title: 'Slides',
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

export async function insertNewSectionIntoCurrentPresentation(sectionType = 'announcement') {
  const state = useEditorStore.getState()
  const presentation = state.presentation
  if (!presentation) return null

  const setup = await promptForSectionSetup(sectionType)
  if (!setup) return null

  const section = createSection(setup.type, presentation.sections.length, {
    title: setup.title,
    slides: [createTextSlide(setup.type)],
  })

  state.addSection(section)
  state.setSelectedSlide(section.id, section.slides[0]?.id ?? null)
  return section
}

export async function ensureSectionForInsertion(preferredType = null) {
  const state = useEditorStore.getState()
  const presentation = state.presentation
  if (!presentation) return null

  const existing =
    presentation.sections.find((section) => section.id === state.selectedSectionId) ||
    presentation.sections[0] ||
    null
  if (existing) return existing

  const setup = await promptForSectionSetup(preferredType)
  if (!setup) return null

  const section = createSection(setup.type, presentation.sections.length, {
    title: setup.title,
    slides: [],
  })

  state.addSection(section)
  return section
}

export async function insertMediaSlideIntoCurrentPresentation(media) {
  const state = useEditorStore.getState()
  const presentation = state.presentation
  if (!presentation || !media) return null

  const targetSection = await ensureSectionForInsertion()
  if (!targetSection) return null

  const slide = createMediaSlide(media)
  state.insertSlideIntoSection(targetSection.id, slide)
  state.setSelectedSlide(targetSection.id, slide.id)
  return slide
}

function cloneSlideForClipboard(slide) {
  return JSON.parse(JSON.stringify(slide))
}

export async function importMediaToSelectedSlide(kind) {
  const state = useEditorStore.getState()
  const presentation = state.presentation
  if (!presentation) return null

  const picked = await pickMedia(kind)
  if (!picked?.success || !picked.data) return picked

  let sectionId = state.selectedSectionId
  let slideId = state.selectedSlideId

  if (!sectionId || !slideId) {
    const section = await ensureSectionForInsertion()
    if (!section) return null
    const slide = createTextSlide(section.type)
    state.insertSlideIntoSection(section.id, slide)
    state.setSelectedSlide(section.id, slide.id)
    sectionId = section.id
    slideId = slide.id
  }

  state.setSlideBackground(sectionId, slideId, picked.data.id)
  return picked
}

export function copySelectedSlideToClipboard() {
  const state = useEditorStore.getState()
  const slide = state.presentation?.sections
    ?.find((section) => section.id === state.selectedSectionId)
    ?.slides?.find((item) => item.id === state.selectedSlideId)

  if (!slide) return false
  useAppStore.getState().setSlideClipboard(cloneSlideForClipboard(slide))
  return true
}

export function pasteSlideAfterSelected() {
  const state = useEditorStore.getState()
  const clipboard = useAppStore.getState().slideClipboard
  if (!state.presentation || !clipboard) return false

  const targetSectionId = state.selectedSectionId || state.presentation.sections[0]?.id
  if (!targetSectionId) return false

  const nextSlide = {
    ...cloneSlideForClipboard(clipboard),
    id: uuid(),
  }

  state.mutateSections((sections) =>
    sections.map((section) => {
      if (section.id !== targetSectionId) return section
      const slides = [...section.slides]
      const selectedIndex = slides.findIndex((slide) => slide.id === state.selectedSlideId)
      const insertIndex = selectedIndex >= 0 ? selectedIndex + 1 : slides.length
      slides.splice(insertIndex, 0, nextSlide)
      return { ...section, slides }
    })
  )

  state.setSelectedSlide(targetSectionId, nextSlide.id)
  return true
}

export function clearSelectedSlide() {
  const state = useEditorStore.getState()
  if (!state.presentation || !state.selectedSectionId || !state.selectedSlideId) return false

  state.mutateSections((sections) =>
    sections.map((section) => {
      if (section.id !== state.selectedSectionId) return section
      return {
        ...section,
        slides: section.slides.map((slide) =>
          slide.id === state.selectedSlideId
            ? {
                ...slide,
                type: 'text',
                body: '',
                mediaId: null,
                backgroundId: null,
                placeholderText: slide.placeholderText ?? DEFAULT_PLACEHOLDER_TEXT,
              }
            : slide
        ),
      }
    })
  )

  return true
}

export async function deleteSelectedSlideFromCurrentPresentation() {
  const state = useEditorStore.getState()
  const presentation = state.presentation
  if (!presentation || !state.selectedSectionId || !state.selectedSlideId) return false

  const nextSections = presentation.sections.map((section) => ({
    ...section,
    slides: [...section.slides],
  }))

  const sectionIndex = nextSections.findIndex((section) => section.id === state.selectedSectionId)
  if (sectionIndex === -1) return false

  const slideIndex = nextSections[sectionIndex].slides.findIndex((slide) => slide.id === state.selectedSlideId)
  if (slideIndex === -1) return false

  nextSections[sectionIndex].slides.splice(slideIndex, 1)
  state.mutateSections(() => nextSections)

  const sameSectionNext = nextSections[sectionIndex].slides[slideIndex] || nextSections[sectionIndex].slides[slideIndex - 1]
  if (sameSectionNext) {
    state.setSelectedSlide(nextSections[sectionIndex].id, sameSectionNext.id)
    return true
  }

  const nextSection = nextSections.find((section) => section.slides.length > 0)
  const nextSlide = nextSection?.slides?.[0] || null
  state.setSelectedSlide(nextSection?.id ?? null, nextSlide?.id ?? null)
  return true
}

export async function renamePresentationById(id, currentTitle) {
  const title = await promptDialog('Rename presentation:', currentTitle || 'Untitled Presentation', { title: 'Rename', confirmLabel: 'Rename' })
  if (!title) return null

  const loaded = await getPresentation(id)
  if (!loaded?.success || !loaded.data) return loaded

  return updatePresentation(id, {
    ...loaded.data,
    title,
  })
}

export async function deletePresentationById(id, title) {
  const ok = await confirmDialog(`Delete "${title}"?`, { title: 'Delete Presentation', confirmLabel: 'Delete', danger: true })
  if (!ok) return null
  return deletePresentation(id)
}
