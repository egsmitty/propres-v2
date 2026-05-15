import { useAppStore } from '@/store/appStore'
import { useEditorStore } from '@/store/editorStore'
import {
  createPresentation,
  createMedia,
  deletePresentation,
  getMedia,
  getSongs,
  pickMedia,
  getPresentation,
  touchPresentation,
  updatePresentation,
} from '@/utils/ipc'
import { mediaComparisonKey, normalizePresentation } from '@/utils/backgrounds'
import { PRESENTATION_TEMPLATES, SAMPLE_MEDIA_LIBRARY } from '@/utils/presentationTemplates'
import { uuid } from '@/utils/uuid'
import {
  createMediaSlide,
  createSection,
  createTextSlide,
  promptForSectionSetup,
} from '@/utils/sectionTypes'
import { alertDialog, confirmDialog, promptDialog } from '@/utils/dialog'
import { ensureBuiltInSongsSeeded } from '@/utils/builtInSongSeed'

function selectFirstSlide(presentation) {
  const firstSection = presentation?.sections?.[0]
  const firstSlide = firstSection?.slides?.[0]
  useEditorStore.getState().setSelectedSlide(firstSection?.id ?? null, firstSlide?.id ?? null)
}

function insertSectionAfterSelection(sections = [], selectedSectionId, section) {
  if (!section) return sections
  if (!sections.length) return [section]

  const currentIndex = sections.findIndex((entry) => entry.id === selectedSectionId)
  const insertIndex = currentIndex >= 0 ? currentIndex + 1 : sections.length
  const next = [...sections]
  next.splice(insertIndex, 0, section)
  return next
}

function insertSlideAfterSelection(sections = [], selectedSectionId, selectedSlideId, nextSlide, fallbackSectionType = 'announcement') {
  if (!nextSlide) return { sections, sectionId: selectedSectionId }

  if (!sections.length) {
    const section = createSection(fallbackSectionType, 0, {
      title: 'Slides',
      slides: [nextSlide],
    })
    return { sections: [section], sectionId: section.id }
  }

  const currentSectionIndex = sections.findIndex((section) => section.id === selectedSectionId)
  const targetSectionIndex = currentSectionIndex >= 0 ? currentSectionIndex : 0
  const targetSection = sections[targetSectionIndex]
  const slides = [...targetSection.slides]
  const selectedIndex = slides.findIndex((slide) => slide.id === selectedSlideId)
  const insertIndex = selectedIndex >= 0 ? selectedIndex + 1 : slides.length
  slides.splice(insertIndex, 0, nextSlide)

  return {
    sectionId: targetSection.id,
    sections: sections.map((section, index) =>
      index === targetSectionIndex ? { ...section, slides } : section
    ),
  }
}

export function loadPresentationIntoEditor(presentation) {
  const normalized = normalizePresentation(presentation)
  useEditorStore.getState().setPresentation(normalized)
  selectFirstSlide(normalized)
  useAppStore.getState().setCurrentView('editor')
  return normalized
}

export async function openPresentationInEditor(id) {
  await touchPresentation(id)
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

  await ensureBuiltInSongsSeeded()

  async function ensureMedia(mediaDefinition) {
    const existing = await getMedia()
    const matches = existing?.success ? existing.data : []
    const targetKey = mediaDefinition.canonical_path || mediaComparisonKey(mediaDefinition.file_path)
    const found = matches.find((item) => (
      item.canonical_path && targetKey
        ? item.canonical_path === targetKey
        : item.file_path === mediaDefinition.file_path
    ))
    if (found) return found

    const created = await createMedia(mediaDefinition)
    return created?.success ? created.data : null
  }

  const songsResult = await getSongs()
  const songLibrary = songsResult?.success ? songsResult.data || [] : []

  const payload = await template.buildPresentation({
    ensureMedia,
    songLibrary,
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
  const newSlide = createTextSlide(sectionType)
  const sections = presentation.sections ? [...presentation.sections] : []
  const inserted = insertSlideAfterSelection(
    sections,
    state.selectedSectionId,
    state.selectedSlideId,
    newSlide,
    sectionType
  )

  const preserveCurrentEditing = state.editingSlideId === state.selectedSlideId && Boolean(state.selectedSlideId)
  const preservedTextBoxIds = preserveCurrentEditing ? [...(state.selectedTextBoxIds || [])] : []

  state.setPresentation(
    normalizePresentation({
      ...presentation,
      sections: inserted.sections,
    })
  )
  state.setDirty(true)
  if (preserveCurrentEditing) {
    state.setSelectedSlide(state.selectedSectionId, state.selectedSlideId)
    state.setSelectedTextBoxIds(preservedTextBoxIds)
    state.setEditingSlide(state.selectedSlideId)
  } else {
    state.setSelectedSlide(inserted.sectionId, newSlide.id)
    state.setSuppressAutoEditSlideId(newSlide.id)
  }

  return newSlide
}

export function insertSectionAfterCurrentSelection(section) {
  const state = useEditorStore.getState()
  if (!state.presentation || !section) return null

  const nextSections = insertSectionAfterSelection(
    state.presentation.sections || [],
    state.selectedSectionId,
    section
  )

  state.mutateSections(() => nextSections)
  state.setSelectedSlide(section.id, section.slides[0]?.id ?? null)
  return section
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

  return insertSectionAfterCurrentSelection(section)
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

  const slide = createMediaSlide(media)
  const targetSection = await ensureSectionForInsertion()
  if (!targetSection) return null

  const inserted = insertSlideAfterSelection(
    state.presentation.sections || [],
    state.selectedSectionId || targetSection.id,
    state.selectedSlideId,
    slide,
    targetSection.type
  )

  state.mutateSections(() => inserted.sections)
  state.setSelectedSlide(inserted.sectionId, slide.id)
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

  const inserted = await insertMediaSlideIntoCurrentPresentation(picked.data)
  return inserted ? picked : null
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

  const selectedIds = [...(state.selectedSlideIds || [])]
  if (!selectedIds.includes(state.selectedSlideId)) selectedIds.push(state.selectedSlideId)
  if (!selectedIds.length) return false

  const idsToDelete = new Set(selectedIds)
  const allSlides = presentation.sections.flatMap((section) =>
    section.slides.map((slide) => ({ id: slide.id, sectionId: section.id }))
  )
  const primaryIndex = allSlides.findIndex((slide) => slide.id === state.selectedSlideId)
  const nextSelection =
    allSlides.slice(primaryIndex + 1).find((slide) => !idsToDelete.has(slide.id)) ||
    allSlides.slice(0, Math.max(0, primaryIndex)).reverse().find((slide) => !idsToDelete.has(slide.id)) ||
    null

  const nextSections = presentation.sections.map((section) => ({
    ...section,
    slides: section.slides.filter((slide) => !idsToDelete.has(slide.id)),
  }))

  state.mutateSections(() => nextSections)
  state.setSelectedSlide(nextSelection?.sectionId ?? null, nextSelection?.id ?? null)
  return true
}

export async function renamePresentationById(id, currentTitle) {
  const title = await promptDialog('', currentTitle || 'Untitled Presentation', {
    title: 'Rename Presentation',
    confirmLabel: 'Rename',
    placeholder: 'Presentation title',
  })
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
