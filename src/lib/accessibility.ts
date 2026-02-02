/**
 * 可访问性工具 (P2 修复)
 *
 * 提供键盘导航、ARIA 标签、屏幕阅读器支持等功能
 */

// ============================================================================
// 键盘导航管理
// ============================================================================

/**
 * 键盘导航配置
 */
export interface KeyboardNavConfig {
  enableShortcuts: boolean
  enableFocusTrap: boolean
  enableArrowKeyNavigation: boolean
  customShortcuts?: Record<string, string>
}

/**
 * 焦点元素信息
 */
export interface FocusableElement {
  element: HTMLElement
  index: number
  groupId?: string
}

/**
 * 获取页面中所有可聚焦元素
 */
export function getFocusableElements(container: HTMLElement = document.body): HTMLElement[] {
  const focusableSelectors = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
  ]

  return Array.from(container.querySelectorAll(focusableSelectors.join(', '))) as HTMLElement[]
}

/**
 * 在对话框/模态框中捕获焦点
 */
export function trapFocus(container: HTMLElement): () => void {
  const focusableElements = getFocusableElements(container)
  const firstElement = focusableElements[0]
  const lastElement = focusableElements[focusableElements.length - 1]

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return

    if (event.shiftKey) {
      // Shift + Tab - 向前移动焦点
      if (document.activeElement === firstElement) {
        event.preventDefault()
        lastElement?.focus()
      }
    } else {
      // Tab - 向后移动焦点
      if (document.activeElement === lastElement) {
        event.preventDefault()
        firstElement?.focus()
      }
    }
  }

  container.addEventListener('keydown', handleKeyDown)

  // 初始聚焦到第一个元素
  firstElement?.focus()

  // 返回清理函数
  return () => {
    container.removeEventListener('keydown', handleKeyDown)
  }
}

/**
 * 管理焦点历史（用于模态框关闭后恢复焦点）
 */
class FocusHistory {
  private history: HTMLElement[] = []

  push(element: HTMLElement): void {
    this.history.push(element)
  }

  pop(): HTMLElement | null {
    return this.history.pop() || null
  }

  peek(): HTMLElement | null {
    return this.history[this.history.length - 1] || null
  }

  clear(): void {
    this.history = []
  }
}

export const focusHistory = new FocusHistory()

/**
 * 保存当前焦点并设置新焦点
 */
export function saveAndSetFocus(newFocusElement: HTMLElement): () => void {
  const previousFocus = document.activeElement as HTMLElement

  if (previousFocus instanceof HTMLElement) {
    focusHistory.push(previousFocus)
  }

  newFocusElement.focus()

  // 返回恢复函数
  return () => {
    const savedFocus = focusHistory.pop()
    if (savedFocus) {
      savedFocus.focus()
    }
  }
}

// ============================================================================
// ARIA 属性辅助函数
// ============================================================================

/**
 * ARIA 属性接口
 */
export interface AriaAttributes {
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-hidden'?: boolean | 'true' | 'false'
  'aria-expanded'?: boolean | 'true' | 'false'
  'aria-pressed'?: boolean | 'true' | 'false' | 'mixed'
  'aria-checked'?: boolean | 'true' | 'false' | 'mixed'
  'aria-selected'?: boolean | 'true' | 'false'
  'aria-disabled'?: boolean | 'true' | 'false'
  'aria-readonly'?: boolean | 'true' | 'false'
  'aria-required'?: boolean | 'true' | 'false'
  'aria-invalid'?: boolean | 'true' | 'false'
  'aria-live'?: 'polite' | 'assertive' | 'off'
  'aria-atomic'?: boolean | 'true' | 'false'
  'aria-busy'?: boolean | 'true' | 'false'
  'aria-controls'?: string
  'aria-current'?: 'page' | 'step' | 'location' | 'date' | 'time' | 'true' | 'false'
  'aria-modal'?: boolean | 'true' | 'false'
  'aria-orientation'?: 'horizontal' | 'vertical'
  'aria-valuemin'?: number
  'aria-valuemax'?: number
  'aria-valuenow'?: number
  'aria-valuetext'?: string
  'role'?: string
}

/**
 * 设置元素的 ARIA 属性
 */
export function setAriaAttributes(element: HTMLElement, attributes: AriaAttributes): void {
  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== undefined) {
      if (value === false) {
        element.removeAttribute(key)
      } else {
        element.setAttribute(key, String(value))
      }
    }
  })
}

/**
 * 创建可访问的按钮
 */
export function createAccessibleButton(options: {
  label: string
  onClick: () => void
  iconName?: string
  pressed?: boolean
  expanded?: boolean
  disabled?: boolean
  ariaControls?: string
}): HTMLButtonElement {
  const button = document.createElement('button')
  button.textContent = options.label

  const ariaAttrs: AriaAttributes = {
    'aria-label': options.label,
    'aria-pressed': options.pressed,
    'aria-expanded': options.expanded,
    'aria-disabled': options.disabled,
    'aria-controls': options.ariaControls
  }

  setAriaAttributes(button, ariaAttrs)

  if (options.disabled) {
    button.disabled = true
  }

  button.addEventListener('click', options.onClick)

  return button
}

// ============================================================================
// 屏幕阅读器公告
// ============================================================================

/**
 * 创建屏幕阅读器公告区域
 */
export function createAnnouncer(): HTMLElement {
  let announcer = document.getElementById('a11y-announcer')

  if (!announcer) {
    announcer = document.createElement('div')
    announcer.id = 'a11y-announcer'
    announcer.setAttribute('aria-live', 'polite')
    announcer.setAttribute('aria-atomic', 'true')
    announcer.style.cssText = `
      position: absolute;
      left: -10000px;
      width: 1px;
      height: 1px;
      overflow: hidden;
    `
    document.body.appendChild(announcer)
  }

  return announcer
}

/**
 * 向屏幕阅读器发布公告
 */
export function announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
  const announcer = createAnnouncer()
  announcer.setAttribute('aria-live', priority)
  announcer.textContent = ''

  // 使用 setTimeout 确保屏幕阅读器能检测到变化
  setTimeout(() => {
    announcer.textContent = message
  }, 100)
}

/**
 * 公告重要消息
 */
export function announceAssertive(message: string): void {
  announce(message, 'assertive')
}

/**
 * 公告礼貌消息
 */
export function announcePolite(message: string): void {
  announce(message, 'polite')
}

// ============================================================================
// 跳过链接（Skip Links）
// ============================================================================

/**
 * 创建跳过导航链接
 */
export function createSkipLink(targetId: string, label: string = '跳过导航'): HTMLAnchorElement {
  const skipLink = document.createElement('a')
  skipLink.href = `#${targetId}`
  skipLink.textContent = label
  skipLink.className = 'sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[var(--accent)] focus:text-white focus:rounded'
  skipLink.setAttribute('aria-label', label)

  return skipLink
}

/**
 * 初始化页面跳过链接
 */
export function initSkipLinks(): void {
  // 跳过主内容
  const skipToContent = createSkipLink('main-content', '跳到主内容')

  // 跳到导航
  const skipToNav = createSkipLink('navigation', '跳到导航')

  document.body.insertBefore(skipToNav, document.body.firstChild)
  document.body.insertBefore(skipToNav, skipToContent.nextSibling)
}

// ============================================================================
// 焦点可见性
// ============================================================================

/**
 * 添加焦点可见性样式
 */
export function addFocusStyles(): void {
  // 检查是否已添加
  if (document.getElementById('a11y-focus-styles')) return

  const style = document.createElement('style')
  style.id = 'a11y-focus-styles'
  style.textContent = `
    /* 仅在键盘导航时显示焦点环 */
    *:focus:not(:focus-visible) {
      outline: none;
    }

    *:focus-visible {
      outline: 2px solid var(--accent, #667eea);
      outline-offset: 2px;
    }

    /* 隐藏屏幕阅读器专用内容 */
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border-width: 0;
    }

    /* 焦点时可见 */
    .sr-only:focus {
      position: static;
      width: auto;
      height: auto;
      padding: inherit;
      margin: inherit;
      overflow: visible;
      clip: auto;
      white-space: normal;
    }

    /* 减少动画（用户偏好设置） */
    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }

    /* 高对比度模式支持 */
    @media (prefers-contrast: high) {
      :root {
        --border-width: 2px;
      }

      button, a, input, textarea, select {
        border-width: 2px !important;
      }
    }
  `
  document.head.appendChild(style)
}

// ============================================================================
// 颜色对比度检查
// ============================================================================

/**
 * 计算相对亮度（根据 WCAG 2.1 规范）
 */
export function getRelativeLuminance(hexColor: string): number {
  // 移除 # 前缀
  const hex = hexColor.replace('#', '')

  // 转换为 RGB
  const r = parseInt(hex.substr(0, 2), 16) / 255
  const g = parseInt(hex.substr(2, 2), 16) / 255
  const b = parseInt(hex.substr(4, 2), 16) / 255

  // 应用 gamma 校正
  const R = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4)
  const G = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4)
  const B = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4)

  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

/**
 * 计算对比度（WCAG 2.1）
 */
export function getContrastRatio(foreground: string, background: string): number {
  const L1 = getRelativeLuminance(foreground)
  const L2 = getRelativeLuminance(background)

  const lighter = Math.max(L1, L2)
  const darker = Math.min(L1, L2)

  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * 检查颜色对比度是否符合 WCAG 标准
 */
export function checkColorContrast(
  foreground: string,
  background: string,
  level: 'AA' | 'AAA' = 'AA',
  fontSize: 'normal' | 'large' = 'normal'
): { passes: boolean; ratio: number; required: number } {
  const ratio = getContrastRatio(foreground, background)

  let required: number

  if (level === 'AAA') {
    required = fontSize === 'large' ? 4.5 : 7
  } else { // AA
    required = fontSize === 'large' ? 3 : 4.5
  }

  return {
    passes: ratio >= required,
    ratio: Math.round(ratio * 100) / 100,
    required
  }
}

// ============================================================================
// 键盘快捷键管理
// ============================================================================

/**
 * 键盘快捷键注册表
 */
class KeyboardShortcutRegistry {
  private shortcuts: Map<string, Set<() => void>> = new Map()
  private enabled = true

  /**
   * 注册快捷键
   */
  register(keyCombo: string, handler: () => void): () => void {
    if (!this.shortcuts.has(keyCombo)) {
      this.shortcuts.set(keyCombo, new Set())
    }
    this.shortcuts.get(keyCombo)!.add(handler)

    // 返回取消注册函数
    return () => this.unregister(keyCombo, handler)
  }

  /**
   * 取消注册快捷键
   */
  private unregister(keyCombo: string, handler: () => void): void {
    const handlers = this.shortcuts.get(keyCombo)
    if (handlers) {
      handlers.delete(handler)
      if (handlers.size === 0) {
        this.shortcuts.delete(keyCombo)
      }
    }
  }

  /**
   * 处理键盘事件
   */
  handle(event: KeyboardEvent): boolean {
    if (!this.enabled) return false

    const keyCombo = this.getKeyCombo(event)
    const handlers = this.shortcuts.get(keyCombo)

    if (handlers && handlers.size > 0) {
      event.preventDefault()
      handlers.forEach(handler => handler())
      return true
    }

    return false
  }

  /**
   * 获取按键组合字符串
   */
  private getKeyCombo(event: KeyboardEvent): string {
    const parts: string[] = []

    if (event.ctrlKey) parts.push('ctrl')
    if (event.altKey) parts.push('alt')
    if (event.shiftKey) parts.push('shift')
    if (event.metaKey) parts.push('meta')

    parts.push(event.key.toLowerCase())

    return parts.join('+')
  }

  /**
   * 启用快捷键
   */
  enable(): void {
    this.enabled = true
  }

  /**
   * 禁用快捷键
   */
  disable(): void {
    this.enabled = false
  }
}

export const keyboardShortcuts = new KeyboardShortcutRegistry()

/**
 * 初始化全局键盘快捷键
 */
export function initKeyboardShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    // 忽略在输入框中的按键
    const target = e.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return
    }

    keyboardShortcuts.handle(e)
  })
}

// ============================================================================
// 初始化可访问性功能
// ============================================================================

/**
 * 初始化所有可访问性功能
 */
export function initAccessibility(): void {
  // 添加焦点样式
  addFocusStyles()

  // 初始化跳过链接
  initSkipLinks()

  // 初始化键盘快捷键
  initKeyboardShortcuts()

  // 检测用户偏好设置
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  if (prefersReducedMotion.matches) {
    document.documentElement.classList.add('reduce-motion')
  }

  // 监听偏好变化
  prefersReducedMotion.addEventListener('change', (e) => {
    if (e.matches) {
      document.documentElement.classList.add('reduce-motion')
    } else {
      document.documentElement.classList.remove('reduce-motion')
    }
  })
}

// ============================================================================
// React Hook 友好函数
// ============================================================================

/**
 * 为可聚焦元素创建 ref 回调
 */
export function createFocusRef(callback?: (element: HTMLElement | null) => void) {
  return (element: HTMLElement | null) => {
    if (element) {
      element.tabIndex = 0
      callback?.(element)
    }
  }
}

/**
 * 管理模态框焦点
 */
export function useModalFocus(isOpen: boolean) {
  useEffect(() => {
    if (isOpen) {
      // 查找模态框容器
      const modal = document.querySelector('[role="dialog"]') as HTMLElement
      if (modal) {
        const cleanup = trapFocus(modal)
        return cleanup
      }
    }
  }, [isOpen])
}

import { useEffect } from 'react'
