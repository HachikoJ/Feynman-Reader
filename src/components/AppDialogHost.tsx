'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Language } from '@/lib/i18n'
import {
  AppDialogRequest,
  AppDialogResult,
  AppDialogTone,
  subscribeToAppDialogs
} from '@/lib/appDialog'
import AppIcon, { AppIconName, AppIconTone } from './AppIcon'

interface Props {
  lang: Language
}

const TONE_CONFIG: Record<AppDialogTone, {
  icon: AppIconName
  iconTone: AppIconTone
  confirmClass: string
}> = {
  danger: {
    icon: 'alert',
    iconTone: 'red',
    confirmClass: 'bg-red-500 hover:bg-red-600 text-white'
  },
  warning: {
    icon: 'alert',
    iconTone: 'amber',
    confirmClass: 'bg-amber-500 hover:bg-amber-600 text-white'
  },
  info: {
    icon: 'info',
    iconTone: 'blue',
    confirmClass: 'bg-[var(--accent)] hover:opacity-90 text-white'
  },
  success: {
    icon: 'success',
    iconTone: 'green',
    confirmClass: 'bg-emerald-500 hover:bg-emerald-600 text-white'
  }
}

export default function AppDialogHost({ lang }: Props) {
  const [queue, setQueue] = useState<AppDialogRequest[]>([])
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const messageId = useId()
  const active = queue[0] || null

  useEffect(() => subscribeToAppDialogs(request => {
    setQueue(current => [...current, request])
  }), [])

  useEffect(() => {
    if (!active) return
    setInputValue(active.defaultValue || '')
    const frame = requestAnimationFrame(() => {
      if (active.kind === 'prompt') inputRef.current?.focus()
      else confirmRef.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [active])

  useEffect(() => {
    if (!active) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [active])

  const finish = (result: AppDialogResult) => {
    if (!active) return
    setQueue(current => current.slice(1))
    active.resolve(result)
  }

  const cancel = () => {
    if (!active) return
    if (active.kind === 'alert') finish(undefined)
    else if (active.kind === 'confirm') finish(false)
    else finish(null)
  }

  useEffect(() => {
    if (!active) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel()
      if (event.key === 'Enter' && active.kind === 'prompt') finish(inputValue)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  if (!active) return null

  const tone = active.tone || 'info'
  const config = TONE_CONFIG[tone]
  const confirmText = active.confirmText || (active.kind === 'alert'
    ? (lang === 'zh' ? '我知道了' : 'Got it')
    : (lang === 'zh' ? '确认' : 'Confirm'))
  const cancelText = active.cancelText || (lang === 'zh' ? '取消' : 'Cancel')

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 100 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onClick={cancel}
    >
      <div className="modal-content max-w-sm" onClick={event => event.stopPropagation()}>
        <div className="text-center">
          <AppIcon name={config.icon} tone={config.iconTone} size={46} className="mx-auto mb-4" />
          <h2 id={titleId} className="mb-2 text-xl font-bold">{active.title}</h2>
          <p id={messageId} className="mb-5 whitespace-pre-line text-sm leading-6 text-[var(--text-secondary)]">
            {active.message}
          </p>

          {active.kind === 'prompt' && (
            <label className="mb-5 block text-left text-sm">
              {active.inputLabel && <span className="mb-1 block font-medium">{active.inputLabel}</span>}
              <input
                ref={inputRef}
                value={inputValue}
                onChange={event => setInputValue(event.target.value)}
                placeholder={active.inputPlaceholder}
                className="input-field"
              />
            </label>
          )}

          <div className="flex gap-3">
            {active.kind !== 'alert' && (
              <button type="button" onClick={cancel} className="btn-secondary flex-1">
                {cancelText}
              </button>
            )}
            <button
              ref={confirmRef}
              type="button"
              onClick={() => finish(active.kind === 'prompt' ? inputValue : true)}
              className={`flex-1 rounded-xl px-4 py-3 font-medium transition-colors ${config.confirmClass}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
