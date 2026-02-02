'use client'

import { useEffect } from 'react'
import { Language } from '@/lib/i18n'

export interface ConfirmDialogOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'warning' | 'info'
  onConfirm: () => void
  onCancel?: () => void
}

interface Props {
  options: ConfirmDialogOptions | null
  onClose: () => void
  lang: Language
}

export default function ConfirmDialog({ options, onClose, lang }: Props) {
  useEffect(() => {
    // ESC 键关闭对话框
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        options?.onCancel?.()
        onClose()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [options, onClose])

  if (!options) return null

  const {
    title,
    message,
    confirmText = lang === 'zh' ? '确认' : 'Confirm',
    cancelText = lang === 'zh' ? '取消' : 'Cancel',
    type = 'danger',
    onConfirm,
    onCancel
  } = options

  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  const handleCancel = () => {
    onCancel?.()
    onClose()
  }

  // 图标和颜色映射
  const typeConfig = {
    danger: {
      icon: '⚠️',
      btnClass: 'bg-red-500 hover:bg-red-600 text-white'
    },
    warning: {
      icon: '⚠️',
      btnClass: 'bg-yellow-500 hover:bg-yellow-600 text-white'
    },
    info: {
      icon: 'ℹ️',
      btnClass: 'bg-[var(--accent)] hover:opacity-90 text-white'
    }
  }

  const config = typeConfig[type]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={handleCancel}
      />

      {/* 对话框 */}
      <div className="relative bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-2xl max-w-md w-full p-6 animate-scale-in">
        {/* 图标 */}
        <div className="text-center mb-4">
          <div className="text-6xl">{config.icon}</div>
        </div>

        {/* 标题 */}
        <h2 className="text-xl font-bold text-center mb-3">
          {title}
        </h2>

        {/* 消息 */}
        <p className="text-[var(--text-secondary)] text-center mb-6">
          {message}
        </p>

        {/* 按钮组 */}
        <div className="flex gap-3">
          <button
            onClick={handleCancel}
            className="flex-1 py-3 px-4 bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] rounded-xl transition-all font-medium"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={`flex-1 py-3 px-4 rounded-xl transition-all font-medium ${config.btnClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

// Hook 用于全局对话框管理
interface DialogState {
  options: ConfirmDialogOptions | null
  showDialog: (options: ConfirmDialogOptions) => Promise<boolean>
  closeDialog: () => void
}

export function useConfirmDialog(): DialogState {
  const [options, setOptions] = React.useState<ConfirmDialogOptions | null>(null)
  const [resolver, setResolver] = React.useState<{
    resolve: (result: boolean) => void
  } | null>(null)

  const showDialog = (options: ConfirmDialogOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setOptions(options)
      setResolver({ resolve })
    })
  }

  const closeDialog = () => {
    resolver?.resolve(false)
    setOptions(null)
    setResolver(null)
  }

  // 处理确认
  const handleConfirm = () => {
    options?.onConfirm?.()
    resolver?.resolve(true)
    setOptions(null)
    setResolver(null)
  }

  // 处理取消
  const handleCancel = () => {
    options?.onCancel?.()
    closeDialog()
  }

  return {
    options,
    showDialog,
    closeDialog: () => {
      handleCancel()
    }
  }
}

import React from 'react'
