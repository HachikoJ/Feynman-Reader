/**
 * 移动端触摸手势处理模块
 * 支持滑动操作（左滑/右滑）
 */

export type SwipeDirection = 'left' | 'right' | 'up' | 'down' | null

export interface SwipeGestureOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
  swipeThreshold?: number // 滑动阈值（像素）
  preventDefault?: boolean
}

export interface TouchPosition {
  x: number
  y: number
  timestamp: number
}

/**
 * 检测元素上的滑动手势
 */
export function useSwipeGestures(
  element: HTMLElement | null,
  options: SwipeGestureOptions
): () => void {
  if (!element) return () => {}

  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    swipeThreshold = 50,
    preventDefault = false
  } = options

  let startPos: TouchPosition | null = null
  let isDragging = false

  const handleTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0]
    startPos = {
      x: touch.clientX,
      y: touch.clientY,
      timestamp: Date.now()
    }
    isDragging = false
  }

  const handleTouchMove = (e: TouchEvent) => {
    if (!startPos) return

    const touch = e.touches[0]
    const deltaX = Math.abs(touch.clientX - startPos.x)
    const deltaY = Math.abs(touch.clientY - startPos.y)

    // 判断是否是滑动而不是点击
    if (deltaX > 10 || deltaY > 10) {
      isDragging = true
    }

    if (preventDefault && isDragging) {
      e.preventDefault()
    }
  }

  const handleTouchEnd = (e: TouchEvent) => {
    if (!startPos || !isDragging) {
      startPos = null
      return
    }

    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - startPos.x
    const deltaY = touch.clientY - startPos.y
    const deltaTime = Date.now() - startPos.timestamp

    // 检查滑动是否有效（距离够大且时间够短）
    const isValidSwipe =
      Math.abs(deltaX) > swipeThreshold ||
      Math.abs(deltaY) > swipeThreshold

    if (!isValidSwipe) {
      startPos = null
      return
    }

    // 判断主要滑动方向
    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)

    if (absX > absY) {
      // 水平滑动
      if (deltaX > 0 && onSwipeRight) {
        onSwipeRight()
      } else if (deltaX < 0 && onSwipeLeft) {
        onSwipeLeft()
      }
    } else {
      // 垂直滑动
      if (deltaY > 0 && onSwipeDown) {
        onSwipeDown()
      } else if (deltaY < 0 && onSwipeUp) {
        onSwipeUp()
      }
    }

    startPos = null
    isDragging = false
  }

  // 添加事件监听
  element.addEventListener('touchstart', handleTouchStart, { passive: !preventDefault })
  element.addEventListener('touchmove', handleTouchMove, { passive: !preventDefault })
  element.addEventListener('touchend', handleTouchEnd)
  element.addEventListener('touchcancel', () => {
    startPos = null
    isDragging = false
  })

  // 返回清理函数
  return () => {
    element.removeEventListener('touchstart', handleTouchStart)
    element.removeEventListener('touchmove', handleTouchMove)
    element.removeEventListener('touchend', handleTouchEnd)
    element.removeEventListener('touchcancel', () => {})
  }
}

/**
 * React Hook: 滑动手势
 */
import { useEffect, RefObject } from 'react'

export function useSwipe<T extends HTMLElement>(
  ref: RefObject<T>,
  options: SwipeGestureOptions
) {
  useEffect(() => {
    const element = ref.current
    if (!element) return

    const cleanup = useSwipeGestures(element, options)
    return cleanup
  }, [ref, options])
}

/**
 * 长按手势检测
 */
export interface LongPressOptions {
  onLongPress: () => void
  delay?: number // 长按延迟时间（毫秒）
  preventDefault?: boolean
}

export function useLongPress(
  element: HTMLElement | null,
  options: LongPressOptions
): () => void {
  if (!element) return () => {}

  const { onLongPress, delay = 500, preventDefault = true } = options
  let timer: ReturnType<typeof setTimeout> | null = null
  let isLongPress = false

  const start = () => {
    isLongPress = false
    timer = setTimeout(() => {
      isLongPress = true
      onLongPress()
    }, delay)
  }

  const cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  const handleTouchStart = (e: TouchEvent) => {
    if (preventDefault) e.preventDefault()
    start()
  }

  const handleTouchEnd = (e: TouchEvent) => {
    if (preventDefault && isLongPress) {
      e.preventDefault()
    }
    cancel()
  }

  const handleTouchMove = () => {
    cancel()
  }

  element.addEventListener('touchstart', handleTouchStart)
  element.addEventListener('touchend', handleTouchEnd)
  element.addEventListener('touchmove', handleTouchMove)

  return () => {
    element.removeEventListener('touchstart', handleTouchStart)
    element.removeEventListener('touchend', handleTouchEnd)
    element.removeEventListener('touchmove', handleTouchMove)
    cancel()
  }
}

/**
 * 双击手势检测
 */
export interface DoubleTapOptions {
  onDoubleTap: () => void
  interval?: number // 两次点击的最大间隔时间（毫秒）
}

export function useDoubleTap(
  element: HTMLElement | null,
  options: DoubleTapOptions
): () => void {
  if (!element) return () => {}

  const { onDoubleTap, interval = 300 } = options
  let lastTap = 0

  const handleTouchEnd = (e: TouchEvent) => {
    const currentTime = Date.now()
    const tapLength = currentTime - lastTap

    if (tapLength < interval && tapLength > 0) {
      onDoubleTap()
      e.preventDefault()
    }

    lastTap = currentTime
  }

  element.addEventListener('touchend', handleTouchEnd)

  return () => {
    element.removeEventListener('touchend', handleTouchEnd)
  }
}

/**
 * 捏合缩放手势检测
 */
export interface PinchZoomOptions {
  onZoomChange: (scale: number) => void
  onZoomEnd?: (scale: number) => void
  minScale?: number
  maxScale?: number
}

export function usePinchZoom(
  element: HTMLElement | null,
  options: PinchZoomOptions
): () => void {
  if (!element) return () => {}

  const { onZoomChange, onZoomEnd, minScale = 0.5, maxScale = 3 } = options
  let initialDistance = 0
  let initialScale = 1
  let currentScale = 1

  const getDistance = (touch1: Touch, touch2: Touch): number => {
    const dx = touch1.clientX - touch2.clientX
    const dy = touch1.clientY - touch2.clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  const handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      initialDistance = getDistance(e.touches[0], e.touches[1])
      initialScale = currentScale
    }
  }

  const handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2 && initialDistance > 0) {
      const currentDistance = getDistance(e.touches[0], e.touches[1])
      const scale = (currentDistance / initialDistance) * initialScale

      // 限制缩放范围
      currentScale = Math.min(Math.max(scale, minScale), maxScale)
      onZoomChange(currentScale)
    }
  }

  const handleTouchEnd = (e: TouchEvent) => {
    if (e.touches.length < 2) {
      initialDistance = 0
      onZoomEnd?.(currentScale)
    }
  }

  element.addEventListener('touchstart', handleTouchStart)
  element.addEventListener('touchmove', handleTouchMove)
  element.addEventListener('touchend', handleTouchEnd)

  return () => {
    element.removeEventListener('touchstart', handleTouchStart)
    element.removeEventListener('touchmove', handleTouchMove)
    element.removeEventListener('touchend', handleTouchEnd)
  }
}

/**
 * 检测设备是否为触摸设备
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    // @ts-ignore
    navigator.msMaxTouchPoints > 0
  )
}

/**
 * 获取设备类型
 */
export type DeviceType = 'mobile' | 'tablet' | 'desktop'

export function getDeviceType(): DeviceType {
  if (typeof window === 'undefined') return 'desktop'

  const width = window.innerWidth

  if (width < 768) return 'mobile'
  if (width < 1024) return 'tablet'
  return 'desktop'
}

/**
 * 监听设备方向变化
 */
export function useOrientationChange(
  callback: (orientation: 'portrait' | 'landscape') => void
): () => void {
  const handle = () => {
    const isPortrait = window.innerHeight > window.innerWidth
    callback(isPortrait ? 'portrait' : 'landscape')
  }

  window.addEventListener('resize', handle)
  window.addEventListener('orientationchange', handle)

  // 初始调用
  handle()

  return () => {
    window.removeEventListener('resize', handle)
    window.removeEventListener('orientationchange', handle)
  }
}
