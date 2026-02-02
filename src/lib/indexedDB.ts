/**
 * IndexedDB 数据存储层
 * 解决 LocalStorage 容量限制（5-10MB）和同步阻塞问题
 *
 * 特性：
 * - 异步操作，不阻塞主线程
 * - 大容量存储（通常 50MB+）
 * - 支持二进制数据
 * - 索引查询支持
 * - 数据压缩
 */

import { logger } from './logger'

// ============================================================================
// 类型定义
// ============================================================================

export type Theme = 'dark' | 'light' | 'cyber'
export type BookStatus = 'unread' | 'reading' | 'finished'
export type Language = 'zh' | 'en'

export interface NoteRecord {
  id: string
  type: 'note' | 'teaching'
  content: string
  aiReview?: string
  phaseId?: string
  createdAt: number
}

export interface PracticeRecord {
  id: string
  bookId: string
  content: string
  aiReview: string
  scores: {
    accuracy: number
    completeness: number
    clarity: number
    overall: number
  }
  passed: boolean
  createdAt: number
}

export type PersonaType = 'elementary' | 'college' | 'professional' | 'scientist' | 'entrepreneur' | 'teacher' | 'investor' | 'user' | 'competitor' | 'nitpicker'

export interface PersonaQuestion {
  persona: PersonaType
  personaName: string
  question: string
  userAnswer?: string
  answeredAt?: number
  aiReview?: string
  score?: number
  passed?: boolean
  reviewedAt?: number
}

export interface QAPracticeRecord {
  id: string
  bookId: string
  questions: PersonaQuestion[]
  allPassed: boolean
  createdAt: number
  updatedAt: number
}

export interface BookTag {
  name: string
  category: string
}

export interface ReadingProgress {
  currentPage: number
  totalPages: number
  percentage: number
}

export interface Book {
  id: string
  name: string
  author?: string
  cover?: string
  description?: string
  tags?: BookTag[]
  documentContent?: string
  status: BookStatus
  currentPhase: number
  noteRecords: NoteRecord[]
  responses: Record<string, string>
  practiceRecords: PracticeRecord[]
  qaPracticeRecords: QAPracticeRecord[]
  recommendations?: string
  readingProgress?: ReadingProgress
  bestScore: number
  createdAt: number
  updatedAt: number
}

export interface CustomQuote {
  text: string
  author: string
  isPreset?: boolean
}

export interface AppSettings {
  apiKey: string
  language: Language
  theme: Theme
  hideApiKeyAlert: boolean
  quotes: CustomQuote[]
  quotesInitialized?: boolean
}

export interface ExportData {
  version: number
  exportDate: number
  settings: AppSettings
  books: Book[]
}

// ============================================================================
// 数据库配置
// ============================================================================

const DB_NAME = 'FeynmanReadingDB'
const DB_VERSION = 1
const STORE_SETTINGS = 'settings'
const STORE_BOOKS = 'books'
const STORE_METADATA = 'metadata'

// 数据版本号（用于迁移）
export const DATA_VERSION = 2

// ============================================================================
// IndexedDB 核心类
// ============================================================================

class IndexedDBHelper {
  private db: IDBDatabase | null = null
  private initPromise: Promise<IDBDatabase> | null = null

  /**
   * 初始化数据库连接
   */
  async init(): Promise<IDBDatabase> {
    // SSR 环境检查
    if (typeof window === 'undefined') {
      throw new Error('IndexedDB is not available in SSR environment')
    }

    const idb = (window as any).indexedDB
    if (!idb) {
      throw new Error('IndexedDB is not supported in this browser')
    }

    if (this.db) return this.db
    if (this.initPromise) return this.initPromise

    this.initPromise = new Promise((resolve, reject) => {
      const request = idb.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        logger.error('[IndexedDB] 打开数据库失败:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        logger.debug('[IndexedDB] 数据库打开成功')
        resolve(request.result as IDBDatabase)
      }

      request.onupgradeneeded = (event: Event) => {
        const db = (event.target as any).result
        this.createSchema(db)
      }
    })

    return this.initPromise
  }

  /**
   * 创建数据库结构
   */
  private createSchema(db: IDBDatabase): void {
    logger.debug('[IndexedDB] 创建数据库结构, version:', db.version)

    // 设置存储
    if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
      const settingsStore = db.createObjectStore(STORE_SETTINGS, { keyPath: 'id' })
      settingsStore.createIndex('id', 'id', { unique: true })
    }

    // 书籍存储
    if (!db.objectStoreNames.contains(STORE_BOOKS)) {
      const booksStore = db.createObjectStore(STORE_BOOKS, { keyPath: 'id' })
      booksStore.createIndex('id', 'id', { unique: true })
      booksStore.createIndex('status', 'status', { unique: false })
      booksStore.createIndex('name', 'name', { unique: false })
      booksStore.createIndex('author', 'author', { unique: false })
      booksStore.createIndex('createdAt', 'createdAt', { unique: false })
      booksStore.createIndex('updatedAt', 'updatedAt', { unique: false })
    }

    // 元数据存储
    if (!db.objectStoreNames.contains(STORE_METADATA)) {
      const metadataStore = db.createObjectStore(STORE_METADATA, { keyPath: 'key' })
      metadataStore.createIndex('key', 'key', { unique: true })
    }
  }

  /**
   * 获取事务
   */
  private async getTransaction(storeName: string, mode: IDBTransactionMode = 'readonly'): Promise<IDBTransaction> {
    const db = await this.init()
    return db.transaction(storeName, mode)
  }

  /**
   * 获取存储对象
   */
  private async getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
    const transaction = await this.getTransaction(storeName, mode)
    return transaction.objectStore(storeName)
  }

  // ============================================================================
  // 通用 CRUD 操作
  // ============================================================================

  /**
   * 获取单条记录
   */
  async get<T>(storeName: string, key: string): Promise<T | null> {
    try {
      const store = await this.getStore(storeName, 'readonly')
      return new Promise((resolve, reject) => {
        const request = store.get(key)
        request.onsuccess = () => resolve(request.result || null)
        request.onerror = () => reject(request.error)
      })
    } catch (error) {
      logger.error(`[IndexedDB] 获取记录失败 [${storeName}]:`, error)
      return null
    }
  }

  /**
   * 获取所有记录
   */
  async getAll<T>(storeName: string): Promise<T[]> {
    try {
      const store = await this.getStore(storeName, 'readonly')
      return new Promise((resolve, reject) => {
        const request = store.getAll()
        request.onsuccess = () => resolve(request.result || [])
        request.onerror = () => reject(request.error)
      })
    } catch (error) {
      logger.error(`[IndexedDB] 获取所有记录失败 [${storeName}]:`, error)
      return []
    }
  }

  /**
   * 添加或更新记录
   */
  async put<T>(storeName: string, value: T): Promise<boolean> {
    try {
      const store = await this.getStore(storeName, 'readwrite')
      return new Promise((resolve, reject) => {
        const request = store.put(value)
        request.onsuccess = () => resolve(true)
        request.onerror = () => {
          logger.error(`[IndexedDB] 保存记录失败 [${storeName}]:`, request.error)
          reject(request.error)
        }
      })
    } catch (error) {
      logger.error(`[IndexedDB] 保存记录失败 [${storeName}]:`, error)
      return false
    }
  }

  /**
   * 删除记录
   */
  async delete(storeName: string, key: string): Promise<boolean> {
    try {
      const store = await this.getStore(storeName, 'readwrite')
      return new Promise((resolve, reject) => {
        const request = store.delete(key)
        request.onsuccess = () => resolve(true)
        request.onerror = () => {
          logger.error(`[IndexedDB] 删除记录失败 [${storeName}]:`, request.error)
          reject(request.error)
        }
      })
    } catch (error) {
      logger.error(`[IndexedDB] 删除记录失败 [${storeName}]:`, error)
      return false
    }
  }

  /**
   * 清空存储
   */
  async clear(storeName: string): Promise<boolean> {
    try {
      const store = await this.getStore(storeName, 'readwrite')
      return new Promise((resolve, reject) => {
        const request = store.clear()
        request.onsuccess = () => resolve(true)
        request.onerror = () => {
          logger.error(`[IndexedDB] 清空存储失败 [${storeName}]:`, request.error)
          reject(request.error)
        }
      })
    } catch (error) {
      logger.error(`[IndexedDB] 清空存储失败 [${storeName}]:`, error)
      return false
    }
  }

  /**
   * 统计记录数
   */
  async count(storeName: string): Promise<number> {
    try {
      const store = await this.getStore(storeName, 'readonly')
      return new Promise((resolve, reject) => {
        const request = store.count()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    } catch (error) {
      logger.error(`[IndexedDB] 统计记录失败 [${storeName}]:`, error)
      return 0
    }
  }

  // ============================================================================
  // 索引查询
  // ============================================================================

  /**
   * 通过索引查询
   */
  async getByIndex<T>(storeName: string, indexName: string, value: any): Promise<T[]> {
    try {
      const store = await this.getStore(storeName, 'readonly')
      const index = store.index(indexName)
      return new Promise((resolve, reject) => {
        const request = index.getAll(value)
        request.onsuccess = () => resolve(request.result || [])
        request.onerror = () => reject(request.error)
      })
    } catch (error) {
      logger.error(`[IndexedDB] 索引查询失败 [${storeName}.${indexName}]:`, error)
      return []
    }
  }

  /**
   * 通过索引范围查询
   */
  async getByIndexRange<T>(
    storeName: string,
    indexName: string,
    lowerBound?: any,
    upperBound?: any,
    lowerOpen = false,
    upperOpen = false
  ): Promise<T[]> {
    try {
      const store = await this.getStore(storeName, 'readonly')
      const index = store.index(indexName)
      const range = IDBKeyRange.bound(lowerBound, upperBound, lowerOpen, upperOpen)
      return new Promise((resolve, reject) => {
        const request = index.getAll(range)
        request.onsuccess = () => resolve(request.result || [])
        request.onerror = () => reject(request.error)
      })
    } catch (error) {
      logger.error(`[IndexedDB] 范围查询失败 [${storeName}.${indexName}]:`, error)
      return []
    }
  }

  /**
   * 游标遍历
   */
  async cursor<T>(
    storeName: string,
    callback: (value: T) => boolean | void,
    options?: { indexName?: string; direction?: IDBCursorDirection }
  ): Promise<void> {
    try {
      const store = await this.getStore(storeName, 'readonly')
      const source = options?.indexName ? store.index(options.indexName) : store

      return new Promise((resolve, reject) => {
        const request = source.openCursor(undefined, options?.direction)
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result as IDBCursorWithValue
          if (cursor) {
            const shouldContinue = callback(cursor.value as T)
            if (shouldContinue !== false) {
              cursor.continue()
            } else {
              resolve()
            }
          } else {
            resolve()
          }
        }
        request.onerror = () => reject(request.error)
      })
    } catch (error) {
      logger.error(`[IndexedDB] 游标遍历失败 [${storeName}]:`, error)
    }
  }

  // ============================================================================
  // 批量操作
  // ============================================================================

  /**
   * 批量添加或更新
   */
  async batchPut<T>(storeName: string, items: T[]): Promise<number> {
    if (items.length === 0) return 0

    try {
      const store = await this.getStore(storeName, 'readwrite')
      return new Promise((resolve, reject) => {
        let count = 0
        let completed = 0

        items.forEach((item) => {
          const request = store.put(item)
          request.onsuccess = () => {
            count++
            completed++
            if (completed === items.length) {
              resolve(count)
            }
          }
          request.onerror = () => {
            completed++
            if (completed === items.length) {
              resolve(count)
            }
          }
        })
      })
    } catch (error) {
      logger.error(`[IndexedDB] 批量保存失败 [${storeName}]:`, error)
      return 0
    }
  }

  /**
   * 批量删除
   */
  async batchDelete(storeName: string, keys: string[]): Promise<number> {
    if (keys.length === 0) return 0

    try {
      const store = await this.getStore(storeName, 'readwrite')
      return new Promise((resolve, reject) => {
        let count = 0
        let completed = 0

        keys.forEach((key) => {
          const request = store.delete(key)
          request.onsuccess = () => {
            count++
            completed++
            if (completed === keys.length) {
              resolve(count)
            }
          }
          request.onerror = () => {
            completed++
            if (completed === keys.length) {
              resolve(count)
            }
          }
        })
      })
    } catch (error) {
      logger.error(`[IndexedDB] 批量删除失败 [${storeName}]:`, error)
      return 0
    }
  }

  // ============================================================================
  // 数据压缩（可选）
  // ============================================================================

  /**
   * 压缩数据（使用简单的 JSON 压缩）
   */
  async compressData(data: string): Promise<string> {
    // 简单的重复模式压缩
    return data
      .replace(/"id":/g, '"i":')
      .replace(/"name":/g, '"n":')
      .replace(/"type":/g, '"t":')
      .replace(/"content":/g, '"c":')
      .replace(/"createdAt":/g, '"ca":')
      .replace(/"updatedAt":/g, '"ua":')
  }

  /**
   * 解压缩数据
   */
  async decompressData(data: string): Promise<string> {
    return data
      .replace(/"i":/g, '"id":')
      .replace(/"n":/g, '"name":')
      .replace(/"t":/g, '"type":')
      .replace(/"c":/g, '"content":')
      .replace(/"ca":/g, '"createdAt":')
      .replace(/"ua":/g, '"updatedAt":')
  }

  // ============================================================================
  // 数据库管理
  // ============================================================================

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      this.initPromise = null
      logger.debug('[IndexedDB] 数据库连接已关闭')
    }
  }

  /**
   * 删除数据库
   */
  static async deleteDatabase(): Promise<void> {
    // SSR 环境检查
    if (typeof window === 'undefined') {
      throw new Error('IndexedDB is not available in SSR environment')
    }

    const idb = (window as any).indexedDB
    if (!idb) {
      throw new Error('IndexedDB is not supported in this browser')
    }

    return new Promise((resolve, reject) => {
      const request = idb.deleteDatabase(DB_NAME)
      request.onsuccess = () => {
        logger.debug('[IndexedDB] 数据库已删除')
        resolve()
      }
      request.onerror = () => reject(request.error)
      request.onblocked = () => {
        logger.warn('[IndexedDB] 删除数据库被阻塞')
        reject(new Error('Database deletion blocked'))
      }
    })
  }

  /**
   * 获取数据库大小（估算）
   */
  async getEstimatedSize(): Promise<{ bytes: number; formatted: string }> {
    try {
      const db = await this.init()
      // 注意：实际获取大小需要复杂的计算，这里返回估算值
      const booksCount = await this.count(STORE_BOOKS)
      const settingsSize = JSON.stringify(await this.get(STORE_SETTINGS, 'app')).length || 0

      // 粗略估算：每本书平均 5KB
      const estimatedBytes = settingsSize + (booksCount * 5 * 1024)

      return {
        bytes: estimatedBytes,
        formatted: this.formatBytes(estimatedBytes)
      }
    } catch (error) {
      return { bytes: 0, formatted: '0 B' }
    }
  }

  /**
   * 格式化字节大小
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}

// ============================================================================
// 单例实例
// ============================================================================

const indexedDB = new IndexedDBHelper()

// ============================================================================
// 数据迁移工具
// ============================================================================

/**
 * 从 LocalStorage 迁移数据到 IndexedDB
 */
export async function migrateFromLocalStorage(): Promise<{
  success: boolean
  migratedBooks: number
  migratedSettings: boolean
  errors: string[]
}> {
  const errors: string[] = []
  let migratedBooks = 0
  let migratedSettings = false

  try {
    logger.info('[Migration] 开始从 LocalStorage 迁移到 IndexedDB')

    // 检查是否已迁移
    const migrationFlag = localStorage.getItem('feynman-indexedb-migrated')
    if (migrationFlag === 'true') {
      logger.info('[Migration] 已经迁移过，跳过')
      return { success: true, migratedBooks: 0, migratedSettings: false, errors: [] }
    }

    // 1. 迁移设置
    const settingsData = localStorage.getItem('feynman-settings')
    if (settingsData) {
      try {
        const settings = JSON.parse(settingsData)
        await indexedDB.put(STORE_SETTINGS, { id: 'app', ...settings })
        migratedSettings = true
        logger.info('[Migration] 设置迁移成功')
      } catch (e) {
        errors.push('设置迁移失败: ' + (e as Error).message)
      }
    }

    // 2. 迁移书籍
    const booksData = localStorage.getItem('feynman-books')
    if (booksData) {
      try {
        const books = JSON.parse(booksData)
        if (Array.isArray(books)) {
          const result = await indexedDB.batchPut(STORE_BOOKS, books)
          migratedBooks = result
          console.log(`[Migration] 成功迁移 ${migratedBooks} 本书`)
        }
      } catch (e) {
        errors.push('书籍迁移失败: ' + (e as Error).message)
      }
    }

    // 3. 标记迁移完成
    if (migratedSettings || migratedBooks > 0) {
      // 保留 LocalStorage 数据作为备份
      localStorage.setItem('feynman-indexedb-migrated', 'true')
      localStorage.setItem('feynman-indexedb-migration-date', Date.now().toString())

      // 保存数据版本
      await indexedDB.put(STORE_METADATA, {
        key: 'dataVersion',
        value: DATA_VERSION,
        migratedAt: Date.now()
      })

      logger.info('[Migration] 迁移完成')
    }

    return {
      success: errors.length === 0,
      migratedBooks,
      migratedSettings,
      errors
    }
  } catch (error) {
    console.error('[Migration] 迁移失败:', error)
    errors.push((error as Error).message)
    return {
      success: false,
      migratedBooks,
      migratedSettings,
      errors
    }
  }
}

/**
 * 检查是否需要迁移
 */
export async function needsMigration(): Promise<boolean> {
  // 检查 LocalStorage 是否有数据
  const hasLocalStorageData = !!(
    localStorage.getItem('feynman-settings') ||
    localStorage.getItem('feynman-books')
  )

  // 检查是否已迁移
  const migrated = localStorage.getItem('feynman-indexedb-migrated') === 'true'

  return hasLocalStorageData && !migrated
}

/**
 * 回滚到 LocalStorage
 */
export async function rollbackToLocalStorage(): Promise<boolean> {
  try {
    logger.info('[Migration] 开始回滚到 LocalStorage')

    // 从 IndexedDB 读取数据
    const settingsData = await indexedDB.get<{ id: string } & AppSettings>(STORE_SETTINGS, 'app')
    const booksData = await indexedDB.getAll<Book>(STORE_BOOKS)

    // 写入 LocalStorage
    if (settingsData) {
      const { id, ...settings } = settingsData
      localStorage.setItem('feynman-settings', JSON.stringify(settings))
    }

    if (booksData.length > 0) {
      localStorage.setItem('feynman-books', JSON.stringify(booksData))
    }

    // 清除迁移标记
    localStorage.removeItem('feynman-indexedb-migrated')

    logger.info('[Migration] 回滚完成')
    return true
  } catch (error) {
    console.error('[Migration] 回滚失败:', error)
    return false
  }
}

// ============================================================================
// 导出实例和工具
// ============================================================================

export { indexedDB }
export default indexedDB

// ============================================================================
// 使用示例
// ============================================================================

/**
 * 初始化数据库并迁移数据
 */
export async function initializeDatabase(): Promise<void> {
  try {
    // 初始化 IndexedDB
    await indexedDB.init()

    // 检查是否需要迁移
    if (await needsMigration()) {
      const result = await migrateFromLocalStorage()
      if (result.success) {
        logger.debug('[IndexedDB] 数据迁移成功:', result)
      } else {
        logger.warn('[IndexedDB] 数据迁移部分失败:', result.errors)
      }
    }

    logger.debug('[IndexedDB] 数据库初始化完成')
  } catch (error) {
    console.error('[IndexedDB] 数据库初始化失败:', error)
    throw error
  }
}

/**
 * 获取数据库统计信息
 */
export async function getDatabaseStats(): Promise<{
  booksCount: number
  dbSize: { bytes: number; formatted: string }
  dataVersion: number
  migratedAt: number | null
}> {
  const booksCount = await indexedDB.count(STORE_BOOKS)
  const dbSize = await indexedDB.getEstimatedSize()
  const metadata = await indexedDB.get<{ value: number; migratedAt?: number }>(STORE_METADATA, 'dataVersion')

  return {
    booksCount,
    dbSize,
    dataVersion: metadata?.value || 1,
    migratedAt: metadata?.migratedAt || null
  }
}
