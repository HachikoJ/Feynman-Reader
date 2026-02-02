/**
 * 插件系统 (P3 修复)
 *
 * 允许用户和开发者扩展应用功能
 */

import { logger } from './logger'

// ============================================================================
// 插件类型定义
// ============================================================================

/**
 * 插件版本
 */
export interface PluginVersion {
  major: number
  minor: number
  patch: number
}

/**
 * 插件元数据
 */
export interface PluginMetadata {
  id: string
  name: string
  version: PluginVersion
  author: string
  description: string
  icon?: string
  homepage?: string
  repository?: string
  license?: string
  keywords?: string[]
  feynmanVersion?: string // 兼容的应用版本
}

/**
 * 插件生命周期钩子
 */
export interface PluginHooks {
  // 应用启动时
  onAppStart?: () => void | Promise<void>

  // 书籍相关
  onBookAdd?: (book: any) => void | Promise<void>
  onBookUpdate?: (book: any) => void | Promise<void>
  onBookDelete?: (bookId: string) => void | Promise<void>

  // 学习相关
  onPhaseComplete?: (bookId: string, phase: string) => void | Promise<void>
  onPracticeSubmit?: (bookId: string, practice: any) => void | Promise<void>

  // UI 扩展点
  onBookshelfRender?: () => React.ComponentType | null
  onReadingViewRender?: (book: any) => React.ComponentType | null
  onSettingsRender?: () => React.ComponentType | null

  // 数据导出
  onExport?: (format: string, data: any) => any | Promise<any>

  // 自定义命令
  onCommand?: (command: string, ...args: any[]) => any | Promise<any>
}

/**
 * 插件 API
 */
export interface PluginAPI {
  // 数据访问
  data: {
    getBooks: () => any[]
    getBook: (id: string) => any | undefined
    addBook: (book: any) => any
    updateBook: (id: string, updates: any) => void
    deleteBook: (id: string) => void
  }

  // 设置访问
  settings: {
    get: () => any
    set: (settings: any) => void
  }

  // UI 工具
  ui: {
    toast: (message: string, type?: 'success' | 'error' | 'info') => void
    confirm: (message: string) => boolean
    prompt: (message: string) => string | null
  }

  // 通知
  notify: {
    send: (event: string, data?: any) => void
    on: (event: string, handler: (data?: any) => void) => () => void
  }

  // 存储插件私有数据
  storage: {
    get: (key: string) => any
    set: (key: string, value: any) => void
    remove: (key: string) => void
  }
}

/**
 * 插件定义
 */
export interface Plugin {
  metadata: PluginMetadata
  hooks: PluginHooks
  activate?: (api: PluginAPI) => void | Promise<void>
  deactivate?: () => void | Promise<void>
}

// ============================================================================
// 插件管理器
// ============================================================================

class PluginManager {
  private plugins: Map<string, Plugin> = new Map()
  private activePlugins: Set<string> = new Set()
  private pluginData: Map<string, Map<string, any>> = new Map()

  /**
   * 注册插件
   */
  register(plugin: Plugin): void {
    this.plugins.set(plugin.metadata.id, plugin)
    this.pluginData.set(plugin.metadata.id, new Map())
  }

  /**
   * 注销插件
   */
  unregister(pluginId: string): void {
    const plugin = this.plugins.get(pluginId)
    if (plugin && this.activePlugins.has(pluginId)) {
      this.deactivate(pluginId)
    }
    this.plugins.delete(pluginId)
    this.pluginData.delete(pluginId)
  }

  /**
   * 激活插件
   */
  async activate(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) return false

    if (this.activePlugins.has(pluginId)) return true

    try {
      const api = this.createAPI(pluginId)
      if (plugin.activate) {
        await plugin.activate(api)
      }
      this.activePlugins.add(pluginId)
      this.saveActivePlugins()
      return true
    } catch (e) {
      logger.error(`Failed to activate plugin ${pluginId}:`, e)
      return false
    }
  }

  /**
   * 停用插件
   */
  async deactivate(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId)
    if (!plugin || !this.activePlugins.has(pluginId)) return false

    try {
      if (plugin.deactivate) {
        await plugin.deactivate()
      }
      this.activePlugins.delete(pluginId)
      this.saveActivePlugins()
      return true
    } catch (e) {
      logger.error(`Failed to deactivate plugin ${pluginId}:`, e)
      return false
    }
  }

  /**
   * 检查插件是否已激活
   */
  isActive(pluginId: string): boolean {
    return this.activePlugins.has(pluginId)
  }

  /**
   * 获取所有已注册插件
   */
  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values())
  }

  /**
   * 获取激活的插件
   */
  getActivePlugins(): Plugin[] {
    return Array.from(this.activePlugins)
      .map(id => this.plugins.get(id))
      .filter((p): p is Plugin => p !== undefined)
  }

  /**
   * 创建插件 API
   */
  private createAPI(pluginId: string): PluginAPI {
    const { getBooks, getBook, addBook, updateBook, deleteBook } = require('../lib/store')
    const { getSettings, saveSettings } = require('../lib/store')

    return {
      data: {
        getBooks,
        getBook,
        addBook,
        updateBook,
        deleteBook
      },
      settings: {
        get: getSettings,
        set: saveSettings
      },
      ui: {
        toast: (message: string, type: 'success' | 'error' | 'info' = 'success') => {
          // 触发 toast 通知
          window.dispatchEvent(new CustomEvent('plugin-toast', {
            detail: { message, type }
          }))
        },
        confirm: (message: string) => {
          return window.confirm(message)
        },
        prompt: (message: string) => {
          return window.prompt(message)
        }
      },
      notify: {
        send: (event: string, data?: any) => {
          window.dispatchEvent(new CustomEvent(`plugin-${event}`, {
            detail: data
          }))
        },
        on: (event: string, handler: (data?: any) => void) => {
          const listener = (e: any) => handler(e.detail)
          window.addEventListener(`plugin-${event}`, listener)
          return () => window.removeEventListener(`plugin-${event}`, listener)
        }
      },
      storage: {
        get: (key: string) => {
          const data = this.pluginData.get(pluginId)
          return data?.get(key)
        },
        set: (key: string, value: any) => {
          const data = this.pluginData.get(pluginId)
          if (data) {
            data.set(key, value)
            this.savePluginData(pluginId)
          }
        },
        remove: (key: string) => {
          const data = this.pluginData.get(pluginId)
          if (data) {
            data.delete(key)
            this.savePluginData(pluginId)
          }
        }
      }
    }
  }

  /**
   * 触发钩子
   */
  async triggerHook<T = any>(
    hookName: keyof PluginHooks,
    ...args: any[]
  ): Promise<T[]> {
    const results: T[] = []

    const activePluginIds = Array.from(this.activePlugins)
    for (const pluginId of activePluginIds) {
      const plugin = this.plugins.get(pluginId)
      if (plugin?.hooks[hookName]) {
        try {
          const hookFn = plugin.hooks[hookName]!
          const result = await (hookFn as (...args: any[]) => any)(...args)
          if (result !== undefined) {
            results.push(result)
          }
        } catch (e) {
          logger.error(`Plugin ${pluginId} hook ${hookName} error:`, e)
        }
      }
    }

    return results
  }

  /**
   * 加载已保存的激活插件列表
   */
  private loadActivePlugins(): void {
    const saved = localStorage.getItem('feynman-active-plugins')
    if (saved) {
      try {
        const active = JSON.parse(saved) as string[]
        active.forEach(id => this.activePlugins.add(id))
      } catch (e) {
        logger.error('Failed to load active plugins:', e)
      }
    }
  }

  /**
   * 保存激活插件列表
   */
  private saveActivePlugins(): void {
    localStorage.setItem(
      'feynman-active-plugins',
      JSON.stringify(Array.from(this.activePlugins))
    )
  }

  /**
   * 保存插件数据
   */
  private savePluginData(pluginId: string): void {
    const data = this.pluginData.get(pluginId)
    if (data) {
      localStorage.setItem(
        `feynman-plugin-data-${pluginId}`,
        JSON.stringify(Array.from(data.entries()))
      )
    }
  }

  /**
   * 加载插件数据
   */
  private loadPluginData(pluginId: string): void {
    const saved = localStorage.getItem(`feynman-plugin-data-${pluginId}`)
    if (saved) {
      try {
        const data = JSON.parse(saved) as [string, any][]
        this.pluginData.set(pluginId, new Map(data))
      } catch (e) {
        logger.error(`Failed to load plugin data for ${pluginId}:`, e)
      }
    }
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    this.loadActivePlugins()

    // 触发所有激活插件的 onAppStart 钩子
    await this.triggerHook('onAppStart')
  }
}

// 单例实例
const pluginManager = new PluginManager()

// ============================================================================
// 内置插件示例
// ============================================================================

/**
 * 示例插件：学习时长统计
 */
const studyTimePlugin: Plugin = {
  metadata: {
    id: 'study-time-tracker',
    name: '学习时长统计',
    version: { major: 1, minor: 0, patch: 0 },
    author: 'Feynman Reading',
    description: '自动统计每日学习时长',
    icon: '⏱️'
  },
  hooks: {
    onBookAdd: (book) => {
      logger.debug('[StudyTimeTracker] Book added:', book.name)
    },
    onPracticeSubmit: (bookId, practice) => {
      // 记录学习时长
      const today = new Date().toISOString().split('T')[0]
      const key = `study-time-${today}`
      const current = localStorage.getItem(key)
      const minutes = parseInt(current || '0') + 25 // 假设每次实践25分钟
      localStorage.setItem(key, minutes.toString())
    }
  }
}

/**
 * 示例插件：每日名言
 */
const dailyQuotePlugin: Plugin = {
  metadata: {
    id: 'daily-quote',
    name: '每日学习名言',
    version: { major: 1, minor: 0, patch: 0 },
    author: 'Feynman Reading',
    description: '每次打开应用显示学习名言',
    icon: '💬'
  },
  hooks: {
    onAppStart: () => {
      const quotes = [
        '凡我不能创造的，我就不能理解。 - 费曼',
        '知道事物的名字和知道事物的区别，就像知道鱼的单词和知道鱼的味道的区别。 - 费曼',
        '如果你不能简单地解释它，你就没有真正理解它。 - 费曼',
        '学习是一个发现的过程，而不仅仅是记忆。'
      ]
      const quote = quotes[Math.floor(Math.random() * quotes.length)]
      localStorage.setItem('daily-quote', quote)
    }
  }
}

// ============================================================================
// 插件开发者 API
// ============================================================================

/**
 * 创建插件
 */
export function createPlugin(metadata: PluginMetadata['id'], config: {
  name: string
  version: string
  author: string
  description: string
  hooks?: PluginHooks
  activate?: (api: PluginAPI) => void
  deactivate?: () => void
}): Plugin {
  const [major, minor, patch] = config.version.split('.').map(Number)

  return {
    metadata: {
      id: metadata,
      name: config.name,
      version: { major, minor, patch },
      author: config.author,
      description: config.description
    },
    hooks: config.hooks || {},
    activate: config.activate,
    deactivate: config.deactivate
  }
}

/**
 * 注册插件
 */
export function registerPlugin(plugin: Plugin): void {
  pluginManager.register(plugin)
}

/**
 * 激活插件
 */
export async function enablePlugin(pluginId: string): Promise<boolean> {
  return await pluginManager.activate(pluginId)
}

/**
 * 停用插件
 */
export async function disablePlugin(pluginId: string): Promise<boolean> {
  return await pluginManager.deactivate(pluginId)
}

/**
 * 获取所有插件
 */
export function getAllPlugins(): Plugin[] {
  return pluginManager.getAllPlugins()
}

/**
 * 获取激活的插件
 */
export function getActivePlugins(): Plugin[] {
  return pluginManager.getActivePlugins()
}

/**
 * 触发插件钩子
 */
export async function triggerPluginHook<T = any>(
  hookName: keyof PluginHooks,
  ...args: any[]
): Promise<T[]> {
  return await pluginManager.triggerHook(hookName, ...args)
}

/**
 * 初始化插件系统
 */
export async function initializePlugins(): Promise<void> {
  // 注册内置插件
  pluginManager.register(studyTimePlugin)
  pluginManager.register(dailyQuotePlugin)

  // 初始化管理器
  await pluginManager.initialize()
}

// ============================================================================
// 插件市场（示例）
// ============================================================================

export const builtinPlugins = [
  {
    id: 'study-time-tracker',
    name: '学习时长统计',
    description: '自动统计每日学习时长',
    installed: true,
    builtin: true
  },
  {
    id: 'daily-quote',
    name: '每日学习名言',
    description: '每次打开应用显示学习名言',
    installed: true,
    builtin: true
  },
  {
    id: 'export-evernote',
    name: 'Evernote 导出',
    description: '将笔记导出到 Evernote',
    installed: false,
    builtin: false
  },
  {
    id: 'kindle-sync',
    name: 'Kindle 同步',
    description: '同步 Kindle 阅读进度',
    installed: false,
    builtin: false
  }
]
