import React, { useState, useRef } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { usePresenterStore } from '@/store/presenterStore'
import { sendSlideLive } from '@/utils/presenterFlow'
import SectionHeader from './SectionHeader'
import FilmstripSlide from './FilmstripSlide'
import { createTextSlide } from '@/utils/sectionTypes'
import { uuid } from '@/utils/uuid'

export default function Filmstrip() {
  const presentation = useEditorStore((s) => s.presentation)
  const selectedSlideId = useEditorStore((s) => s.selectedSlideId)
  const setSelectedSlide = useEditorStore((s) => s.setSelectedSlide)
  const setEditingSlide = useEditorStore((s) => s.setEditingSlide)
  const isPresenting = usePresenterStore((s) => s.isPresenting)
  const [collapsed, setCollapsed] = useState({})
  // drag state
  const dragSlide = useRef(null) // { sectionId, slideId }
  const dragSection = useRef(null) // sectionId
  const [dragOverSlide, setDragOverSlide] = useState(null)
  const [dragOverSection, setDragOverSection] = useState(null)

  if (!presentation) {
    return (
      <div
        className="w-56 h-full flex items-center justify-center"
        style={{ background: 'var(--bg-filmstrip)', borderRight: '1px solid var(--border-default)' }}
      >
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>No presentation open</p>
      </div>
    )
  }

  function toggleSection(sectionId) {
    setCollapsed((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }))
  }

  function mutate(fn) {
    useEditorStore.getState().mutateSections(fn)
  }

  function selectFirstAvailableSlide() {
    const nextPresentation = useEditorStore.getState().presentation
    const nextSection = nextPresentation?.sections?.find((section) => section.slides?.length)
    const nextSlide = nextSection?.slides?.[0]
    useEditorStore.getState().setSelectedSlide(nextSection?.id ?? null, nextSlide?.id ?? null)
  }

  function addSlideToSection(section) {
    const newSlide = createTextSlide(section.type)
    mutate((sections) =>
      sections.map((sec) =>
        sec.id === section.id ? { ...sec, slides: [...sec.slides, newSlide] } : sec
      )
    )
  }

  function duplicateSlide(section, slide) {
    const copy = { ...slide, id: uuid() }
    mutate((sections) =>
      sections.map((sec) => {
        if (sec.id !== section.id) return sec
        const idx = sec.slides.findIndex((sl) => sl.id === slide.id)
        const slides = [...sec.slides]
        slides.splice(idx + 1, 0, copy)
        return { ...sec, slides }
      })
    )
  }

  function insertSlideAfter(section, slide) {
    const newSlide = createTextSlide(section.type)
    mutate((sections) =>
      sections.map((sec) => {
        if (sec.id !== section.id) return sec
        const idx = sec.slides.findIndex((sl) => sl.id === slide.id)
        const slides = [...sec.slides]
        slides.splice(idx + 1, 0, newSlide)
        return { ...sec, slides }
      })
    )
    setSelectedSlide(section.id, newSlide.id)
  }

  function deleteSlide(section, slide) {
    mutate((sections) =>
      sections.map((sec) =>
        sec.id !== section.id ? sec : { ...sec, slides: sec.slides.filter((sl) => sl.id !== slide.id) }
      )
    )
    if (selectedSlideId === slide.id) selectFirstAvailableSlide()
  }

  function removeSection(sectionId) {
    mutate((sections) => sections.filter((sec) => sec.id !== sectionId))
    const selectedSectionId = useEditorStore.getState().selectedSectionId
    if (selectedSectionId === sectionId) selectFirstAvailableSlide()
  }

  // ── Slide drag handlers ──
  function onSlideDragStart(sectionId, slideId) {
    dragSlide.current = { sectionId, slideId }
  }

  function onSlideDragOver(e, sectionId, slideId) {
    e.preventDefault()
    setDragOverSlide(slideId)
  }

  function onSlideDrop(targetSectionId, targetSlideId) {
    const src = dragSlide.current
    if (!src || (src.sectionId === targetSectionId && src.slideId === targetSlideId)) {
      dragSlide.current = null; setDragOverSlide(null); return
    }
    mutate((sections) => {
      // Remove from source
      let movedSlide
      const updated = sections.map((sec) => {
        if (sec.id !== src.sectionId) return sec
        movedSlide = sec.slides.find((sl) => sl.id === src.slideId)
        return { ...sec, slides: sec.slides.filter((sl) => sl.id !== src.slideId) }
      })
      // Insert at target
      return updated.map((sec) => {
        if (sec.id !== targetSectionId) return sec
        const idx = sec.slides.findIndex((sl) => sl.id === targetSlideId)
        const slides = [...sec.slides]
        slides.splice(idx, 0, movedSlide)
        return { ...sec, slides }
      })
    })
    dragSlide.current = null
    setDragOverSlide(null)
  }

  function onSlideDropToSectionEnd(targetSectionId) {
    const src = dragSlide.current
    if (!src) {
      dragSlide.current = null
      setDragOverSlide(null)
      return
    }

    mutate((sections) => {
      let movedSlide
      const updated = sections.map((sec) => {
        if (sec.id !== src.sectionId) return sec
        movedSlide = sec.slides.find((sl) => sl.id === src.slideId)
        return { ...sec, slides: sec.slides.filter((sl) => sl.id !== src.slideId) }
      })

      return updated.map((sec) => {
        if (sec.id !== targetSectionId || !movedSlide) return sec
        return { ...sec, slides: [...sec.slides, movedSlide] }
      })
    })

    dragSlide.current = null
    setDragOverSlide(null)
  }

  // ── Section drag handlers ──
  function onSectionDragStart(sectionId) { dragSection.current = sectionId }
  function onSectionDragOver(e, sectionId) { e.preventDefault(); setDragOverSection(sectionId) }
  function onSectionDrop(targetSectionId) {
    const srcId = dragSection.current
    if (!srcId || srcId === targetSectionId) { dragSection.current = null; setDragOverSection(null); return }
    mutate((sections) => {
      const srcIdx = sections.findIndex((s) => s.id === srcId)
      const tgtIdx = sections.findIndex((s) => s.id === targetSectionId)
      const arr = [...sections]
      const [moved] = arr.splice(srcIdx, 1)
      arr.splice(tgtIdx, 0, moved)
      return arr
    })
    dragSection.current = null
    setDragOverSection(null)
  }

  let slideIndex = 0

  async function handleSelectSlide(sectionId, slide) {
    setSelectedSlide(sectionId, slide.id)

    if (isPresenting) {
      await sendSlideLive(sectionId, slide)
    }
  }

  return (
    <div
      data-tour="filmstrip"
      className="w-56 h-full overflow-y-auto shrink-0 flex flex-col"
      style={{ background: 'var(--bg-filmstrip)', borderRight: '1px solid var(--border-default)' }}
    >
      <div className="py-1">
        {presentation.sections.map((section) => {
          const isCollapsed = collapsed[section.id]
          return (
            <div
              key={section.id}
              draggable
              onDragStart={() => onSectionDragStart(section.id)}
              onDragOver={(e) => onSectionDragOver(e, section.id)}
              onDrop={() => onSectionDrop(section.id)}
              onDragEnd={() => { dragSection.current = null; setDragOverSection(null) }}
              style={{
                opacity: dragOverSection === section.id && dragSection.current !== section.id ? 0.6 : 1,
                outline: dragOverSection === section.id && dragSection.current !== section.id
                  ? '2px solid var(--accent)'
                  : 'none',
              }}
            >
              <SectionHeader
                section={section}
                collapsed={isCollapsed}
                onToggle={() => toggleSection(section.id)}
                onAddSlide={() => addSlideToSection(section)}
                onRemove={() => removeSection(section.id)}
              />

              {!isCollapsed && section.slides.map((slide) => {
                slideIndex++
                const idx = slideIndex
                return (
                  <div
                    key={slide.id}
                    draggable
                    onDragStart={(e) => { e.stopPropagation(); onSlideDragStart(section.id, slide.id) }}
                    onDragOver={(e) => { e.stopPropagation(); onSlideDragOver(e, section.id, slide.id) }}
                    onDrop={(e) => { e.stopPropagation(); onSlideDrop(section.id, slide.id) }}
                    onDragEnd={() => { dragSlide.current = null; setDragOverSlide(null) }}
                    style={{
                      opacity: dragOverSlide === slide.id && dragSlide.current?.slideId !== slide.id ? 0.5 : 1,
                      borderTop: dragOverSlide === slide.id && dragSlide.current?.slideId !== slide.id
                        ? '2px solid var(--accent)'
                        : '2px solid transparent',
                    }}
                  >
                    <FilmstripSlide
                      slide={slide}
                      index={idx}
                      selected={selectedSlideId === slide.id}
                      onSelect={() => handleSelectSlide(section.id, slide)}
                      onNewSlide={() => insertSlideAfter(section, slide)}
                      onDoubleClick={async () => {
                        await handleSelectSlide(section.id, slide)
                        setEditingSlide(slide.id)
                      }}
                      onDuplicate={() => duplicateSlide(section, slide)}
                      onDelete={() => deleteSlide(section, slide)}
                    />
                  </div>
                )
              })}

              {!isCollapsed && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setDragOverSlide(`end-${section.id}`)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onSlideDropToSectionEnd(section.id)
                  }}
                  onDragEnd={() => setDragOverSlide(null)}
                  className="mx-2 mb-1 rounded"
                  style={{
                    height: 12,
                    background: dragOverSlide === `end-${section.id}` ? 'var(--accent-dim)' : 'transparent',
                    border: dragOverSlide === `end-${section.id}`
                      ? '1px dashed var(--accent)'
                      : '1px dashed transparent',
                  }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
