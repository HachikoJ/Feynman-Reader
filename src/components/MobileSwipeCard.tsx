'use client'

import { useRef, useState, useEffect } from 'react'
import { useSwipe, isTouchDevice } from '@/lib/touchGestures'

interface Props {
  children: React.ReactNode
  leftAction?: {
    icon: string
    label: string
    color: string
    onAction: () => void
  }
  rightAction?: {
    icon: string
    label: string
    color: string
    onAction: () => void
  }
  onLongPress?: () => void
  className?: string
  disabled?: boolean
}

export default function MobileSwipeCard({
  children,
  leftAction,
  rightAction,
  onLongPress,
  className = '',
  disabled = false
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [currentAction, setCurrentAction] = useState<'left' | 'right' | null>(null)
  const [isLongPressing, setIsLongPressing] = useState(false)

  const isTouch = isTouchDevice()
  const SWIPE_THRESHOLD = 80

  // 滑动手势
  useSwipe(cardRef, {
    onSwipeLeft: () => {
      if (disabled || !rightAction) return
      setShowActions(true)
      setCurrentAction('right')
      setOffset(-SWIPE_THRESHOLD)
    },
    onSwipeRight: () => {
      if (disabled || !leftAction) return
      setShowActions(true)
      setCurrentAction('left')
      setOffset(SWIPE_THRESHOLD)
    },
    preventDefault: true
  })

  // 触摸处理
  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled) return
    setIsDragging(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || disabled) return

    const touch = e.touches[0]
    const card = cardRef.current
    if (!card) return

    const rect = card.getBoundingClientRect()
    const startX = rect.left + rect.width / 2
    const deltaX = touch.clientX - startX

    // 限制滑动范围
    const maxOffset = leftAction ? SWIPE_THRESHOLD : 0
    const minOffset = rightAction ? -SWIPE_THRESHOLD : 0
    const newOffset = Math.max(minOffset, Math.min(maxOffset, deltaX))

    setOffset(newOffset)

    // 判断当前激活的动作
    if (newOffset > 20) {
      setCurrentAction('left')
    } else if (newOffset < -20) {
      setCurrentAction('right')
    } else {
      setCurrentAction(null)
    }
  }

  const handleTouchEnd = () => {
    if (disabled) return
    setIsDragging(false)

    // 判断是否触发动作
    if (offset > SWIPE_THRESHOLD / 2 && leftAction) {
      leftAction.onAction()
      resetCard()
    } else if (offset < -SWIPE_THRESHOLD / 2 && rightAction) {
      rightAction.onAction()
      resetCard()
    } else {
      // 弹回
      setOffset(0)
      setShowActions(false)
      setCurrentAction(null)
    }
  }

  const resetCard = () => {
    setOffset(0)
    setShowActions(false)
    setCurrentAction(null)
    setIsLongPressing(false)
  }

  // 长按处理
  useEffect(() => {
    if (!onLongPress || !cardRef.current) return

    const card = cardRef.current
    let timer: ReturnType<typeof setTimeout> | null = null

    const handleStart = () => {
      timer = setTimeout(() => {
        setIsLongPressing(true)
        onLongPress()
      }, 500)
    }

    const handleEnd = () => {
      if (timer) clearTimeout(timer)
    }

    card.addEventListener('touchstart', handleStart)
    card.addEventListener('touchend', handleEnd)
    card.addEventListener('touchmove', handleEnd)

    return () => {
      card.removeEventListener('touchstart', handleStart)
      card.removeEventListener('touchend', handleEnd)
      card.removeEventListener('touchmove', handleEnd)
      if (timer) clearTimeout(timer)
    }
  }, [onLongPress])

  const action = currentAction === 'left' ? leftAction : rightAction

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* 背景动作按钮 */}
      <div
        className={`
          absolute inset-0 flex items-center justify-end px-4
          transition-colors duration-200
          ${currentAction === 'right' && rightAction ? rightAction.color : 'bg-transparent'}
          ${currentAction === 'left' && leftAction ? leftAction.color : 'bg-transparent'}
        `}
        style={{
          clipPath: showActions
            ? currentAction === 'left'
              ? `inset(0 0 0 ${Math.max(0, offset)}px)`
              : `inset(0 ${Math.max(0, -offset)}px 0 0)`
            : 'inset(0)'
        }}
      >
        {action && (
          <div className="flex items-center gap-2 text-white">
            <span className="text-sm font-medium">{action.label}</span>
            <span className="text-xl">{action.icon}</span>
          </div>
        )}
      </div>

      {/* 卡片内容 */}
      <div
        ref={cardRef}
        className={`
          relative bg-[var(--bg-card)] border border-[var(--border)] rounded-xl
          transition-transform duration-200 ease-out
          ${isLongPressing ? 'scale-95 opacity-80' : ''}
        `}
        style={{
          transform: `translateX(${offset}px)`
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* 长按指示器 */}
        {isLongPressing && (
          <div className="absolute inset-0 bg-[var(--accent)]/10 rounded-xl flex items-center justify-center">
            <div className="text-2xl animate-pulse">⏳</div>
          </div>
        )}

        {children}

        {/* 滑动提示（仅在桌面端显示） */}
        {!isTouch && (leftAction || rightAction) && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 hover:opacity-100 transition-opacity">
            {leftAction && (
              <button
                onClick={leftAction.onAction}
                className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                title={leftAction.label}
              >
                {leftAction.icon}
              </button>
            )}
            {rightAction && (
              <button
                onClick={rightAction.onAction}
                className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                title={rightAction.label}
              >
                {rightAction.icon}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * 快捷方式组件：用于书架中的书籍卡片
 */
interface SwipeableBookCardProps {
  book: any
  children: React.ReactNode
  onEdit?: () => void
  onDelete?: () => void
  onToggleStatus?: () => void
  className?: string
}

export function SwipeableBookCard({
  book,
  children,
  onEdit,
  onDelete,
  onToggleStatus,
  className = ''
}: SwipeableBookCardProps) {
  const isTouch = isTouchDevice()

  if (!isTouch || !onEdit) {
    // 非触摸设备或不支持操作时，直接返回内容
    return <div className={className}>{children}</div>
  }

  return (
    <MobileSwipeCard
      leftAction={onToggleStatus ? {
        icon: book.status === 'unread' ? '📖' : book.status === 'reading' ? '✅' : '📚',
        label: book.status === 'unread' ? '开始阅读' : book.status === 'reading' ? '标记完成' : '标记未读',
        color: 'bg-blue-500',
        onAction: onToggleStatus
      } : undefined}
      rightAction={onDelete ? {
        icon: '🗑️',
        label: '删除',
        color: 'bg-red-500',
        onAction: onDelete
      } : undefined}
      onLongPress={onEdit}
      className={className}
    >
      {children}
    </MobileSwipeCard>
  )
}
