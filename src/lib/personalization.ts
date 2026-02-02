import { Theme } from './store'
import { logger } from './logger'

// ============================================================================
// 个性化定制功能 (P2 修复)
// ============================================================================

// 自定义主题配置
export interface CustomTheme {
  id: string
  name: string
  displayName: string
  colors: {
    background: string
    surface: string
    primary: string
    secondary: string
    accent: string
    text: string
    textSecondary: string
    border: string
    success: string
    warning: string
    error: string
  }
  fonts?: {
    primary: string
    mono: string
  }
  borderRadius?: string
}

// 布局配置
export interface LayoutConfig {
  density: 'comfortable' | 'compact' | 'spacious'
  sidebarPosition: 'left' | 'right' | 'hidden'
  showBookshelfStats: boolean
  showReadingProgress: boolean
  showQuickActions: boolean
  cardSize: 'small' | 'medium' | 'large'
  itemsPerRow: number
}

// 学习偏好配置
export interface LearningPreferences {
  defaultPhaseMode: 'guided' | 'free'
  autoSaveInterval: number // 分钟
  remindReadingTime: boolean
  readingTimeGoal: number // 分钟/天
  remindPractice: boolean
  showMotivationalQuotes: boolean
  completionCelebration: boolean
}

// 快捷键配置
export interface ShortcutConfig {
  toggleSidebar: string
  quickAdd: string
  search: string
  settings: string
  undo: string
  redo: string
}

// 完整的个性化配置
export interface PersonalizationConfig {
  customTheme?: CustomTheme
  layout: LayoutConfig
  learning: LearningPreferences
  shortcuts: ShortcutConfig
  fontSize: 'small' | 'medium' | 'large' | 'extra-large'
  reducedMotion: boolean
  highContrast: boolean
}

// ============================================================================
// 预设主题
// ============================================================================

export const presetThemes: Record<Theme, CustomTheme> = {
  light: {
    id: 'light',
    name: 'light',
    displayName: 'Light',
    colors: {
      background: '#ffffff',
      surface: '#f5f5f5',
      primary: '#1976d2',
      secondary: '#9c27b0',
      accent: '#ff4081',
      text: '#212121',
      textSecondary: '#757575',
      border: '#e0e0e0',
      success: '#4caf50',
      warning: '#ff9800',
      error: '#f44336'
    }
  },
  dark: {
    id: 'dark',
    name: 'dark',
    displayName: 'Dark',
    colors: {
      background: '#121212',
      surface: '#1e1e1e',
      primary: '#90caf9',
      secondary: '#ce93d8',
      accent: '#f48fb1',
      text: '#ffffff',
      textSecondary: '#b0bec5',
      border: '#333333',
      success: '#81c784',
      warning: '#ffb74d',
      error: '#e57373'
    }
  },
  cyber: {
    id: 'cyber',
    name: 'cyber',
    displayName: 'Cyber',
    colors: {
      background: '#0a0e27',
      surface: '#1a1f3a',
      primary: '#00d4ff',
      secondary: '#7b2cbf',
      accent: '#ff006e',
      text: '#e0e6ed',
      textSecondary: '#94a3b8',
      border: '#2d3561',
      success: '#00ff88',
      warning: '#ffaa00',
      error: '#ff3366'
    },
    borderRadius: '12px'
  }
}

// ============================================================================
// 默认配置
// ============================================================================

export const defaultLayoutConfig: LayoutConfig = {
  density: 'comfortable',
  sidebarPosition: 'hidden',
  showBookshelfStats: true,
  showReadingProgress: true,
  showQuickActions: true,
  cardSize: 'medium',
  itemsPerRow: 4
}

export const defaultLearningPreferences: LearningPreferences = {
  defaultPhaseMode: 'guided',
  autoSaveInterval: 1,
  remindReadingTime: true,
  readingTimeGoal: 30,
  remindPractice: true,
  showMotivationalQuotes: true,
  completionCelebration: true
}

export const defaultShortcuts: ShortcutConfig = {
  toggleSidebar: 'Mod+B',
  quickAdd: 'Mod+N',
  search: 'Mod+K',
  settings: 'Mod+,',
  undo: 'Mod+Z',
  redo: 'Mod+Shift+Z'
}

export const defaultPersonalizationConfig: PersonalizationConfig = {
  layout: defaultLayoutConfig,
  learning: defaultLearningPreferences,
  shortcuts: defaultShortcuts,
  fontSize: 'medium',
  reducedMotion: false,
  highContrast: false
}

// ============================================================================
// 主题应用
// ============================================================================

/**
 * 应用主题到 DOM
 */
export function applyTheme(theme: CustomTheme | Theme): void {
  const themeConfig = typeof theme === 'string' ? presetThemes[theme] : theme
  if (!themeConfig) return

  const root = document.documentElement
  const colors = themeConfig.colors

  // 设置 CSS 变量
  root.style.setProperty('--bg-primary', colors.background)
  root.style.setProperty('--bg-secondary', colors.surface)
  root.style.setProperty('--primary', colors.primary)
  root.style.setProperty('--secondary', colors.secondary)
  root.style.setProperty('--accent', colors.accent)
  root.style.setProperty('--text-primary', colors.text)
  root.style.setProperty('--text-secondary', colors.textSecondary)
  root.style.setProperty('--border', colors.border)
  root.style.setProperty('--success', colors.success)
  root.style.setProperty('--warning', colors.warning)
  root.style.setProperty('--error', colors.error)

  // 设置其他样式
  if (themeConfig.borderRadius) {
    root.style.setProperty('--radius', themeConfig.borderRadius)
  }

  if (themeConfig.fonts) {
    root.style.setProperty('--font-primary', themeConfig.fonts.primary)
    root.style.setProperty('--font-mono', themeConfig.fonts.mono)
  }
}

/**
 * 创建自定义主题
 */
export function createCustomTheme(baseTheme: Theme, customizations: Partial<CustomTheme>): CustomTheme {
  const base = presetThemes[baseTheme]
  return {
    ...base,
    id: `custom-${Date.now()}`,
    name: `custom-${Date.now()}`,
    displayName: customizations.displayName || 'Custom Theme',
    colors: {
      ...base.colors,
      ...customizations.colors
    },
    fonts: customizations.fonts || base.fonts,
    borderRadius: customizations.borderRadius || base.borderRadius
  }
}

/**
 * 验证主题颜色
 */
export function validateThemeColor(color: string): boolean {
  return /^#([0-9A-F]{3}){1,2}$/i.test(color) ||
    /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i.test(color) ||
    /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)$/i.test(color)
}

/**
 * 生成配色方案
 */
export function generateColorScheme(baseColor: string): CustomTheme['colors'] {
  // 简化版：基于主色生成配色
  const hex = baseColor.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)

  // 计算亮度
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  const isDark = brightness < 128

  return {
    background: isDark ? '#121212' : '#ffffff',
    surface: isDark ? '#1e1e1e' : '#f5f5f5',
    primary: baseColor,
    secondary: adjustColor(baseColor, 30),
    accent: adjustColor(baseColor, 60),
    text: isDark ? '#ffffff' : '#212121',
    textSecondary: isDark ? '#b0bec5' : '#757575',
    border: isDark ? '#333333' : '#e0e0e0',
    success: '#4caf50',
    warning: '#ff9800',
    error: '#f44336'
  }
}

/**
 * 调整颜色亮度
 */
function adjustColor(hex: string, amount: number): string {
  let color = hex.replace('#', '')
  let r = parseInt(color.substr(0, 2), 16)
  let g = parseInt(color.substr(2, 2), 16)
  let b = parseInt(color.substr(4, 2), 16)

  r = Math.max(0, Math.min(255, r + amount))
  g = Math.max(0, Math.min(255, g + amount))
  b = Math.max(0, Math.min(255, b + amount))

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

// ============================================================================
// 字体大小
// ============================================================================

export const fontSizes = {
  'small': { base: '14px', multiplier: 0.875 },
  'medium': { base: '16px', multiplier: 1 },
  'large': { base: '18px', multiplier: 1.125 },
  'extra-large': { base: '20px', multiplier: 1.25 }
}

export function applyFontSize(size: keyof typeof fontSizes): void {
  const config = fontSizes[size]
  const root = document.documentElement
  root.style.setProperty('--font-size-base', config.base)
  root.style.setProperty('--font-size-multiplier', config.multiplier.toString())
}

// ============================================================================
// 存储和加载个性化配置
// ============================================================================

const PERSONALIZATION_KEY = 'feynman-personalization'

export function savePersonalization(config: PersonalizationConfig): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(PERSONALIZATION_KEY, JSON.stringify(config))
}

export function loadPersonalization(): PersonalizationConfig {
  if (typeof window === 'undefined') return defaultPersonalizationConfig

  const saved = localStorage.getItem(PERSONALIZATION_KEY)
  if (saved) {
    try {
      return { ...defaultPersonalizationConfig, ...JSON.parse(saved) }
    } catch (e) {
      logger.error('Failed to parse personalization config:', e)
    }
  }
  return defaultPersonalizationConfig
}

export function resetPersonalization(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(PERSONALIZATION_KEY)
  // 重置为默认主题
  applyTheme('cyber')
  applyFontSize('medium')
}

// ============================================================================
// 辅助功能
// ============================================================================

export function applyAccessibilitySettings(config: Pick<PersonalizationConfig, 'reducedMotion' | 'highContrast' | 'fontSize'>): void {
  const root = document.documentElement

  // 减少动画
  if (config.reducedMotion) {
    root.style.setProperty('--animation-duration', '0.01ms')
    root.classList.add('reduce-motion')
  } else {
    root.style.removeProperty('--animation-duration')
    root.classList.remove('reduce-motion')
  }

  // 高对比度
  if (config.highContrast) {
    root.classList.add('high-contrast')
    root.style.setProperty('--contrast', '1.2')
  } else {
    root.classList.remove('high-contrast')
    root.style.removeProperty('--contrast')
  }

  // 字体大小
  applyFontSize(config.fontSize)
}

// ============================================================================
// 快捷键处理
// ============================================================================

export interface ShortcutAction {
  id: string
  key: string
  description: string
  handler: () => void
}

export function parseShortcut(shortcut: string): { key: string; ctrl: boolean; shift: boolean; alt: boolean; meta: boolean } {
  const parts = shortcut.split('+')
  return {
    key: parts[parts.length - 1].toLowerCase(),
    ctrl: parts.includes('Ctrl') || parts.includes('Mod'),
    shift: parts.includes('Shift'),
    alt: parts.includes('Alt'),
    meta: parts.includes('Meta') || parts.includes('Mod')
  }
}

export function matchShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut)
  const key = event.key.toLowerCase()

  return (
    key === parsed.key &&
    !!event.ctrlKey === parsed.ctrl &&
    !!event.shiftKey === parsed.shift &&
    !!event.altKey === parsed.alt &&
    !!event.metaKey === parsed.meta
  )
}

export function createShortcutHandler(shortcuts: Record<string, () => void>, config: ShortcutConfig) {
  return (event: KeyboardEvent) => {
    // 检查是否在输入框中
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return
    }

    // 检查快捷键
    for (const [action, handler] of Object.entries(shortcuts)) {
      const shortcut = config[action as keyof ShortcutConfig]
      if (shortcut && matchShortcut(event, shortcut)) {
        event.preventDefault()
        handler()
        return
      }
    }
  }
}
