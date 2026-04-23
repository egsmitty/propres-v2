import { useEditorStore } from '@/store/editorStore'
import { usePresenterStore } from '@/store/presenterStore'
import { withEffectiveBackground } from '@/utils/backgrounds'
import {
  openOutputWindow,
  openStageDisplayWindow,
  refreshLiveSlide,
  sendSlide,
  setPresentationSessionSlides,
  stopPresenting as stopPresentingIpc,
} from '@/utils/ipc'
import { alertDialog } from '@/utils/dialog'

function withPresentationMeta(presentation, slide) {
  if (!slide) return slide

  return {
    ...slide,
    aspectRatio: presentation?.aspectRatio || '16:9',
    customAspectWidth: presentation?.customAspectWidth ?? null,
    customAspectHeight: presentation?.customAspectHeight ?? null,
  }
}

export function flattenPresentationSlides(presentation) {
  if (!presentation) return []

  return presentation.sections.flatMap((section) =>
    section.slides.map((slide) =>
      withPresentationMeta(
        presentation,
        withEffectiveBackground(presentation, section.id, slide)
      )
    )
  )
}

const READY_TIMEOUT_MS = 5000

function focusPresentationKeyboardTarget() {
  if (typeof window === 'undefined') return

  const activeElement = document.activeElement
  if (activeElement && activeElement !== document.body && typeof activeElement.blur === 'function') {
    activeElement.blur()
  }

  if (typeof window.focus === 'function') {
    window.focus()
  }
}

function waitWithTimeout(promise, label) {
  if (!promise) return Promise.resolve({ success: true })
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} window did not become ready`)), READY_TIMEOUT_MS)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// DISABLED (session 6): old session uses separate presenterWindow — kept for rollback
// export async function startPresentationSession(presentation) { ... }

/**
 * Sidebar-mode start: opens only the output window (no separate presenter window).
 * Sends the currently selected slide first, or falls back to the first slide.
 */
export async function startSidebarPresentationSession(presentation) {
  const slides = flattenPresentationSlides(presentation)
  if (!slides.length) return false

  usePresenterStore.getState().setPresenterPanelOpen(true)

  await openOutputWindow()
  try {
    await waitWithTimeout(window.electronAPI?.waitForOutputReady?.(), 'Output')
  } catch (err) {
    await alertDialog(err?.message || 'Could not open output window. Try again.', { title: 'Presentation Failed' })
    return false
  }

  const stageResult = await openStageDisplayWindow({ onlyIfAssigned: true })
  if (stageResult?.success && stageResult?.data?.opened) {
    try {
      await waitWithTimeout(window.electronAPI?.waitForStageDisplayReady?.(), 'Stage Display')
    } catch (err) {
      await alertDialog(err?.message || 'Could not open stage display window. Try again.', { title: 'Stage Display Failed' })
    }
  }

  await setPresentationSessionSlides(slides)

  const { selectedSectionId, selectedSlideId } = useEditorStore.getState()
  const startSlide =
    slides.find((sl) => sl.sectionId === selectedSectionId && sl.id === selectedSlideId) ||
    slides[0]

  await sendSlide(startSlide, null)

  const store = usePresenterStore.getState()
  store.startPresenting(startSlide.sectionId, startSlide.id)
  store.setAllSlides(slides)
  focusPresentationKeyboardTarget()

  return true
}

export async function stopPresentationSession() {
  await stopPresentingIpc()
  usePresenterStore.getState().stopPresenting()
}

export async function sendSlideLive(sectionId, slide) {
  if (!sectionId || !slide) return false

  const presentation = useEditorStore.getState().presentation
  const liveSlide = withEffectiveBackground(
    presentation,
    sectionId,
    slide.sectionId ? slide : { ...slide, sectionId }
  )
  const slideWithMeta = withPresentationMeta(presentation, liveSlide)
  await sendSlide(slideWithMeta, null)
  usePresenterStore.getState().setLiveSlide(slideWithMeta.sectionId, slideWithMeta.id)

  return true
}

export async function syncPresentationSession(presentation) {
  const slides = flattenPresentationSlides(presentation)

  // Keep sidebar panel's allSlides in sync when the presentation is edited mid-session
  usePresenterStore.getState().setAllSlides(slides)

  // DISABLED (session 6): presenter:updateSlides IPC handler removed
  // await updatePresentationSlides(slides)
  await setPresentationSessionSlides(slides)

  const { isPresenting, liveSectionId, liveSlideId } = usePresenterStore.getState()
  if (!isPresenting || !liveSectionId || !liveSlideId) return true

  const liveSlide = slides.find(
    (slide) => slide.sectionId === liveSectionId && slide.id === liveSlideId
  )
  if (!liveSlide) return true

  await refreshLiveSlide(liveSlide, null)
  return true
}
