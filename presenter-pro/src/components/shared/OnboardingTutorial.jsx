import React, { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import {
  createPresentationFromTemplate,
} from '@/utils/presentationCommands'

const STEPS = [
  {
    id: 'sidebar',
    selector: '[data-tour="home-sidebar"]',
    title: 'Start, Reopen, Or Search',
    body:
      'Use Home for the quickest restart, Recent for a deeper history, and Open when you need to search your library by title or date.',
  },
  {
    id: 'templates',
    selector: '[data-tour="home-templates"]',
    title: 'Templates And Example Services',
    body:
      'Home keeps your templates up top. Use More templates to open the full New screen, where Blank Presentation starts fresh, and Sunday Morning Example shows a complete service with announcements, worship, sermon content, media, and backgrounds already in place.',
  },
  {
    id: 'toolbar',
    selector: '[data-tour="editor-toolbar"]',
    title: 'Build The Flow',
    body:
      'This row handles your fastest editing actions: add or duplicate slides, open the Song and Media libraries, add Announcement or Sermon sections, and jump into Present mode.',
  },
  {
    id: 'filmstrip',
    selector: '[data-tour="filmstrip"]',
    title: 'Sections Stay Organized',
    body:
      'Your service stays grouped here by section. Songs, announcements, and sermons each keep their own slides, names, and running section background until you change sections.',
  },
  {
    id: 'canvas',
    selector: '[data-tour="canvas"]',
    title: 'Edit Text And Media',
    body:
      'Double-click the active slide to edit text, then use the formatting bar for size, alignment, bold, and color. Media slides can also take over the output here without text on top.',
  },
  {
    id: 'present',
    selector: '[data-tour="present-button"]',
    title: 'Go Live With Control',
    body:
      'Use Present or press F5 to open Presenter View and the clean output window. From there you can advance slides, trigger black or logo, and run the live countdown overlay.',
  },
]

export default function OnboardingTutorial({ onComplete }) {
  const currentView = useAppStore((s) => s.currentView)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const tutorialStepIndex = useAppStore((s) => s.tutorialStepIndex)
  const setTutorialStepIndex = useAppStore((s) => s.setTutorialStepIndex)
  const [stepIndex, setStepIndex] = useState(tutorialStepIndex)
  const [targetRect, setTargetRect] = useState(null)
  const [isWorking, setIsWorking] = useState(false)

  const step = STEPS[stepIndex]

  useEffect(() => {
    setStepIndex(tutorialStepIndex)
  }, [tutorialStepIndex])

  useEffect(() => {
    function measureTarget() {
      if (!step?.selector) {
        setTargetRect(null)
        return
      }

      const element = document.querySelector(step.selector)
      if (!element) {
        setTargetRect(null)
        return
      }

      const rect = element.getBoundingClientRect()
      setTargetRect({
        top: Math.max(12, rect.top - 8),
        left: Math.max(12, rect.left - 8),
        width: rect.width + 16,
        height: rect.height + 16,
      })
    }

    const rafId = window.requestAnimationFrame(measureTarget)
    window.addEventListener('resize', measureTarget)
    window.addEventListener('scroll', measureTarget, true)
    return () => {
      window.cancelAnimationFrame(rafId)
      window.removeEventListener('resize', measureTarget)
      window.removeEventListener('scroll', measureTarget, true)
    }
  }, [step, currentView])

  const tooltipStyle = useMemo(() => {
    const width = 340
    const maxHeight = Math.min(320, window.innerHeight - 40)

    if (!targetRect) {
      return {
        width,
        maxHeight,
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      }
    }

    const margin = 20
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let left = targetRect.left
    if (left + width > viewportWidth - margin) {
      left = viewportWidth - width - margin
    }

    let top = targetRect.top + targetRect.height + 16
    if (top + maxHeight > viewportHeight - margin) {
      top = Math.max(margin, viewportHeight - maxHeight - margin)
    }

    return { left, top, width, maxHeight }
  }, [targetRect])

  const canAdvance = step?.id !== 'templates' || currentView === 'editor'

  async function handleTemplateAction() {
    setIsWorking(true)
    try {
      await createPresentationFromTemplate('featured-sunday-example')
      setTutorialStepIndex(2)
      setStepIndex(2)
    } finally {
      setIsWorking(false)
    }
  }

  function handleBack() {
    setStepIndex((index) => {
      const nextIndex = Math.max(0, index - 1)
      if (nextIndex === 0 && currentView === 'editor') {
        setCurrentView('home')
      }
      setTutorialStepIndex(nextIndex)
      return nextIndex
    })
  }

  function handleNext() {
    if (stepIndex >= STEPS.length - 1) {
      onComplete()
      return
    }
    setStepIndex((index) => {
      const nextIndex = index + 1
      setTutorialStepIndex(nextIndex)
      return nextIndex
    })
  }

  return (
    <div
      className="fixed inset-0 z-[80]"
      style={{ pointerEvents: 'none' }}
    >
      {targetRect ? (
        <div
          style={{
            position: 'fixed',
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            borderRadius: 14,
            boxShadow: '0 0 0 9999px rgba(7, 10, 18, 0.62)',
            border: '2px solid rgba(255,255,255,0.92)',
            background: 'transparent',
          }}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: 'rgba(7, 10, 18, 0.62)' }}
        />
      )}

      <div
        className="absolute rounded-2xl shadow-2xl overflow-hidden"
        style={{
          ...tooltipStyle,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
              First Run Tour
            </p>
            <h2 className="text-sm font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>
              {step.title}
            </h2>
          </div>
          <button
            onClick={onComplete}
            className="w-7 h-7 rounded flex items-center justify-center"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-4 py-4" style={{ overflowY: 'auto', flex: 1 }}>
          <p className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
            {step.body}
          </p>
          <p className="text-xs mt-3" style={{ color: 'var(--text-tertiary)' }}>
            Step {stepIndex + 1} of {STEPS.length}
          </p>
        </div>

        <div
          className="flex items-center justify-between px-4 py-3 gap-2"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <button
            onClick={onComplete}
            className="px-3 py-1.5 rounded text-xs font-medium"
            style={{
              background: 'transparent',
              border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)',
            }}
          >
            Skip Tour
          </button>

          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                onClick={handleBack}
                className="px-3 py-1.5 rounded text-xs font-medium"
                style={{
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                }}
              >
                Back
              </button>
            )}

            {!canAdvance && (
              <button
                onClick={handleTemplateAction}
                disabled={isWorking}
                className="px-3 py-1.5 rounded text-xs font-medium"
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  opacity: isWorking ? 0.7 : 1,
                  cursor: isWorking ? 'default' : 'pointer',
                }}
              >
                {isWorking ? 'Opening...' : 'Open Featured Example'}
              </button>
            )}

            {canAdvance && (
              <button
                onClick={handleNext}
                className="px-3 py-1.5 rounded text-xs font-medium"
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                }}
              >
                {stepIndex === STEPS.length - 1 ? 'Finish' : 'Next'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
