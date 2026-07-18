'use client'

import { useEffect, useRef, useState } from 'react'
import AppIcon, { AppIconName } from './AppIcon'

interface SwipeAction {
  icon: AppIconName
  label: string
  color: string
  onAction: () => void
}

interface Props {
  children: React.ReactNode
  leftAction?: SwipeAction
  rightAction?: SwipeAction
  onLongPress?: () => void
  className?: string
  disabled?: boolean
}

const ACTION_WIDTH = 92
const REVEAL_THRESHOLD = 46

export default function MobileSwipeCard({
  children,
  leftAction,
  rightAction,
  onLongPress,
  className = '',
  disabled = false
}: Props) {
  const startPoint = useRef<{ x: number; y: number } | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const moved = useRef(false)
  const [offset, setOffset] = useState(0)
  const [touchEnabled, setTouchEnabled] = useState(false)

  useEffect(() => {
    setTouchEnabled('ontouchstart' in window || navigator.maxTouchPoints > 0)
  }, [])

  const clearLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = null
  }

  const reset = () => {
    setOffset(0)
    startPoint.current = null
    moved.current = false
    clearLongPress()
  }

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (disabled || !touchEnabled) return
    const touch = event.touches[0]
    startPoint.current = { x: touch.clientX, y: touch.clientY }
    moved.current = false
    clearLongPress()
    if (onLongPress) {
      longPressTimer.current = setTimeout(() => {
        if (!moved.current) onLongPress()
      }, 550)
    }
  }

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (disabled || !startPoint.current) return
    const touch = event.touches[0]
    const deltaX = touch.clientX - startPoint.current.x
    const deltaY = touch.clientY - startPoint.current.y

    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) {
      clearLongPress()
      setOffset(0)
      return
    }
    if (Math.abs(deltaX) <= 6) return

    moved.current = true
    clearLongPress()
    const min = rightAction ? -ACTION_WIDTH : 0
    const max = leftAction ? ACTION_WIDTH : 0
    setOffset(Math.max(min, Math.min(max, deltaX)))
  }

  const handleTouchEnd = () => {
    clearLongPress()
    if (disabled) return reset()
    if (offset >= REVEAL_THRESHOLD && leftAction) setOffset(ACTION_WIDTH)
    else if (offset <= -REVEAL_THRESHOLD && rightAction) setOffset(-ACTION_WIDTH)
    else setOffset(0)
    startPoint.current = null
  }

  const runAction = (action: SwipeAction) => {
    reset()
    action.onAction()
  }

  if (!touchEnabled || disabled || (!leftAction && !rightAction)) {
    return <div className={className}>{children}</div>
  }

  return (
    <div data-testid="mobile-swipe-card" className={`relative overflow-hidden rounded-lg ${className}`}>
      {leftAction && (
        <button
          type="button"
          onClick={() => runAction(leftAction)}
          className={`absolute inset-y-0 left-0 flex w-[92px] flex-col items-center justify-center gap-1 text-white ${leftAction.color}`}
          aria-label={leftAction.label}
        >
          <AppIcon name={leftAction.icon} size={20} />
          <span className="text-xs font-medium">{leftAction.label}</span>
        </button>
      )}
      {rightAction && (
        <button
          type="button"
          onClick={() => runAction(rightAction)}
          className={`absolute inset-y-0 right-0 flex w-[92px] flex-col items-center justify-center gap-1 text-white ${rightAction.color}`}
          aria-label={rightAction.label}
        >
          <AppIcon name={rightAction.icon} size={20} />
          <span className="text-xs font-medium">{rightAction.label}</span>
        </button>
      )}

      <div
        className="relative transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${offset}px)`, touchAction: 'pan-y' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={reset}
        onClickCapture={event => {
          if (offset !== 0) {
            event.preventDefault()
            event.stopPropagation()
            setOffset(0)
          }
        }}
      >
        {children}
      </div>
    </div>
  )
}
