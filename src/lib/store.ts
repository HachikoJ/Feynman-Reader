import { Language } from './i18n'
import { logger } from './logger'
import {
  initDB,
  getSettings as getIndexedDBSettings,
  saveSettings as saveIndexedDBSettings,
  getBooks as getIndexedDBBooks,
  saveBooks as saveIndexedDBBooks,
  saveBook as saveIndexedDBBook,
  deleteBookById as deleteIndexedDBBook
} from './db'
import { indexedDB as indexedDBStorage } from './indexedDB'

export type Theme = 'dark' | 'light' | 'cyber'
export type BookStatus = 'unread' | 'reading' | 'finished'

// 笔记记录
export interface NoteRecord {
  id: string
  type: 'note' | 'teaching'  // 普通笔记 或 教学模拟
  content: string
  aiReview?: string          // AI 点评（仅教学模拟有）
  phaseId?: string           // 关联的阶段
  createdAt: number
}

// 费曼实践记录
export interface PracticeRecord {
  id: string
  bookId: string
  content: string           // 用户的教学输出
  aiReview: string          // AI 点评
  scores: {
    accuracy: number        // 理解准确度 0-100
    completeness: number    // 内容完整度 0-100
    clarity: number         // 表达清晰度 0-100
    overall: number         // 综合评分 0-100
  }
  passed: boolean           // 是否合格 (overall >= 60)
  createdAt: number
}

// 角色类型（包含批评者）
export type PersonaType = 'elementary' | 'college' | 'professional' | 'scientist' | 'entrepreneur' | 'teacher' | 'investor' | 'user' | 'competitor' | 'nitpicker'

// 角色问答
export interface PersonaQuestion {
  persona: PersonaType      // 角色类型
  personaName: string       // 角色名称（中文）
  question: string          // 问题
  userAnswer?: string       // 用户回答
  answeredAt?: number       // 回答时间
  aiReview?: string         // AI 点评
  score?: number            // 得分 0-100
  passed?: boolean          // 是否通过
  reviewedAt?: number       // 评审时间
}

// 问答实践记录
export interface QAPracticeRecord {
  id: string
  bookId: string
  questions: PersonaQuestion[]  // 3个角色的问题
  allPassed: boolean            // 是否全部通过
  createdAt: number
  updatedAt: number
}

// 书籍标签（AI 生成）
export interface BookTag {
  name: string             // 标签名称，如 "心理学"、"社会心理学"
  category: string         // 分类，如 "社科"、"文学"、"科技"
}

export interface Book {
  id: string
  name: string
  author?: string
  cover?: string           // 封面图 URL 或 base64
  description?: string     // 一句话介绍
  tags?: BookTag[]         // AI 生成的标签
  documentContent?: string // 上传的文档内容（作为知识库）
  status: BookStatus
  currentPhase: number
  noteRecords: NoteRecord[]
  responses: Record<string, string>
  practiceRecords: PracticeRecord[]
  qaPracticeRecords: QAPracticeRecord[]  // 问答实践记录（支持多条）
  recommendations?: string // AI 生成的推荐内容
  readingProgress?: {      // 阅读进度（页码）
    currentPage: number
    totalPages: number
    percentage: number
  }
  bestScore: number
  createdAt: number
  updatedAt: number
}

export interface CustomQuote {
  text: string
  author: string
  isPreset?: boolean  // 标记是否为预设金句
}

export interface AppSettings {
  apiKey: string
  language: Language
  theme: Theme
  hideApiKeyAlert: boolean
  aiDataConsent?: boolean
  quotes: CustomQuote[]  // 改名，包含预设和自定义
  quotesInitialized?: boolean  // 标记是否已初始化预设金句
}

const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  language: 'zh',
  theme: 'light',
  hideApiKeyAlert: false,
  aiDataConsent: false,
  quotes: [],
  quotesInitialized: false
}

let settingsCache: AppSettings = DEFAULT_SETTINGS
let booksCache: Book[] = []
let initializationPromise: Promise<void> | null = null
let settingsWriteQueue = Promise.resolve()
let booksWriteQueue = Promise.resolve()

function cloneForStorage<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))
}

export async function initializeStore(): Promise<void> {
  if (typeof window === 'undefined') return
  if (initializationPromise) return initializationPromise

  initializationPromise = (async () => {
    await initDB()
    const [settings, books] = await Promise.all([
      getIndexedDBSettings(),
      getIndexedDBBooks()
    ])

    const quotes = settings.quotes || (settings as any).customQuotes || []
    const theme = settings.theme === 'cyber' ? 'light' : settings.theme
    settingsCache = {
      ...DEFAULT_SETTINGS,
      ...settings,
      theme,
      quotes,
      quotesInitialized: settings.quotesInitialized || false
    }
    if (settings.theme === 'cyber') {
      saveSettings(settingsCache)
    }
    const loadedBooks = Array.isArray(books) ? books : []
    booksCache = loadedBooks.map(book => {
      const bestScore = calculateFinalScore(book)
      return book.bestScore === bestScore ? book : { ...book, bestScore }
    })
    booksCache.forEach((book, index) => {
      if (book !== loadedBooks[index]) persistBook(book)
    })
  })().catch(error => {
    initializationPromise = null
    throw error
  })

  return initializationPromise
}

export function getSettings(): AppSettings {
  return settingsCache
}

export function saveSettings(settings: AppSettings): void {
  settingsCache = settings
  const snapshot = cloneForStorage(settings)
  settingsWriteQueue = settingsWriteQueue
    .then(() => saveIndexedDBSettings(snapshot), () => saveIndexedDBSettings(snapshot))
    .catch(error => logger.error('Failed to persist settings to IndexedDB:', error))
}

export function getBooks(): Book[] {
  return [...booksCache]
}

export function saveBooks(books: Book[]): void {
  booksCache = [...books]
  const snapshot = cloneForStorage(books)
  booksWriteQueue = booksWriteQueue
    .then(() => saveIndexedDBBooks(snapshot), () => saveIndexedDBBooks(snapshot))
    .catch(error => logger.error('Failed to persist books to IndexedDB:', error))
}

function persistBook(book: Book): void {
  const snapshot = cloneForStorage(book)
  booksWriteQueue = booksWriteQueue
    .then(() => saveIndexedDBBook(snapshot), () => saveIndexedDBBook(snapshot))
    .catch(error => logger.error('Failed to persist book to IndexedDB:', error))
}

function persistBookDeletion(id: string): void {
  booksWriteQueue = booksWriteQueue
    .then(() => deleteIndexedDBBook(id), () => deleteIndexedDBBook(id))
    .catch(error => logger.error('Failed to delete book from IndexedDB:', error))
}

export function addBook(name: string, author?: string, cover?: string, description?: string, tags?: BookTag[], documentContent?: string): Book {
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
  booksCache = [newBook, ...booksCache]
  persistBook(newBook)
  return newBook
}

// 获取所有书籍的标签（去重）
export function getAllTags(): BookTag[] {
  const books = getBooks()
  const tagMap = new Map<string, BookTag>()
  
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

// 获取所有分类
export function getAllCategories(): string[] {
  const tags = getAllTags()
  const categories = new Set<string>()
  tags.forEach(tag => categories.add(tag.category))
  return Array.from(categories)
}

export function updateBook(id: string, updates: Partial<Book>): void {
  const existingBook = booksCache.find(book => book.id === id)
  if (existingBook) {
    logger.debug('🔄 updateBook:', { id, updates, oldStatus: existingBook.status })
    const updatedBook = { ...existingBook, ...updates, updatedAt: Date.now() }
    booksCache = booksCache.map(book => book.id === id ? updatedBook : book)
    persistBook(updatedBook)
    logger.debug('🔄 updateBook 完成，新状态:', updatedBook.status)
  } else {
    logger.error('❌ updateBook: 找不到书籍', id)
  }
}

export function deleteBook(id: string): void {
  booksCache = booksCache.filter(book => book.id !== id)
  persistBookDeletion(id)
}

/** Reset in-memory state after the browser database has been deleted. */
export function resetStoreCache(): void {
  settingsCache = { ...DEFAULT_SETTINGS }
  booksCache = []
  initializationPromise = null
  settingsWriteQueue = Promise.resolve()
  booksWriteQueue = Promise.resolve()
}

export function getBook(id: string): Book | undefined {
  return getBooks().find(b => b.id === id)
}

function replaceBookInCache(book: Book): void {
  booksCache = booksCache.map(existing => existing.id === book.id ? book : existing)
  persistBook(book)
}


export function addPracticeRecord(bookId: string, record: Omit<PracticeRecord, 'id' | 'bookId' | 'createdAt'>): PracticeRecord {
  const book = getBook(bookId)
  if (!book) throw new Error('Book not found')
  
  const newRecord: PracticeRecord = {
    ...record,
    id: Date.now().toString(),
    bookId,
    createdAt: Date.now()
  }
  
  const updatedBook = {
    ...book,
    practiceRecords: [...(book.practiceRecords || []), newRecord],
    updatedAt: Date.now()
  }
  updatedBook.bestScore = calculateFinalScore(updatedBook)
  replaceBookInCache(updatedBook)
  
  logger.debug('📝 addPracticeRecord 保存完成，开始检查状态')
  
  // 保存后再检查是否教学和问答都通过了，才能标记为已读
  const shouldFinish = checkFeynmanComplete(bookId)
  logger.debug('📝 checkFeynmanComplete 返回:', shouldFinish)
  
  if (shouldFinish) {
    logger.debug('✅ 满足已读条件，更新状态为 finished')
    updateBook(bookId, { status: 'finished' })
  } else if (updatedBook.status === 'finished') {
    logger.debug('⚠️ 不满足已读条件，改回 reading')
    // 如果之前是已读，但现在不满足条件了（比如重新提交了一个不合格的），改回在读
    updateBook(bookId, { status: 'reading' })
  } else {
    logger.debug('ℹ️ 当前状态:', book.status, '不需要更新')
  }
  
  return newRecord
}

export function getPracticeRecords(bookId: string): PracticeRecord[] {
  const book = getBook(bookId)
  return book?.practiceRecords || []
}

export function deletePracticeRecord(bookId: string, recordId: string): void {
  const book = getBook(bookId)
  if (!book || !book.practiceRecords) return

  const updatedBook = {
    ...book,
    practiceRecords: book.practiceRecords.filter(record => record.id !== recordId),
    updatedAt: Date.now()
  }
  updatedBook.bestScore = calculateFinalScore(updatedBook)
  replaceBookInCache(updatedBook)
  
  // 保存后再检查是否还满足已读条件
  if (!checkFeynmanComplete(bookId) && updatedBook.status === 'finished') {
    updateBook(bookId, { status: 'reading' })
  }
}

// 问答实践相关函数
export function getQAPracticeRecords(bookId: string): QAPracticeRecord[] {
  const book = getBook(bookId)
  return book?.qaPracticeRecords || []
}

export function addQAPracticeRecord(bookId: string, record: Omit<QAPracticeRecord, 'id' | 'bookId' | 'createdAt' | 'updatedAt'>): QAPracticeRecord {
  const book = getBook(bookId)
  if (!book) throw new Error('Book not found')
  
  const newRecord: QAPracticeRecord = {
    ...record,
    id: Date.now().toString(),
    bookId,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  
  const updatedBook = {
    ...book,
    qaPracticeRecords: [...(book.qaPracticeRecords || []), newRecord],
    updatedAt: Date.now()
  }
  updatedBook.bestScore = calculateFinalScore(updatedBook)
  replaceBookInCache(updatedBook)
  
  logger.debug('💬 addQAPracticeRecord 保存完成，开始检查状态')
  
  // 保存后再检查是否教学和问答都通过了，才能标记为已读
  const shouldFinish = checkFeynmanComplete(bookId)
  logger.debug('💬 checkFeynmanComplete 返回:', shouldFinish)
  
  if (shouldFinish) {
    logger.debug('✅ 满足已读条件，更新状态为 finished')
    updateBook(bookId, { status: 'finished' })
  } else if (updatedBook.status === 'finished') {
    logger.debug('⚠️ 不满足已读条件，改回 reading')
    updateBook(bookId, { status: 'reading' })
  } else {
    logger.debug('ℹ️ 当前状态:', book.status, '不需要更新')
  }
  
  return newRecord
}

export function updateQAPracticeRecord(bookId: string, recordId: string, updates: Partial<QAPracticeRecord>): void {
  const book = getBook(bookId)
  if (!book || !book.qaPracticeRecords) return
  
  const index = book.qaPracticeRecords.findIndex(r => r.id === recordId)
  if (index !== -1) {
    const qaPracticeRecords = book.qaPracticeRecords.map((record, recordIndex) =>
      recordIndex === index ? { ...record, ...updates, updatedAt: Date.now() } : record
    )
    const updatedBook = { ...book, qaPracticeRecords, updatedAt: Date.now() }
    updatedBook.bestScore = calculateFinalScore(updatedBook)
    replaceBookInCache(updatedBook)
    
    logger.debug('💬 updateQAPracticeRecord 保存完成，开始检查状态')
    
    // 保存后再检查是否教学和问答都通过了
    const shouldFinish = checkFeynmanComplete(bookId)
    logger.debug('💬 checkFeynmanComplete 返回:', shouldFinish)
    
    if (shouldFinish) {
      logger.debug('✅ 满足已读条件，更新状态为 finished')
      updateBook(bookId, { status: 'finished' })
    } else if (updatedBook.status === 'finished') {
      logger.debug('⚠️ 不满足已读条件，改回 reading')
      updateBook(bookId, { status: 'reading' })
    } else {
      logger.debug('ℹ️ 当前状态:', book.status, '不需要更新')
    }
  }
}

export function deleteQAPracticeRecord(bookId: string, recordId: string): void {
  const book = getBook(bookId)
  if (!book || !book.qaPracticeRecords) return

  const updatedBook = {
    ...book,
    qaPracticeRecords: book.qaPracticeRecords.filter(record => record.id !== recordId),
    updatedAt: Date.now()
  }
  updatedBook.bestScore = calculateFinalScore(updatedBook)
  replaceBookInCache(updatedBook)
  
  // 保存后再检查是否还满足已读条件
  if (!checkFeynmanComplete(bookId) && updatedBook.status === 'finished') {
    updateBook(bookId, { status: 'reading' })
  }
}

// 检查是否完成所有费曼实践（教学+问答）
export function checkFeynmanComplete(bookId: string): boolean {
  const book = getBook(bookId)
  if (!book) return false
  
  // 1. 检查教学实践：取所有记录中的最高分
  const teachingMaxScore = book.practiceRecords && book.practiceRecords.length > 0
    ? book.practiceRecords.reduce((max, r) => Math.max(max, r.scores.overall), 0)
    : 0
  const teachingPassed = teachingMaxScore >= 60
  
  // 2. 只有一组问题全部通过，才允许问答成绩参与完成判定。
  const completedQARecords = (book.qaPracticeRecords || []).filter(record => record.allPassed && record.questions.length > 0)
  const qaMaxAvgScore = completedQARecords.reduce((max, record) => {
    const avgScore = record.questions.reduce((sum, question) => sum + (question.score || 0), 0) / record.questions.length
    return Math.max(max, avgScore)
  }, 0)
  const qaPassed = qaMaxAvgScore >= 60
  
  // 3. 计算最终总分：(教学最高分 + 问答最高平均分) / 2
  const finalScore = (teachingMaxScore + qaMaxAvgScore) / 2
  const finalPassed = finalScore >= 60
  
  // 4. 所有条件都要满足
  const allConditionsMet = teachingPassed && qaPassed && finalPassed
  
  logger.debug('🔍 checkFeynmanComplete:', {
    bookId,
    bookName: book.name,
    teachingMaxScore,
    teachingPassed,
    qaMaxAvgScore: Math.round(qaMaxAvgScore),
    qaPassed,
    finalScore: Math.round(finalScore),
    finalPassed,
    allConditionsMet,
    qaRecordsCount: book.qaPracticeRecords?.length || 0
  })
  
  return allConditionsMet
}

// 计算书籍的最终总分
export function calculateFinalScore(book: Book): number {
  if (!book) return 0

  // 教学实践最高分
  const teachingMaxScore = book.practiceRecords && book.practiceRecords.length > 0
    ? book.practiceRecords.reduce((max, r) => Math.max(max, r.scores.overall), 0)
    : 0

  // 问答未全部通过时不产生综合得分。
  const completedQARecords = (book.qaPracticeRecords || []).filter(record => record.allPassed && record.questions.length > 0)
  const qaMaxAvgScore = completedQARecords.reduce((max, record) => {
    const avgScore = record.questions.reduce((sum, question) => sum + (question.score || 0), 0) / record.questions.length
    return Math.max(max, avgScore)
  }, 0)

  if (teachingMaxScore < 60 || qaMaxAvgScore < 60) return 0

  // 最终总分 = (教学最高分 + 问答最高平均分) / 2
  const finalScore = (teachingMaxScore + qaMaxAvgScore) / 2

  logger.debug('📊 calculateFinalScore:', {
    bookId: book.id,
    bookName: book.name,
    teachingMaxScore: Math.round(teachingMaxScore),
    qaMaxAvgScore: Math.round(qaMaxAvgScore),
    finalScore: Math.round(finalScore),
    formula: `(${Math.round(teachingMaxScore)} + ${Math.round(qaMaxAvgScore)}) / 2 = ${Math.round(finalScore)}`
  })

  return Math.round(finalScore)
}

// ============================================================================
// 数据导出/导入功能 (P0 修复)
// ============================================================================

// 数据版本号 - 用于数据迁移
export const DATA_VERSION = 1

// 导出数据的完整结构
export interface ExportData {
  version: number
  exportDate: number
  settings: AppSettings
  books: Book[]
}

// 导出所有数据为 JSON 字符串
export function exportAllData(): string {
  const settings = getSettings()
  const books = getBooks()

  const exportData: ExportData = {
    version: DATA_VERSION,
    exportDate: Date.now(),
    settings: {
      ...settings,
      // 导出时移除 API Key 的明文，用占位符替代
      apiKey: settings.apiKey ? '[REDACTED]' : ''
    },
    books
  }

  return JSON.stringify(exportData, null, 2)
}

// 导出所有数据并触发下载
export function downloadDataBackup(): void {
  const data = exportAllData()
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `feynman-backup-${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// 验证导入数据的结构
export function validateImportData(data: unknown): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: '数据格式无效' }
  }

  const importData = data as Partial<ExportData>

  // 检查版本
  if (typeof importData.version !== 'number') {
    return { valid: false, error: '缺少数据版本信息' }
  }

  if (importData.version > DATA_VERSION) {
    return { valid: false, error: `数据版本过高 (v${importData.version})，请更新应用` }
  }

  // 检查导出日期
  if (typeof importData.exportDate !== 'number') {
    return { valid: false, error: '缺少导出日期信息' }
  }

  // 检查设置
  if (!importData.settings || typeof importData.settings !== 'object') {
    return { valid: false, error: '设置数据无效' }
  }

  // 检查书籍数据
  if (!Array.isArray(importData.books)) {
    return { valid: false, error: '书籍数据无效' }
  }

  // 验证每本书的结构
  for (const book of importData.books) {
    if (!book.id || !book.name) {
      return { valid: false, error: '书籍数据缺少必要字段' }
    }
  }

  return { valid: true }
}

// 导入数据（仅验证，不应用）
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

// 应用导入的数据
export function applyImportData(data: ExportData, options: {
  importSettings?: boolean
  importBooks?: boolean
  mergeBooks?: boolean  // true = 合并，false = 覆盖
}): void {
  const {
    importSettings = true,
    importBooks = true,
    mergeBooks = true
  } = options

  // 导入设置
  if (importSettings && data.settings) {
    saveSettings(data.settings)
  }

  // 导入书籍
  if (importBooks) {
    if (mergeBooks) {
      // 合并模式：保留现有的书，只添加新书
      const existingBooks = getBooks()
      const existingIds = new Set(existingBooks.map(b => b.id))

      // 只添加不存在的书
      const newBooks = data.books.filter(b => !existingIds.has(b.id))
      saveBooks([...newBooks, ...existingBooks])
    } else {
      // 覆盖模式：完全替换
      saveBooks(data.books)
    }
  }
}

// 获取数据统计信息
export function getDataStats(): {
  totalBooks: number
  totalNotes: number
  totalPractices: number
  totalQARecords: number
  dataSize: string
} {
  const books = getBooks()
  const settings = getSettings()

  const totalNotes = books.reduce((sum, b) => sum + (b.noteRecords?.length || 0), 0)
  const totalPractices = books.reduce((sum, b) => sum + (b.practiceRecords?.length || 0), 0)
  const totalQARecords = books.reduce((sum, b) => sum + (b.qaPracticeRecords?.length || 0), 0)

  // 计算数据大小
  const dataStr = JSON.stringify({ settings, books })
  const dataSizeInBytes = new Blob([dataStr]).size
  const dataSize = formatBytes(dataSizeInBytes)

  return {
    totalBooks: books.length,
    totalNotes,
    totalPractices,
    totalQARecords,
    dataSize
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// ============================================================================
// API Key 加密存储 (P0 修复)
// ============================================================================

// 简单的加密/解密函数（使用 Web Crypto API）
const ENCRYPTION_KEY_NAME = 'feynman-key'
const ENCRYPTION_SALT = 'feynman-reading-app-salt-v1'

// 生成或获取加密密钥
async function getCryptoKey(): Promise<CryptoKey | null> {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    return null
  }

  try {
    await initDB()
    const storedKey = await indexedDBStorage.get<{ key: string; value: number[] }>(
      'metadata',
      ENCRYPTION_KEY_NAME
    )

    if (storedKey) {
      // 导入现有密钥
      const keyData = new Uint8Array(storedKey.value)
      return await window.crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      )
    }

    // 生成新密钥
    const key = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    )

    // 导出并存储密钥材料
    const exportedKey = await window.crypto.subtle.exportKey('raw', key)
    const saved = await indexedDBStorage.put('metadata', {
      key: ENCRYPTION_KEY_NAME,
      value: Array.from(new Uint8Array(exportedKey))
    })
    if (!saved) throw new Error('Failed to persist encryption key')

    return key
  } catch (e) {
    logger.error('Crypto key error:', e)
    return null
  }
}

// 加密 API Key
export async function encryptApiKey(apiKey: string): Promise<string> {
  if (!apiKey) return ''

  try {
    const key = await getCryptoKey()
    if (!key) return apiKey // 降级：如果不支持加密，返回原始值

    const encoder = new TextEncoder()
    const data = encoder.encode(apiKey)
    const iv = window.crypto.getRandomValues(new Uint8Array(12))

    const encrypted = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    )

    // 将 IV 和加密数据组合
    const combined = new Uint8Array(iv.length + encrypted.byteLength)
    combined.set(iv)
    combined.set(new Uint8Array(encrypted), iv.length)

    // 转换为 Base64
    return btoa(String.fromCharCode.apply(null, Array.from(combined)))
  } catch (e) {
    logger.error('Encryption error:', e)
    return apiKey // 降级：返回原始值
  }
}

// 解密 API Key
export async function decryptApiKey(encryptedKey: string): Promise<string> {
  if (!encryptedKey) return ''

  // 检查是否是未加密的旧格式
  if (!encryptedKey.includes(':') && encryptedKey.length < 100) {
    return encryptedKey
  }

  try {
    const key = await getCryptoKey()
    if (!key) return encryptedKey

    // 从 Base64 解码
    const combined = Uint8Array.from(atob(encryptedKey), c => c.charCodeAt(0))

    // 提取 IV 和加密数据
    const iv = combined.slice(0, 12)
    const encrypted = combined.slice(12)

    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    )

    const decoder = new TextDecoder()
    return decoder.decode(decrypted)
  } catch (e) {
    logger.error('Decryption error:', e)
    return encryptedKey // 降级：返回加密值
  }
}
