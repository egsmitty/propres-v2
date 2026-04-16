import { useEditorStore } from '@/store/editorStore'
import { usePresenterStore } from '@/store/presenterStore'
import { withEffectiveBackground } from '@/utils/backgrounds'
import {
  openOutputWindow,
  openPresenterView,
  refreshLiveSlide,
  sendSlide,
  stopPresenting as stopPresentingIpc,
  updatePresentationSlides,
} from '@/utils/ipc'
import { alertDialog } from '@/utils/dialog'

export function flattenPresentationSlides(presentation) {
  if (!presentation) return []

  return presentation.sections.flatMap((section) =>
    section.slides.map((slide) => withEffectiveBackground(presentation, section.id, slide))
  )
}

const READY_TIMEOUT_MS = 5000

function waitWithTimeout(promise, label) {
  if (!promise) return Promise.resolve({ success: true })
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} window did not become ready`)), READY_TIMEOUT_MS)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

export async function startPresentationSession(presentation) {
  const slides = flattenPresentationSlides(presentation)
  if (!slides.length) return false

  await openPresenterView()
  await openOutputWindow()
  try {
    await waitWithTimeout(window.electronAPI?.waitForPresenterReady?.(), 'Presenter')
    await waitWithTimeout(window.electronAPI?.waitForOutputReady?.(), 'Output')
  } catch (err) {
    await alertDialog(err?.message || 'Could not open presenter windows. Try again.', { title: 'Presentation Failed' })
    return false
  }

  await window.electronAPI?.startPresentation(slides)
  await sendSlide(slides[0], null)
  usePresenterStore.getState().startPresenting(slides[0].sectionId, slides[0].id)

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
  await sendSlide(liveSlide, null)
  usePresenterStore.getState().setLiveSlide(liveSlide.sectionId, liveSlide.id)

  return true
}

export async function syncPresentationSession(presentation) {
  const slides = flattenPresentationSlides(presentation)
  await updatePresentationSlides(slides)

  const { isPresenting, liveSectionId, liveSlideId } = usePresenterStore.getState()
  if (!isPresenting || !liveSectionId || !liveSlideId) return true

  const liveSlide = slides.find(
    (slide) => slide.sectionId === liveSectionId && slide.id === liveSlideId
  )
  if (!liveSlide) return true

  await refreshLiveSlide(liveSlide, null)
  return true
}
