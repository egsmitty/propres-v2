import { useEditorStore } from '@/store/editorStore'
import { usePresenterStore } from '@/store/presenterStore'
import { withEffectiveBackground } from '@/utils/backgrounds'
import {
  openOutputWindow,
  openPresenterView,
  sendSlide,
  stopPresenting as stopPresentingIpc,
} from '@/utils/ipc'

export function flattenPresentationSlides(presentation) {
  if (!presentation) return []

  return presentation.sections.flatMap((section) =>
    section.slides.map((slide) => withEffectiveBackground(presentation, section.id, slide))
  )
}

export async function startPresentationSession(presentation) {
  const slides = flattenPresentationSlides(presentation)
  if (!slides.length) return false

  await openPresenterView()
  await openOutputWindow()
  await window.electronAPI?.waitForPresenterReady?.()
  await window.electronAPI?.waitForOutputReady?.()

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
