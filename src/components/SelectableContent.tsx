'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Language } from '@/lib/i18n'
import { openAssistantWithSelection } from '@/lib/assistantEvents'
import type { AssistantSource } from '@/lib/assistantSources'
import AppIcon from './AppIcon'

type SelectionSource = AssistantSource | ((text: string) => AssistantSource)

interface Props {
  children: ReactNode
  className?: string
  lang?: Language
  source?: SelectionSource
  onSaveSelection?: (text: string) => Promise<void> | void
  saveLabel?: string
  savedLabel?: string
  maxLength?: number
}

interface ContentSelection {
  text: string
  top: number
  left: number
}

const DEFAULT_MAX_LENGTH = 2_000

function isEditableSelection(node: Node | null): boolean {
  const element = node instanceof Element ? node : node?.parentElement
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'))
}

/**
 * Gives any rendered learning content one consistent selection menu. The source
 * travels with the assistant request so its answer can link back to this record.
 */
export default function SelectableContent({
  children,
  className = '',
  lang = 'zh',
  source,
  onSaveSelection,
  saveLabel,
  savedLabel,
  maxLength = DEFAULT_MAX_LENGTH
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<ContentSelection | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const zh = lang === 'zh'

  const captureSelection = () => {
    if (typeof window === 'undefined') return
    const current = window.getSelection()
    if (!current || current.isCollapsed || !current.rangeCount || !rootRef.current) {
      setSelection(null)
      return
    }
    const anchor = current.anchorNode
    const focus = current.focusNode
    if (!anchor || !focus || !rootRef.current.contains(anchor) || !rootRef.current.contains(focus)) {
      setSelection(null)
      return
    }
    const anchorElement = anchor instanceof Element ? anchor : anchor.parentElement
    const focusElement = focus instanceof Element ? focus : focus.parentElement
    const anchorOwner = anchorElement?.closest('[data-selection-owner]')
    const focusOwner = focusElement?.closest('[data-selection-owner]')
    if ((anchorOwner && anchorOwner !== rootRef.current) || (focusOwner && focusOwner !== rootRef.current)) {
      setSelection(null)
      return
    }
    if (isEditableSelection(anchor) || isEditableSelection(focus)) return
    const text = current.toString().replace(/\s+/g, ' ').trim()
    if (text.length < 2) {
      setSelection(null)
      return
    }
    const rect = current.getRangeAt(0).getBoundingClientRect()
    if (!rect.width && !rect.height) return
    const menuWidth = onSaveSelection ? 304 : 210
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - menuWidth - 8))
    const below = rect.bottom + 8
    const top = below + 48 <= window.innerHeight ? below : Math.max(8, rect.top - 48)
    setSaveState('idle')
    setCopyState('idle')
    setSelection({ text: text.slice(0, Math.max(2, maxLength)), top, left })
  }

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setSelection(null)
    }
    const closeOnScroll = () => setSelection(null)
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', closeOnScroll, { passive: true })
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', closeOnScroll)
    }
  }, [])

  const askAssistant = () => {
    if (!selection || !source) return
    const resolvedSource = typeof source === 'function' ? source(selection.text) : source
    openAssistantWithSelection({
      text: selection.text,
      source: { ...resolvedSource, excerpt: selection.text },
      bookId: resolvedSource.bookId,
      lang
    })
    setSelection(null)
  }

  const copySelection = async () => {
    if (!selection) return
    try {
      await navigator.clipboard.writeText(selection.text)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
  }

  const saveSelection = async () => {
    if (!selection || !onSaveSelection || saveState === 'saving') return
    setSaveState('saving')
    try {
      await onSaveSelection(selection.text)
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  return (
    <div
      ref={rootRef}
      className={className}
      data-selection-surface="true"
      data-selection-owner="true"
      onMouseUp={event => {
        event.stopPropagation()
        window.setTimeout(captureSelection, 0)
      }}
      onTouchEnd={event => {
        event.stopPropagation()
        window.setTimeout(captureSelection, 0)
      }}
      onKeyUp={event => {
        event.stopPropagation()
        window.setTimeout(captureSelection, 0)
      }}
    >
      {children}
      {selection && (
        <div
          role="toolbar"
          aria-label={zh ? '选中文本操作' : 'Selected text actions'}
          className="fixed z-[90] flex min-h-10 items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-1 shadow-xl shadow-black/15"
          style={{ top: selection.top, left: selection.left }}
          onMouseDown={event => event.preventDefault()}
        >
          {source && (
            <button
              type="button"
              onClick={askAssistant}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-2.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
              aria-label={zh ? '向费曼小助手提问' : 'Ask Feynman Assistant'}
            >
              <AppIcon name="sparkles" size={14} />
              {zh ? '问小助手' : 'Ask'}
            </button>
          )}
          {onSaveSelection && (
            <button
              type="button"
              onClick={() => void saveSelection()}
              disabled={saveState === 'saving'}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10 disabled:opacity-60"
              aria-label={saveState === 'error' ? (zh ? '保存失败，点击重试' : 'Save failed, retry') : saveLabel || (zh ? '保存选中内容' : 'Save selection')}
            >
              <AppIcon name={saveState === 'saved' ? 'success' : 'bookMarked'} size={14} />
              {saveState === 'saving'
                ? (zh ? '保存中…' : 'Saving…')
                : saveState === 'saved'
                  ? (savedLabel || (zh ? '已保存' : 'Saved'))
                  : saveState === 'error'
                    ? (zh ? '重试' : 'Retry')
                    : (saveLabel || (zh ? '保存' : 'Save'))}
            </button>
          )}
          <button
            type="button"
            onClick={() => void copySelection()}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
            aria-label={copyState === 'error' ? (zh ? '复制失败，点击重试' : 'Copy failed, retry') : (zh ? '复制选中内容' : 'Copy selection')}
          >
            <AppIcon name={copyState === 'copied' ? 'success' : 'clipboard'} size={14} />
            {copyState === 'copied' ? (zh ? '已复制' : 'Copied') : copyState === 'error' ? (zh ? '重试' : 'Retry') : (zh ? '复制' : 'Copy')}
          </button>
        </div>
      )}
    </div>
  )
}
