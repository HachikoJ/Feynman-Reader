'use client'

import { useCallback, useState, useEffect, useRef } from 'react'
import { Language } from '@/lib/i18n'
import { undoRedoManager, UndoRedoState } from '@/lib/undoRedo'

interface Props {
  lang: Language
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.isContentEditable ||
    target.contentEditable === 'true' ||
    target.getAttribute('contenteditable') === 'true' ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

export default function UndoRedoControls({ lang }: Props) {
  const [state, setState] = useState<UndoRedoState>(undoRedoManager.getState())
  const [showHint, setShowHint] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const operationInFlightRef = useRef(false)
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showStatus = useCallback((message: string) => {
    setStatusMessage(message)
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    statusTimerRef.current = setTimeout(() => setStatusMessage(null), 4000)
  }, [])

  useEffect(() => {
    const unsubscribe = undoRedoManager.subscribe((newState) => {
      setState(newState)
    })
    const handleShortcutStatus = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message
      if (message) showStatus(message)
    }
    window.addEventListener('undo-redo-status', handleShortcutStatus)
    return () => {
      unsubscribe()
      window.removeEventListener('undo-redo-status', handleShortcutStatus)
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    }
  }, [showStatus])

  const handleUndo = async () => {
    if (operationInFlightRef.current) return
    operationInFlightRef.current = true
    setBusy(true)
    try {
      const succeeded = await undoRedoManager.undo()
      if (!succeeded) {
        showStatus(lang === 'zh' ? '撤销失败，请检查本地存储后重试。' : 'Undo failed. Check local storage and try again.')
        return
      }
      setShowHint(true)
      setTimeout(() => setShowHint(false), 2000)
    } finally {
      operationInFlightRef.current = false
      setBusy(false)
    }
  }

  const handleRedo = async () => {
    if (operationInFlightRef.current) return
    operationInFlightRef.current = true
    setBusy(true)
    try {
      const succeeded = await undoRedoManager.redo()
      if (!succeeded) {
        showStatus(lang === 'zh' ? '重做失败，请检查本地存储后重试。' : 'Redo failed. Check local storage and try again.')
        return
      }
      setShowHint(true)
      setTimeout(() => setShowHint(false), 2000)
    } finally {
      operationInFlightRef.current = false
      setBusy(false)
    }
  }

  const canUndo = undoRedoManager.canUndo()
  const canRedo = undoRedoManager.canRedo()
  const undoDesc = undoRedoManager.getUndoDescription()
  const redoDesc = undoRedoManager.getRedoDescription()

  // 如果两个都不能用，不显示组件
  if (!canUndo && !canRedo && !statusMessage) {
    return null
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2">
      {(canUndo || canRedo) && (
      <div className="flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-xl p-2">
        {/* 撤销按钮 */}
        <button
          onClick={handleUndo}
          disabled={!canUndo || busy}
          className={`
            flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all font-medium
            ${canUndo
              ? 'bg-[var(--bg-secondary)] hover:bg-[var(--accent)] hover:text-white text-[var(--text-primary)]'
              : 'opacity-40 cursor-not-allowed text-[var(--text-secondary)]'
            }
          `}
          title={canUndo ? undoDesc || (lang === 'zh' ? '撤销' : 'Undo') : (lang === 'zh' ? '无法撤销' : 'Cannot undo')}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
          <span className="text-sm">{lang === 'zh' ? '撤销' : 'Undo'}</span>
          {/* 快捷键提示 */}
          <span className="text-xs opacity-50 hidden sm:inline">Ctrl+Z</span>
        </button>

        {/* 分隔线 */}
        <div className="w-px h-6 bg-[var(--border)]" />

        {/* 重做按钮 */}
        <button
          onClick={handleRedo}
          disabled={!canRedo || busy}
          className={`
            flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all font-medium
            ${canRedo
              ? 'bg-[var(--bg-secondary)] hover:bg-[var(--accent)] hover:text-white text-[var(--text-primary)]'
              : 'opacity-40 cursor-not-allowed text-[var(--text-secondary)]'
            }
          `}
          title={canRedo ? redoDesc || (lang === 'zh' ? '重做' : 'Redo') : (lang === 'zh' ? '无法重做' : 'Cannot redo')}
        >
          <span className="text-sm">{lang === 'zh' ? '重做' : 'Redo'}</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
          </svg>
          {/* 快捷键提示 */}
          <span className="text-xs opacity-50 hidden sm:inline">Ctrl+Y</span>
        </button>

        {/* 清空历史 */}
        {state.past.length > 0 || state.future.length > 0 ? (
          <>
            <div className="w-px h-6 bg-[var(--border)]" />
            <button
              onClick={() => { if (!busy) undoRedoManager.clear() }}
              disabled={busy}
              className="px-3 py-2.5 rounded-xl text-[var(--text-secondary)] hover:text-red-400 hover:bg-red-400/10 transition-all"
              title={lang === 'zh' ? '清空历史' : 'Clear history'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </>
        ) : null}
      </div>
      )}

      {statusMessage && (
        <div role="alert" className="max-w-sm rounded-lg border border-red-500/40 bg-[var(--bg-card)] px-4 py-2 text-sm text-red-500 shadow-lg">
          {statusMessage}
        </div>
      )}

      {/* 操作提示 */}
      {showHint && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-4 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-lg animate-fade-in">
          <span className="text-sm">
            {canUndo ? undoDesc : redoDesc}
          </span>
        </div>
      )}
    </div>
  )
}

// Hook for keyboard shortcuts
export function useUndoRedoShortcuts(lang: Language) {
  useEffect(() => {
    let shortcutInFlight = false
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (isEditableShortcutTarget(e.target)) return

      // Ctrl+Z 撤销
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (shortcutInFlight) return
        shortcutInFlight = true
        try {
          if (!await undoRedoManager.undo()) {
            window.dispatchEvent(new CustomEvent('undo-redo-status', {
              detail: { message: lang === 'zh' ? '撤销失败，请检查本地存储后重试。' : 'Undo failed. Check local storage and try again.' }
            }))
          }
        } finally {
          shortcutInFlight = false
        }
      }
      // Ctrl+Y 或 Ctrl+Shift+Z 重做
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        if (shortcutInFlight) return
        shortcutInFlight = true
        try {
          if (!await undoRedoManager.redo()) {
            window.dispatchEvent(new CustomEvent('undo-redo-status', {
              detail: { message: lang === 'zh' ? '重做失败，请检查本地存储后重试。' : 'Redo failed. Check local storage and try again.' }
            }))
          }
        } finally {
          shortcutInFlight = false
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lang])
}
