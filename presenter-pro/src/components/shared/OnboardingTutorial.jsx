import React, { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { getPresentations } from '@/utils/ipc'
import {
  createNewPresentation,
  openPresentationInEditor,
} from '@/utils/presentationCommands'

const STEPS = [
  {
    id: 'home',
    selector: '[data-tour="home-entry"]',
    title: 'Start With A Presentation',
    body:
      'Use New Presentation to build a deck from scratch, or open the sample service to jump straight into the editor.',
  },
  {
    id: 'toolbar',
    selector: '[data-tour="editor-toolbar"]',
    title: 'Toolbar Shortcuts',
    body:
      'This row handles your fastest actions: add or duplicate slides, open the song and media libraries, and start presenting.',
  },
  {
    id: 'filmstrip',
    selector: '[data-tour="filmstrip"]',
    title: 'Filmstrip Navigation',
    body:
      'Sections and slides live here. Click to select, drag to reorder, and while presenting a click here can send a slide live.',
  },
  {
    id: 'canvas',
    selector: '[data-tour="canvas"]',
    title: 'Edit On The Canvas',
    body:
      'Double-click slide text to edit it, then use the formatting bar for size, alignment, bold, and color without leaving edit mode.',
  },
  {
    id: 'present',
    selector: '[data-tour="present-button"]',
    title: 'Go Live',
    body:
      'When you are ready, use Present or press F5 to open Presenter View and the clean output window.',
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
    if (!targetRect) {
      return {
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      }
    }

    const width = 340
    const margin = 20
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let left = targetRect.left
    if (left + width > viewportWidth - margin) {
      left = viewportWidth - width - margin
    }

    let top = targetRect.top + targetRect.height + 16
    if (top + 220 > viewportHeight - margin) {
      top = Math.max(margin, targetRect.top - 220 - 16)
    }

    return { left, top }
  }, [targetRect])

  const canAdvance = step?.id !== 'home' || currentView === 'editor'

  async function handleHomeAction() {
    setIsWorking(true)
    try {
      const result = await getPresentations()
      const firstPresentation = result?.success ? result.data?.[0] : null
      if (firstPresentation?.id) {
        await openPresentationInEditor(firstPresentation.id)
      } else {
        await createNewPresentation()
      }
      setTutorialStepIndex(1)
      setStepIndex(1)
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
          width: 340,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          pointerEvents: 'auto',
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

        <div className="px-4 py-4">
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
                onClick={handleHomeAction}
                disabled={isWorking}
                className="px-3 py-1.5 rounded text-xs font-medium"
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  opacity: isWorking ? 0.7 : 1,
                  cursor: isWorking ? 'default' : 'pointer',
                }}
              >
                {isWorking ? 'Opening...' : 'Open Sample Presentation'}
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
