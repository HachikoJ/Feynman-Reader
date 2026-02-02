/**
 * 数据访问层 - 使用 IndexedDB
 * 提供与原 store.ts 兼容的 API
 */

import { indexedDB, initializeDatabase, migrateFromLocalStorage, getDatabaseStats } from './indexedDB'
import type { AppSettings, Book, NoteRecord, PracticeRecord, QAPracticeRecord, ExportData } from './indexedDB'
import { logger } from './logger'

// ============================================================================
// 初始化
// ============================================================================

let dbInitialized = false

export async function initDB(): Promise<void> {
  if (!dbInitialized) {
    await initializeDatabase()
    dbInitialized = true
  }
}

// 确保在使用前初始化
async function ensureInit(): Promise<void> {
  if (!dbInitialized) {
    await initDB()
  }
}

// ============================================================================
// 设置操作
// ============================================================================

const SETTINGS_KEY = 'feynman-settings'

const defaultSettings: AppSettings = {
  apiKey: '',
  language: 'zh',
  theme: 'cyber',
  hideApiKeyAlert: false,
  quotes: [],
  quotesInitialized: false
}

/**
 * 获取设置
 */
export async function getSettings(): Promise<AppSettings> {
  await ensureInit()

  try {
    const data = await indexedDB.get<{ id: string } & AppSettings>('settings', 'app')
    if (data) {
      // 兼容旧版本的 customQuotes
      const quotes = data?.quotes || (data as any).customQuotes || []
      return { ...data, quotes, quotesInitialized: data?.quotesInitialized || false }
    }
  } catch (e) {
    logger.error('Failed to get settings from IndexedDB:', e)
  }

  // 回退到 LocalStorage
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(SETTINGS_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        const quotes = parsed?.quotes || parsed?.customQuotes || []
        return { ...parsed, quotes, quotesInitialized: parsed?.quotesInitialized || false }
      } catch (e) {
        logger.error('Failed to parse settings from localStorage:', e)
      }
    }
  }

  return defaultSettings
}

/**
 * 保存设置
 */
export async function saveSettings(settings: AppSettings): Promise<void> {
  await ensureInit()

  try {
    await indexedDB.put('settings', { id: 'app', ...settings })
  } catch (e) {
    logger.error('Failed to save settings to IndexedDB:', e)
    // 回退到 LocalStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    }
  }
}

/**
 * 重置设置
 */
export async function resetSettings(): Promise<void> {
  await saveSettings(defaultSettings)
}

// ============================================================================
// 书籍操作
// ============================================================================

const BOOKS_KEY = 'feynman-books'

/**
 * 获取所有书籍
 */
export async function getBooks(): Promise<Book[]> {
  await ensureInit()

  try {
    const books = await indexedDB.getAll<Book>('books')
    return Array.isArray(books) ? books : []
  } catch (e) {
    logger.error('Failed to get books from IndexedDB:', e)
  }

  // 回退到 LocalStorage
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(BOOKS_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        return Array.isArray(parsed) ? parsed : []
      } catch (e) {
        logger.error('Failed to parse books from localStorage:', e)
      }
    }
  }

  return []
}

/**
 * 保存所有书籍
 */
export async function saveBooks(books: Book[]): Promise<void> {
  await ensureInit()

  try {
    // 先清空再批量添加
    await indexedDB.clear('books')
    await indexedDB.batchPut('books', books)
  } catch (e) {
    logger.error('Failed to save books to IndexedDB:', e)
    // 回退到 LocalStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem(BOOKS_KEY, JSON.stringify(books))
    }
  }
}

/**
 * 获取单本书
 */
export async function getBook(id: string): Promise<Book | undefined> {
  const books = await getBooks()
  return books.find(b => b.id === id)
}

/**
 * 添加书籍
 */
export async function addBook(
  name: string,
  author?: string,
  cover?: string,
  description?: string,
  tags?: any[],
  documentContent?: string
): Promise<Book> {
  const books = await getBooks()
  const newBook: Book = {
    id: Date.now().toString(),
    name,
    author,
    cover,
    description,
    tags,
    documentContent,
    status: 'unread',
    currentPhase: 0,
    noteRecords: [],
    responses: {},
    practiceRecords: [],
    qaPracticeRecords: [],
    bestScore: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  books.unshift(newBook)
  await saveBooks(books)
  return newBook
}

/**
 * 更新书籍
 */
export async function updateBook(id: string, updates: Partial<Book>): Promise<void> {
  const books = await getBooks()
  const index = books.findIndex(b => b.id === id)
  if (index !== -1) {
    logger.debug('🔄 updateBook:', { id, updates, oldStatus: books[index].status })
    books[index] = { ...books[index], ...updates, updatedAt: Date.now() }
    await saveBooks(books)
    logger.debug('🔄 updateBook 完成，新状态:', books[index].status)
  } else {
    logger.error('❌ updateBook: 找不到书籍', id)
  }
}

/**
 * 删除书籍
 */
export async function deleteBook(id: string): Promise<void> {
  const books = await getBooks()
  const filtered = books.filter(b => b.id !== id)
  await saveBooks(filtered)
}

// ============================================================================
// 标签操作
// ============================================================================

/**
 * 获取所有标签（去重）
 */
export async function getAllTags(): Promise<any[]> {
  const books = await getBooks()
  const tagMap = new Map<string, any>()

  books.forEach(book => {
    book.tags?.forEach(tag => {
      const key = `${tag.category}:${tag.name}`
      if (!tagMap.has(key)) {
        tagMap.set(key, tag)
      }
    })
  })

  return Array.from(tagMap.values())
}

/**
 * 获取所有分类
 */
export async function getAllCategories(): Promise<string[]> {
  const tags = await getAllTags()
  const categories = new Set<string>()
  tags.forEach(tag => categories.add(tag.category))
  return Array.from(categories)
}

// ============================================================================
// 实践记录操作
// ============================================================================

/**
 * 计算最终分数
 */
function calculateFinalScore(book: Book): number {
  if (!book) return 0

  const teachingMaxScore = book.practiceRecords && book.practiceRecords.length > 0
    ? book.practiceRecords.reduce((max, r) => Math.max(max, r.scores.overall), 0)
    : 0

  let qaMaxAvgScore = 0
  if (book.qaPracticeRecords && book.qaPracticeRecords.length > 0) {
    book.qaPracticeRecords.forEach(record => {
      const answeredQuestions = record.questions.filter(q => q.score !== undefined)
      if (answeredQuestions.length > 0) {
        const avgScore = answeredQuestions.reduce((sum, q) => sum + (q.score || 0), 0) / answeredQuestions.length
        qaMaxAvgScore = Math.max(qaMaxAvgScore, avgScore)
      }
    })
  }

  return Math.round((teachingMaxScore + qaMaxAvgScore) / 2)
}

/**
 * 检查是否完成费曼实践
 */
function checkFeynmanComplete(book: Book): boolean {
  if (!book) return false

  const teachingMaxScore = book.practiceRecords && book.practiceRecords.length > 0
    ? book.practiceRecords.reduce((max, r) => Math.max(max, r.scores.overall), 0)
    : 0
  const teachingPassed = teachingMaxScore >= 60

  let qaMaxAvgScore = 0
  let allQARecordsPassed = true

  if (book.qaPracticeRecords && book.qaPracticeRecords.length > 0) {
    book.qaPracticeRecords.forEach(record => {
      const answeredQuestions = record.questions.filter(q => q.score !== undefined)
      if (answeredQuestions.length > 0) {
        const avgScore = answeredQuestions.reduce((sum, q) => sum + (q.score || 0), 0) / answeredQuestions.length
        qaMaxAvgScore = Math.max(qaMaxAvgScore, avgScore)
        if (avgScore < 60) {
          allQARecordsPassed = false
        }
      }
    })
  } else {
    allQARecordsPassed = false
  }

  const qaPassed = qaMaxAvgScore >= 60 && allQARecordsPassed
  const finalScore = (teachingMaxScore + qaMaxAvgScore) / 2
  const finalPassed = finalScore >= 60

  return teachingPassed && qaPassed && finalPassed
}

/**
 * 添加实践记录
 */
export async function addPracticeRecord(
  bookId: string,
  record: Omit<PracticeRecord, 'id' | 'bookId' | 'createdAt'>
): Promise<PracticeRecord> {
  const books = await getBooks()
  const book = books.find(b => b.id === bookId)
  if (!book) throw new Error('Book not found')

  const newRecord: PracticeRecord = {
    ...record,
    id: Date.now().toString(),
    bookId,
    createdAt: Date.now()
  }

  if (!book.practiceRecords) {
    book.practiceRecords = []
  }
  book.practiceRecords.push(newRecord)
  book.bestScore = calculateFinalScore(book)
  book.updatedAt = Date.now()
  await saveBooks(books)

  const shouldFinish = checkFeynmanComplete(book)
  if (shouldFinish) {
    await updateBook(bookId, { status: 'finished' })
  } else if (book.status === 'finished') {
    await updateBook(bookId, { status: 'reading' })
  }

  return newRecord
}

/**
 * 获取实践记录
 */
export async function getPracticeRecords(bookId: string): Promise<PracticeRecord[]> {
  const book = await getBook(bookId)
  return book?.practiceRecords || []
}

/**
 * 删除实践记录
 */
export async function deletePracticeRecord(bookId: string, recordId: string): Promise<void> {
  const books = await getBooks()
  const book = books.find(b => b.id === bookId)
  if (!book || !book.practiceRecords) return

  book.practiceRecords = book.practiceRecords.filter(r => r.id !== recordId)
  book.bestScore = calculateFinalScore(book)
  book.updatedAt = Date.now()
  await saveBooks(books)

  if (!checkFeynmanComplete(book) && book.status === 'finished') {
    await updateBook(bookId, { status: 'reading' })
  }
}

// ============================================================================
// 问答实践操作
// ============================================================================

/**
 * 获取问答实践记录
 */
export async function getQAPracticeRecords(bookId: string): Promise<QAPracticeRecord[]> {
  const book = await getBook(bookId)
  return book?.qaPracticeRecords || []
}

/**
 * 添加问答实践记录
 */
export async function addQAPracticeRecord(
  bookId: string,
  record: Omit<QAPracticeRecord, 'id' | 'bookId' | 'createdAt' | 'updatedAt'>
): Promise<QAPracticeRecord> {
  const books = await getBooks()
  const book = books.find(b => b.id === bookId)
  if (!book) throw new Error('Book not found')

  const newRecord: QAPracticeRecord = {
    ...record,
    id: Date.now().toString(),
    bookId,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }

  if (!book.qaPracticeRecords) {
    book.qaPracticeRecords = []
  }
  book.qaPracticeRecords.push(newRecord)
  book.bestScore = calculateFinalScore(book)
  book.updatedAt = Date.now()
  await saveBooks(books)

  const shouldFinish = checkFeynmanComplete(book)
  if (shouldFinish) {
    await updateBook(bookId, { status: 'finished' })
  } else if (book.status === 'finished') {
    await updateBook(bookId, { status: 'reading' })
  }

  return newRecord
}

/**
 * 更新问答实践记录
 */
export async function updateQAPracticeRecord(
  bookId: string,
  recordId: string,
  updates: Partial<QAPracticeRecord>
): Promise<void> {
  const books = await getBooks()
  const book = books.find(b => b.id === bookId)
  if (!book || !book.qaPracticeRecords) return

  const index = book.qaPracticeRecords.findIndex(r => r.id === recordId)
  if (index !== -1) {
    book.qaPracticeRecords[index] = {
      ...book.qaPracticeRecords[index],
      ...updates,
      updatedAt: Date.now()
    }
    book.bestScore = calculateFinalScore(book)
    book.updatedAt = Date.now()
    await saveBooks(books)

    const shouldFinish = checkFeynmanComplete(book)
    if (shouldFinish) {
      await updateBook(bookId, { status: 'finished' })
    } else if (book.status === 'finished') {
      await updateBook(bookId, { status: 'reading' })
    }
  }
}

/**
 * 删除问答实践记录
 */
export async function deleteQAPracticeRecord(bookId: string, recordId: string): Promise<void> {
  const books = await getBooks()
  const book = books.find(b => b.id === bookId)
  if (!book || !book.qaPracticeRecords) return

  book.qaPracticeRecords = book.qaPracticeRecords.filter(r => r.id !== recordId)
  book.bestScore = calculateFinalScore(book)
  book.updatedAt = Date.now()
  await saveBooks(books)

  if (!checkFeynmanComplete(book) && book.status === 'finished') {
    await updateBook(bookId, { status: 'reading' })
  }
}

// ============================================================================
// 导出/导入
// ============================================================================

const DATA_VERSION = 2

/**
 * 导出所有数据
 */
export async function exportAllData(): Promise<string> {
  const settings = await getSettings()
  const books = await getBooks()

  const exportData: ExportData = {
    version: DATA_VERSION,
    exportDate: Date.now(),
    settings: {
      ...settings,
      apiKey: settings.apiKey ? '[REDACTED]' : ''
    },
    books
  }

  return JSON.stringify(exportData, null, 2)
}

/**
 * 下载备份
 */
export function downloadDataBackup(): void {
  exportAllData().then(data => {
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `feynman-backup-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  })
}

/**
 * 验证导入数据
 */
export function validateImportData(data: unknown): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: '数据格式无效' }
  }

  const importData = data as Partial<ExportData>

  if (typeof importData.version !== 'number') {
    return { valid: false, error: '缺少数据版本信息' }
  }

  if (importData.version > DATA_VERSION) {
    return { valid: false, error: `数据版本过高 (v${importData.version})，请更新应用` }
  }

  if (!importData.settings || typeof importData.settings !== 'object') {
    return { valid: false, error: '设置数据无效' }
  }

  if (!Array.isArray(importData.books)) {
    return { valid: false, error: '书籍数据无效' }
  }

  return { valid: true }
}

/**
 * 预览导入数据
 */
export function previewImportData(jsonString: string): { valid: boolean; data?: ExportData; error?: string } {
  try {
    const data = JSON.parse(jsonString)
    const validation = validateImportData(data)

    if (!validation.valid) {
      return { valid: false, error: validation.error }
    }

    return { valid: true, data: data as ExportData }
  } catch (e) {
    return { valid: false, error: 'JSON 解析失败' }
  }
}

/**
 * 应用导入数据
 */
export async function applyImportData(
  data: ExportData,
  options: {
    importSettings?: boolean
    importBooks?: boolean
    mergeBooks?: boolean
  } = {}
): Promise<void> {
  const {
    importSettings = true,
    importBooks = true,
    mergeBooks = true
  } = options

  if (importSettings && data.settings) {
    await saveSettings(data.settings)
  }

  if (importBooks) {
    if (mergeBooks) {
      const existingBooks = await getBooks()
      const existingIds = new Set(existingBooks.map(b => b.id))
      const newBooks = data.books.filter(b => !existingIds.has(b.id))
      await saveBooks([...newBooks, ...existingBooks])
    } else {
      await saveBooks(data.books)
    }
  }
}

/**
 * 获取数据统计
 */
export async function getDataStats(): Promise<{
  totalBooks: number
  totalNotes: number
  totalPractices: number
  totalQARecords: number
  dataSize: string
}> {
  const books = await getBooks()
  const stats = await getDatabaseStats()

  const totalNotes = books.reduce((sum, b) => sum + (b.noteRecords?.length || 0), 0)
  const totalPractices = books.reduce((sum, b) => sum + (b.practiceRecords?.length || 0), 0)
  const totalQARecords = books.reduce((sum, b) => sum + (b.qaPracticeRecords?.length || 0), 0)

  return {
    totalBooks: books.length,
    totalNotes,
    totalPractices,
    totalQARecords,
    dataSize: stats.dbSize.formatted
  }
}

// ============================================================================
// 搜索功能
// ============================================================================

/**
 * 搜索书籍
 */
export async function searchBooks(query: string): Promise<Book[]> {
  if (!query.trim()) {
    return await getBooks()
  }

  const books = await getBooks()
  const lowerQuery = query.toLowerCase()

  return books.filter(book =>
    book.name.toLowerCase().includes(lowerQuery) ||
    (book.author && book.author.toLowerCase().includes(lowerQuery)) ||
    (book.description && book.description.toLowerCase().includes(lowerQuery)) ||
    (book.tags && book.tags.some(tag =>
      tag.name.toLowerCase().includes(lowerQuery) ||
      tag.category.toLowerCase().includes(lowerQuery)
    ))
  )
}

/**
 * 按状态筛选书籍
 */
export async function filterBooksByStatus(status: string): Promise<Book[]> {
  const books = await getBooks()
  if (!status || status === 'all') return books
  return books.filter(book => book.status === status)
}

/**
 * 按标签筛选书籍
 */
export async function filterBooksByTag(tagName: string): Promise<Book[]> {
  const books = await getBooks()
  return books.filter(book =>
    book.tags?.some(tag => tag.name === tagName)
  )
}

/**
 * 按分类筛选书籍
 */
export async function filterBooksByCategory(category: string): Promise<Book[]> {
  const books = await getBooks()
  return books.filter(book =>
    book.tags?.some(tag => tag.category === category)
  )
}

/**
 * 排序书籍
 */
export async function sortBooks(
  sortBy: 'updatedAt' | 'createdAt' | 'name' | 'author' | 'bestScore',
  order: 'asc' | 'desc' = 'desc'
): Promise<Book[]> {
  const books = await getBooks()

  return [...books].sort((a, b) => {
    let comparison = 0

    switch (sortBy) {
      case 'updatedAt':
        comparison = a.updatedAt - b.updatedAt
        break
      case 'createdAt':
        comparison = a.createdAt - b.createdAt
        break
      case 'name':
        comparison = a.name.localeCompare(b.name, 'zh')
        break
      case 'author':
        const aAuthor = a.author || ''
        const bAuthor = b.author || ''
        comparison = aAuthor.localeCompare(bAuthor, 'zh')
        break
      case 'bestScore':
        comparison = a.bestScore - b.bestScore
        break
    }

    return order === 'desc' ? -comparison : comparison
  })
}

// ============================================================================
// 导出工具
// ============================================================================

export {
  indexedDB,
  initializeDatabase,
  migrateFromLocalStorage,
  getDatabaseStats
}

export type {
  AppSettings,
  Book,
  NoteRecord,
  PracticeRecord,
  QAPracticeRecord,
  ExportData
}
