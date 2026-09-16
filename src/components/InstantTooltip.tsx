'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

interface TooltipState {
  anchor: HTMLElement
  text: string
  preferredPlacement: TooltipPlacement
}

interface TooltipPosition {
  left: number
  top: number
  placement: TooltipPlacement
}

const VIEWPORT_PADDING = 8
const ANCHOR_GAP = 8
const VALID_PLACEMENTS: TooltipPlacement[] = ['top', 'bottom', 'left', 'right']

function findTooltipTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null
  return target.closest<HTMLElement>('[data-tip]')
}

function readTooltipText(target: HTMLElement): string {
  return target.dataset.tip?.trim() || ''
}

function readPreferredPlacement(target: HTMLElement): TooltipPlacement {
  const placement = target.dataset.tipPlacement
  return VALID_PLACEMENTS.includes(placement as TooltipPlacement)
    ? placement as TooltipPlacement
    : 'top'
}

function isKeyboardFocus(target: HTMLElement): boolean {
  try {
    return target.matches(':focus-visible')
  } catch {
    return true
  }
}

function fallbackPlacements(preferred: TooltipPlacement): TooltipPlacement[] {
  if (preferred === 'top' || preferred === 'bottom') {
    return preferred === 'top' ? ['top', 'bottom', 'right', 'left'] : ['bottom', 'top', 'right', 'left']
  }
  return preferred === 'left' ? ['left', 'right', 'top', 'bottom'] : ['right', 'left', 'top', 'bottom']
}

function calculatePosition(
  anchor: HTMLElement,
  preferredPlacement: TooltipPlacement,
  tooltipWidth: number,
  tooltipHeight: number
): TooltipPosition {
  const anchorRect = anchor.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const room = {
    top: anchorRect.top - ANCHOR_GAP - tooltipHeight,
    bottom: viewportHeight - anchorRect.bottom - ANCHOR_GAP - tooltipHeight,
    left: anchorRect.left - ANCHOR_GAP - tooltipWidth,
    right: viewportWidth - anchorRect.right - ANCHOR_GAP - tooltipWidth,
  }
  const placement = fallbackPlacements(preferredPlacement).find(candidate => room[candidate] >= VIEWPORT_PADDING)
    ?? preferredPlacement

  let left = anchorRect.left + anchorRect.width / 2 - tooltipWidth / 2
  let top = anchorRect.top - ANCHOR_GAP - tooltipHeight

  if (placement === 'bottom') {
    top = anchorRect.bottom + ANCHOR_GAP
  } else if (placement === 'left') {
    left = anchorRect.left - ANCHOR_GAP - tooltipWidth
    top = anchorRect.top + anchorRect.height / 2 - tooltipHeight / 2
  } else if (placement === 'right') {
    left = anchorRect.right + ANCHOR_GAP
    top = anchorRect.top + anchorRect.height / 2 - tooltipHeight / 2
  }

  const maxLeft = Math.max(VIEWPORT_PADDING, viewportWidth - VIEWPORT_PADDING - tooltipWidth)
  const maxTop = Math.max(VIEWPORT_PADDING, viewportHeight - VIEWPORT_PADDING - tooltipHeight)

  return {
    left: Math.min(Math.max(VIEWPORT_PADDING, left), maxLeft),
    top: Math.min(Math.max(VIEWPORT_PADDING, top), maxTop),
    placement,
  }
}

export default function InstantTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [position, setPosition] = useState<TooltipPosition | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const activeAnchorRef = useRef<HTMLElement | null>(null)
  const suppressedAnchorRef = useRef<HTMLElement | null>(null)

  const showTooltip = useCallback((anchor: HTMLElement) => {
    const text = readTooltipText(anchor)
    if (!text) return
    activeAnchorRef.current = anchor
    setTooltip(current => {
      if (current?.anchor === anchor && current.text === text) return current
      return { anchor, text, preferredPlacement: readPreferredPlacement(anchor) }
    })
  }, [])

  const hideTooltip = useCallback(() => {
    activeAnchorRef.current = null
    setTooltip(null)
    setPosition(null)
  }, [])

  useEffect(() => {
    const resolveTarget = (event: PointerEvent): HTMLElement | null => {
      const direct = findTooltipTarget(event.target)
      if (direct) return direct
      if (typeof document.elementFromPoint !== 'function') return null
      return findTooltipTarget(document.elementFromPoint(event.clientX, event.clientY))
    }

    const revealTarget = (target: HTMLElement | null) => {
      const suppressed = suppressedAnchorRef.current
      if (suppressed && suppressed !== target) suppressedAnchorRef.current = null
      if (!target) {
        if (activeAnchorRef.current) hideTooltip()
        return
      }
      if (target === suppressedAnchorRef.current) {
        if (activeAnchorRef.current === target) hideTooltip()
        return
      }
      showTooltip(target)
    }

    const handlePointerOver = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      revealTarget(resolveTarget(event))
    }

    // 禁用控件可能吞掉指针事件，所以每次移动都用命中测试兜底。
    const handlePointerMove = handlePointerOver

    const handlePointerOut = (event: PointerEvent) => {
      if (event.relatedTarget) return
      hideTooltip()
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = resolveTarget(event)
      if (target) suppressedAnchorRef.current = target
      if (activeAnchorRef.current) hideTooltip()
    }

    const handleFocusIn = (event: FocusEvent) => {
      const target = findTooltipTarget(event.target)
      if (target && isKeyboardFocus(target)) showTooltip(target)
    }

    const handleFocusOut = (event: FocusEvent) => {
      const target = findTooltipTarget(event.target)
      if (!target) return
      const relatedTarget = event.relatedTarget
      if (relatedTarget instanceof Node && target.contains(relatedTarget)) return
      hideTooltip()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hideTooltip()
    }

    document.addEventListener('pointerover', handlePointerOver)
    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerout', handlePointerOut)
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', hideTooltip)
    window.addEventListener('scroll', hideTooltip, true)

    return () => {
      document.removeEventListener('pointerover', handlePointerOver)
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerout', handlePointerOut)
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', hideTooltip)
      window.removeEventListener('scroll', hideTooltip, true)
    }
  }, [hideTooltip, showTooltip])

  useLayoutEffect(() => {
    if (!tooltip || !tooltipRef.current) return

    const updatePosition = () => {
      if (!tooltipRef.current) return
      const rect = tooltipRef.current.getBoundingClientRect()
      setPosition(calculatePosition(
        tooltip.anchor,
        tooltip.preferredPlacement,
        rect.width,
        rect.height
      ))
    }

    updatePosition()
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updatePosition)
    resizeObserver?.observe(tooltip.anchor)
    resizeObserver?.observe(tooltipRef.current)

    return () => resizeObserver?.disconnect()
  }, [tooltip])

  if (!tooltip || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={tooltipRef}
      role="tooltip"
      className="instant-tooltip"
      data-placement={position?.placement ?? tooltip.preferredPlacement}
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {tooltip.text}
    </div>,
    document.body
  )
}
