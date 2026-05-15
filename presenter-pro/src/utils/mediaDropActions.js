import { useEditorStore } from '@/store/editorStore'
import { showDialog } from '@/utils/dialog'
import { getSectionTypeLabel } from '@/utils/sectionTypes'

export function isMediaLibraryDrag(event) {
  return Array.from(event.dataTransfer?.types || []).includes('application/presenterpro-media-id')
}

function getTargetSections(presentation, targets = []) {
  return targets
    .map((target) => presentation?.sections?.find((section) => section.id === target.sectionId) || null)
    .filter(Boolean)
}

function buildGroupActionLabel(sections = []) {
  const types = Array.from(new Set(sections.map((section) => section.type)))
  if (types.length !== 1) return 'Set as Section Background'
  return `Set as ${getSectionTypeLabel(types[0])} Background`
}

export async function applyDroppedMediaToTargets(mediaId, targets = []) {
  if (!mediaId || !targets.length) return false

  const state = useEditorStore.getState()
  const presentation = state.presentation
  if (!presentation) return false

  const sections = getTargetSections(presentation, targets)
  if (!sections.length) return false

  const uniqueSectionIds = Array.from(new Set(sections.map((section) => section.id)))
  const multipleTargets = targets.length > 1
  const multipleSectionTypes = new Set(sections.map((section) => section.type)).size > 1
  const groupActionLabel = buildGroupActionLabel(sections)

  const result = await showDialog({
    title: 'Apply Media Background',
    description: multipleTargets
      ? multipleSectionTypes
        ? 'Apply this media to each selected slide, or apply it to each selected slide\'s own parent section.'
        : `Apply this media to each selected slide, or apply it to each selected slide's parent ${getSectionTypeLabel(sections[0].type).toLowerCase()}.`
      : `Apply this media to the selected slide, or to the full ${getSectionTypeLabel(sections[0].type).toLowerCase()}.`,
    actions: [
      { label: 'Cancel', value: null, cancel: true },
      { label: 'Set as Slide Background', value: 'slide', primary: true },
      { label: groupActionLabel, value: 'group' },
    ],
  })

  if (!result?.action) return false

  if (result.action === 'slide') {
    const targetSlideIds = new Set(targets.map((target) => target.slideId))
    state.mutateSections((currentSections) =>
      currentSections.map((section) => ({
        ...section,
        slides: section.slides.map((slide) =>
          targetSlideIds.has(slide.id)
            ? { ...slide, backgroundId: mediaId }
            : slide
        ),
      }))
    )
    return true
  }

  if (result.action === 'group') {
    state.mutateSections((currentSections) =>
      currentSections.map((section) =>
        uniqueSectionIds.includes(section.id)
          ? { ...section, backgroundId: mediaId }
          : section
      )
    )
    return true
  }

  return false
}
