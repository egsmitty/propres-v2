import React, { useState, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

function formatCountdownInput(input) {
  const value = input.trim()
  if (!value) return null

  if (value.includes(':')) {
    const [minutes, seconds] = value.split(':').map((part) => Number(part))
    if (Number.isNaN(minutes) || Number.isNaN(seconds)) return null
    return minutes * 60 + seconds
  }

  const seconds = Number(value)
  if (Number.isNaN(seconds)) return null
  return seconds
}

function formatRemaining(endAt) {
  if (!endAt) return '00:00'
  const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export default function PresenterView() {
  const [slides, setSlides] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [isBlack, setIsBlack] = useState(false)
  const [isLogo, setIsLogo] = useState(false)
  const [countdown, setCountdown] = useState({ active: false, endAt: null, durationSeconds: 0 })
  const [remaining, setRemaining] = useState('00:00')
  const idxRef = useRef(0)
  const slidesRef = useRef([])

  useEffect(() => { slidesRef.current = slides }, [slides])
  useEffect(() => { idxRef.current = currentIdx }, [currentIdx])
  useEffect(() => {
    if (!countdown.active || !countdown.endAt) {
      setRemaining('00:00')
      return
    }

    const sync = () => setRemaining(formatRemaining(countdown.endAt))
    sync()
    const interval = window.setInterval(sync, 250)
    return () => window.clearInterval(interval)
  }, [countdown])

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    api.notifyPresenterReady?.()

    const offStart = api.onPresenterStart(({ slides: list }) => {
      setSlides(list)
      slidesRef.current = list
      setCurrentIdx(0)
      idxRef.current = 0
      setIsBlack(false)
      setIsLogo(false)
    })

    const offAdvance = api.onSlideAdvance(({ slide }) => {
      const idx = slidesRef.current.findIndex((s) => s.id === slide.id)
      if (idx !== -1) { setCurrentIdx(idx); idxRef.current = idx }
      setIsBlack(false)
      setIsLogo(false)
    })

    const offBlack = api.onOutputBlack(({ active }) => {
      setIsBlack(Boolean(active))
      if (active) setIsLogo(false)
    })
    const offLogo = api.onOutputLogo(({ active }) => {
      setIsLogo(Boolean(active))
      if (active) setIsBlack(false)
    })
    const offCountdown = api.onOutputCountdown((state) => {
      setCountdown(state || { active: false, endAt: null, durationSeconds: 0 })
    })
    const offStop = api.onPresenterStop(() => window.close())

    function handleKey(e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext()
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrev()
      if (e.key === 'b' || e.key === 'B') toggleBlack()
      if (e.key === 'l' || e.key === 'L') toggleLogo()
      if (e.key === 'c' || e.key === 'C') toggleCountdown()
      if (e.key === 'Escape') api.stopPresenting()
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('keydown', handleKey)
      offStart?.()
      offAdvance?.()
      offBlack?.()
      offLogo?.()
      offCountdown?.()
      offStop?.()
    }
  }, [])

  function goTo(idx) {
    const list = slidesRef.current
    if (!list.length || idx < 0 || idx >= list.length) return
    setCurrentIdx(idx)
    idxRef.current = idx
    setIsBlack(false)
    setIsLogo(false)
    window.electronAPI?.presenterGoToSlide(list[idx])
  }

  function goNext() { goTo(idxRef.current + 1) }
  function goPrev() { goTo(idxRef.current - 1) }

  function toggleBlack() {
    window.electronAPI?.sendBlack()
  }

  function toggleLogo() {
    window.electronAPI?.sendLogo()
  }

  function toggleCountdown() {
    if (countdown.active) {
      window.electronAPI?.stopCountdown()
      return
    }

    const input = window.prompt('Countdown length (mm:ss or seconds):', '5:00')
    if (input === null) return

    const durationSeconds = formatCountdownInput(input)
    if (!durationSeconds || durationSeconds <= 0) {
      window.alert('Enter a valid countdown like 5:00 or 300.')
      return
    }

    window.electronAPI?.startCountdown(durationSeconds)
  }

  const current = slides[currentIdx] || null
  const next = slides[currentIdx + 1] || null

  return (
    <div className="flex flex-col h-screen select-none" style={{ background: '#0d0d0d', color: '#f0f0f0' }}>
      {/* Status */}
      <div
        className="flex items-center px-4 shrink-0 h-10 gap-3"
        style={{ background: '#1a1a1a', borderBottom: '1px solid #2a2a2a' }}
      >
        <div className="w-2 h-2 rounded-full" style={{ background: '#16a34a' }} />
        <span className="text-sm font-medium" style={{ color: '#16a34a' }}>PRESENTING</span>
        {slides.length > 0 && (
          <span className="text-sm" style={{ color: '#666' }}>
            — Slide {currentIdx + 1} of {slides.length}
          </span>
        )}
        {countdown.active && (
          <span
            className="text-sm font-medium ml-auto px-2 py-1 rounded"
            style={{ color: '#f8fafc', background: 'rgba(74,124,255,0.18)' }}
          >
            Countdown {remaining}
          </span>
        )}
      </div>

      {/* Previews */}
      <div className="flex flex-1 overflow-hidden gap-4 p-4">
        <div className="flex-1 flex flex-col gap-2">
          <p className="text-xs uppercase tracking-wide" style={{ color: '#666' }}>Current</p>
          <div
            className="flex-1 rounded-lg flex items-center justify-center"
            style={{
              background: isBlack ? '#000' : '#1a1a1a',
              border: '2px solid #16a34a',
              fontSize: 20,
              color: '#fff',
              textAlign: 'center',
              padding: 24,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              lineHeight: 1.4,
            }}
          >
            {isBlack
              ? <span style={{ color: '#333' }}>BLACK</span>
              : isLogo
              ? <span style={{ color: '#4a7cff' }}>LOGO</span>
              : current?.body || <span style={{ color: '#555' }}>No slide</span>}
          </div>
          {current && (
            <p className="text-xs text-center" style={{ color: '#666' }}>
              {current.label || current.type}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 shrink-0" style={{ width: 240 }}>
          <p className="text-xs uppercase tracking-wide" style={{ color: '#666' }}>Next</p>
          <div
            className="rounded-lg flex items-center justify-center"
            style={{
              background: '#111',
              border: '1px solid #2a2a2a',
              aspectRatio: '16/9',
              fontSize: 11,
              color: '#999',
              textAlign: 'center',
              padding: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {next?.body || <span style={{ color: '#333' }}>—</span>}
          </div>
          {next && <p className="text-xs" style={{ color: '#666' }}>{next.label}</p>}
        </div>
      </div>

      {/* Transport */}
      <div
        className="flex items-center justify-center gap-3 px-4 py-3 shrink-0"
        style={{ borderTop: '1px solid #1a1a1a' }}
      >
        <PresBtn onClick={goPrev} disabled={currentIdx === 0}>
          <ChevronLeft size={20} /> Prev
        </PresBtn>
        <span className="text-sm px-2" style={{ color: '#555' }}>
          {slides.length ? `${currentIdx + 1} / ${slides.length}` : '—'}
        </span>
        <PresBtn onClick={goNext} disabled={currentIdx >= slides.length - 1}>
          Next <ChevronRight size={20} />
        </PresBtn>
      </div>

      {/* Action controls */}
      <div className="flex items-center justify-center gap-3 px-4 pb-4 shrink-0">
        <ActionBtn active={isBlack} onClick={toggleBlack}>Black (B)</ActionBtn>
        <ActionBtn active={isLogo} onClick={toggleLogo}>Logo (L)</ActionBtn>
        <ActionBtn active={countdown.active} onClick={toggleCountdown}>
          {countdown.active ? `Stop Countdown (${remaining})` : 'Add Countdown (C)'}
        </ActionBtn>
        <ActionBtn danger onClick={() => window.electronAPI?.stopPresenting()}>Stop (Esc)</ActionBtn>
      </div>

      {/* Mini filmstrip */}
      {slides.length > 0 && (
        <div
          className="flex gap-1.5 px-4 pb-3 overflow-x-auto shrink-0"
          style={{ borderTop: '1px solid #1a1a1a', paddingTop: 10 }}
        >
          {slides.map((sl, i) => (
            <button
              key={sl.id}
              onClick={() => goTo(i)}
              className="shrink-0 rounded overflow-hidden"
              style={{
                width: 72,
                aspectRatio: '16/9',
                background: i === currentIdx ? '#1a3a1a' : '#1a1a1a',
                border: i === currentIdx ? '2px solid #16a34a' : '1px solid #2a2a2a',
                fontSize: 6,
                color: '#999',
                textAlign: 'center',
                padding: 4,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                lineHeight: 1.3,
                cursor: 'pointer',
              }}
            >
              {sl.body}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function PresBtn({ onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 px-4 rounded-lg font-medium text-sm"
      style={{
        background: '#1a1a1a',
        border: '1px solid #2a2a2a',
        color: disabled ? '#444' : '#f0f0f0',
        height: 48,
        minWidth: 90,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function ActionBtn({ onClick, danger, active, children }) {
  return (
    <button
      onClick={onClick}
      className="px-4 rounded-lg font-medium text-sm"
      style={{
        background: danger ? 'rgba(220,38,38,0.15)' : active ? '#2a2a2a' : '#1a1a1a',
        border: `1px solid ${danger ? '#7f1d1d' : '#2a2a2a'}`,
        color: danger ? '#f87171' : '#f0f0f0',
        height: 48,
        minWidth: 100,
      }}
    >
      {children}
    </button>
  )
}
