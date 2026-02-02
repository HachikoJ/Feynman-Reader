'use client'

import { useEffect, useState } from 'react'
import { Language } from '@/lib/i18n'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  message: string
  type: ToastType
  duration?: number
}

interface ToastProps {
  toast: Toast
  onRemove: (id: string) => void
  lang?: Language
}

// Individual Toast Item Component
function ToastItem({ toast, onRemove, lang = 'zh' }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    const duration = toast.duration || 3000
    const timer = setTimeout(() => {
      setIsExiting(true)
      setTimeout(() => onRemove(toast.id), 300)
    }, duration)

    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, onRemove])

  const icons = {
    success: '',
    error: '',
    info: '',
    warning: ''
  }

  const bgColors = {
    success: 'bg-green-500/20 border-green-500/50',
    error: 'bg-red-500/20 border-red-500/50',
    info: 'bg-blue-500/20 border-blue-500/50',
    warning: 'bg-yellow-500/20 border-yellow-500/50'
  }

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm shadow-lg transition-all duration-300 ${
        bgColors[toast.type]
      } ${isExiting ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'}`}
    >
      <span className="text-xl flex-shrink-0">{icons[toast.type]}</span>
      <p className="text-sm flex-1">{toast.message}</p>
      <button
        onClick={() => {
          setIsExiting(true)
          setTimeout(() => onRemove(toast.id), 300)
        }}
        className="flex-shrink-0 hover:opacity-70 transition-opacity"
      >
        ✕
      </button>
    </div>
  )
}

// Toast Container Component
interface ToastContainerProps {
  toasts: Toast[]
  onRemove: (id: string) => void
  lang?: Language
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center'
}

export function ToastContainer({
  toasts,
  onRemove,
  lang = 'zh',
  position = 'top-right'
}: ToastContainerProps) {
  if (toasts.length === 0) return null

  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-center': 'top-4 left-1/2 -translate-x-1/2',
    'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2'
  }

  return (
    <div
      className={`fixed z-50 flex flex-col gap-2 max-w-sm w-full ${positionClasses[position]}`}
      role="alert"
      aria-live="polite"
    >
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} lang={lang} />
      ))}
    </div>
  )
}

// Toast Hook for easy usage
interface UseToastReturn {
  toasts: Toast[]
  showToast: (message: string, type?: ToastType, duration?: number) => void
  removeToast: (id: string) => void
  success: (message: string, duration?: number) => void
  error: (message: string, duration?: number) => void
  info: (message: string, duration?: number) => void
  warning: (message: string, duration?: number) => void
  clearAll: () => void
}

export function useToast(): UseToastReturn {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = (message: string, type: ToastType = 'info', duration = 3000) => {
    const id = Math.random().toString(36).substring(2, 9)
    setToasts(prev => [...prev, { id, message, type, duration }])
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const success = (message: string, duration = 3000) => showToast(message, 'success', duration)
  const error = (message: string, duration = 4000) => showToast(message, 'error', duration)
  const info = (message: string, duration = 3000) => showToast(message, 'info', duration)
  const warning = (message: string, duration = 3000) => showToast(message, 'warning', duration)
  const clearAll = () => setToasts([])

  return { toasts, showToast, removeToast, success, error, info, warning, clearAll }
}

// Standalone Toast Component with built-in state
interface StandaloneToastProps {
  lang?: Language
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center'
}

export default function Toast({ lang = 'zh', position = 'top-right' }: StandaloneToastProps) {
  const toast = useToast()

  // Expose toast functions globally for easy access
  useEffect(() => {
    ;(window as any).toast = toast
  }, [toast])

  return (
    <ToastContainer
      toasts={toast.toasts}
      onRemove={toast.removeToast}
      lang={lang}
      position={position}
    />
  )
}

// Global toast helper function
declare global {
  interface Window {
    toast?: UseToastReturn
  }
}

export const globalToast = {
  success: (message: string) => (window as any).toast?.success(message),
  error: (message: string) => (window as any).toast?.error(message),
  info: (message: string) => (window as any).toast?.info(message),
  warning: (message: string) => (window as any).toast?.warning(message)
}
