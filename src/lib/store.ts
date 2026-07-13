import { Language } from './i18n'
import { logger } from './logger'
import { BACKUP_DATA_VERSION, normalizeImportData } from './backupValidation'
import { MAX_BACKUP_FILE_BYTES } from './dataLimits'
import { createLocalId } from './localId'
import { clampCompletedPhaseCount } from './learningProgress'
import {
  initDB,
  getSettings as getIndexedDBSettings,
  saveSettings as saveIndexedDBSettings,
  getBooks as getIndexedDBBooks,
  getBook as getIndexedDBBook,
  saveBooks as saveIndexedDBBooks,
  saveBook as saveIndexedDBBook,
  saveExistingBook as saveExistingIndexedDBBook,
  restoreDeletedBook as restoreDeletedIndexedDBBook,
  deleteExistingBookById as deleteExistingIndexedDBBook
} from './db'

export type Theme = 'dark' | 'light' | 'cyber'
export type BookStatus = 'unread' | 'reading' | 'finished'

// 笔记记录
export interface NoteRecord {
  id: string
  type: 'note' | 'teaching'  // 普通笔记或旧版教学模拟记录
  content: string
  aiReview?: string          // 仅兼容旧版教学模拟记录，普通笔记不会生成
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
export interface PersonaAnswerAttempt {
  userAnswer: string
  answeredAt: number
  aiReview: string
  score: number
  passed: boolean
  reviewedAt: number
}

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
  attempts?: PersonaAnswerAttempt[] // 每次回答与点评，保留未通过记录
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
let persistenceErrors: unknown[] = []
const persistenceErrorListeners = new Set<(error: unknown) => void>()

function reportPersistenceError(error: unknown): void {
  persistenceErrors.push(error)
  persistenceErrorListeners.forEach(listener => {
    try {
      listener(error)
    } catch (listenerError) {
      logger.error('Persistence error listener failed:', listenerError)
    }
  })
}

export function subscribeToPersistenceErrors(listener: (error: unknown) => void): () => void {
  persistenceErrorListeners.add(listener)
  return () => persistenceErrorListeners.delete(listener)
}

function cloneForStorage<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))
}

function validScore(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : 0
}

function normalizeBookLearningState(book: Book): Book {
  const practiceRecords = (book.practiceRecords || []).map(record => {
    const overall = validScore(record.scores?.overall)
    return record.passed === (overall >= 60)
      ? record
      : { ...record, passed: overall >= 60 }
  })
  const qaPracticeRecords = (book.qaPracticeRecords || []).map(record => {
    const questions = (record.questions || []).map(question => {
      const attempts = (question.attempts || []).map(attempt => {
        const score = validScore(attempt.score)
        return { ...attempt, score, passed: score >= 60 }
      })
      const latestAttempt = attempts.at(-1)
      if (latestAttempt) {
        return {
          ...question,
          userAnswer: latestAttempt.userAnswer,
          answeredAt: latestAttempt.answeredAt,
          aiReview: latestAttempt.aiReview,
          score: latestAttempt.score,
          passed: latestAttempt.passed,
          reviewedAt: latestAttempt.reviewedAt,
          attempts
        }
      }
      if (question.score === undefined) {
        const { passed: _passed, ...unscoredQuestion } = question
        return unscoredQuestion
      }
      const score = validScore(question.score)
      return { ...question, score, passed: score >= 60 }
    })
    return {
      ...record,
      questions,
      allPassed: isQAPracticeRecordComplete(questions)
    }
  })
  const normalized = {
    ...book,
    currentPhase: clampCompletedPhaseCount(book.currentPhase, 6),
    practiceRecords,
    qaPracticeRecords
  }
  const bestScore = calculateFinalScore(normalized)
  const hasLearningActivity = normalized.currentPhase > 0 ||
    (normalized.noteRecords || []).length > 0 ||
    Object.keys(normalized.responses || {}).length > 0 ||
    practiceRecords.length > 0 ||
    qaPracticeRecords.length > 0
  const status: BookStatus = bestScore > 0
    ? 'finished'
    : hasLearningActivity
      ? 'reading'
      : 'unread'

  return { ...normalized, bestScore, status }
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
    booksCache = loadedBooks.map(normalizeBookLearningState)
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

export async function reloadSettingsFromPersistence(): Promise<AppSettings> {
  await settingsWriteQueue
  const storedSettings = await getIndexedDBSettings()
  const quotes = storedSettings.quotes || (storedSettings as any).customQuotes || []
  settingsCache = {
    ...DEFAULT_SETTINGS,
    ...storedSettings,
    theme: storedSettings.theme === 'cyber' ? 'light' : storedSettings.theme,
    quotes,
    quotesInitialized: storedSettings.quotesInitialized || false
  }
  return settingsCache
}

export function saveSettings(settings: AppSettings): void {
  settingsCache = settings
  const snapshot = cloneForStorage(settings)
  settingsWriteQueue = settingsWriteQueue
    .then(() => saveIndexedDBSettings(snapshot), () => saveIndexedDBSettings(snapshot))
    .catch(error => {
      reportPersistenceError(error)
      logger.error('Failed to persist settings to IndexedDB:', error)
    })
}

export function saveSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): AppSettings {
  const nextSettings = { ...settingsCache, [key]: value }
  saveSettings(nextSettings)
  return nextSettings
}

export function getBooks(): Book[] {
  return [...booksCache]
}

export function saveBooks(books: Book[]): void {
  booksCache = books.map(normalizeBookLearningState)
  const snapshot = cloneForStorage(booksCache)
  booksWriteQueue = booksWriteQueue
    .then(() => saveIndexedDBBooks(snapshot), () => saveIndexedDBBooks(snapshot))
    .catch(error => {
      reportPersistenceError(error)
      logger.error('Failed to persist books to IndexedDB:', error)
    })
}

function persistBook(book: Book): void {
  const snapshot = cloneForStorage(book)
  booksWriteQueue = booksWriteQueue
    .then(() => saveIndexedDBBook(snapshot), () => saveIndexedDBBook(snapshot))
    .catch(error => {
      reportPersistenceError(error)
      logger.error('Failed to persist book to IndexedDB:', error)
    })
}

function persistExistingBook(book: Book, expectedUpdatedAt: number): void {
  const snapshot = cloneForStorage(book)
  booksWriteQueue = booksWriteQueue
    .then(
      () => saveExistingIndexedDBBook(snapshot, expectedUpdatedAt),
      () => saveExistingIndexedDBBook(snapshot, expectedUpdatedAt)
    )
    .catch(error => {
      reportPersistenceError(error)
      logger.error('Failed to update existing book in IndexedDB:', error)
    })
}

function persistRestoredBook(book: Book): void {
  const snapshot = cloneForStorage(book)
  booksWriteQueue = booksWriteQueue
    .then(() => restoreDeletedIndexedDBBook(snapshot), () => restoreDeletedIndexedDBBook(snapshot))
    .catch(error => {
      reportPersistenceError(error)
      logger.error('Failed to restore deleted book in IndexedDB:', error)
    })
}

function persistBookDeletion(id: string, expectedUpdatedAt: number): void {
  booksWriteQueue = booksWriteQueue
    .then(
      () => deleteExistingIndexedDBBook(id, expectedUpdatedAt),
      () => deleteExistingIndexedDBBook(id, expectedUpdatedAt)
    )
    .catch(error => {
      reportPersistenceError(error)
      logger.error('Failed to delete book from IndexedDB:', error)
    })
}

export async function flushPendingStoreWrites(): Promise<void> {
  await Promise.all([settingsWriteQueue, booksWriteQueue])
  if (persistenceErrors.length === 0) return

  const [error] = persistenceErrors.splice(0, persistenceErrors.length)
  throw error instanceof Error ? error : new Error('Failed to persist local data')
}

export function addBook(name: string, author?: string, cover?: string, description?: string, tags?: BookTag[], documentContent?: string): Book {
  const now = Date.now()
  const newBook: Book = {
    id: createLocalId(),
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
    createdAt: now,
    updatedAt: now
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
  if (!existingBook) {
    logger.error('❌ updateBook: 找不到书籍', id)
    throw new Error(`BOOK_NOT_FOUND:${id}`)
  }

  logger.debug('🔄 updateBook:', { id, updates, oldStatus: existingBook.status })
  const updatedBook = normalizeBookLearningState({ ...existingBook, ...updates, updatedAt: Date.now() })
  booksCache = booksCache.map(book => book.id === id ? updatedBook : book)
  persistExistingBook(updatedBook, existingBook.updatedAt)
  logger.debug('🔄 updateBook 完成，新状态:', updatedBook.status)
}

export function deleteBook(id: string): void {
  const existingBook = booksCache.find(book => book.id === id)
  if (!existingBook) throw new Error(`BOOK_NOT_FOUND:${id}`)
  booksCache = booksCache.filter(book => book.id !== id)
  persistBookDeletion(id, existingBook.updatedAt)
}

export function restoreBook(book: Book): void {
  const restoredBook = normalizeBookLearningState(cloneForStorage(book))
  if (booksCache.some(existing => existing.id === restoredBook.id)) {
    throw new Error(`BOOK_ALREADY_EXISTS:${restoredBook.id}`)
  }
  booksCache = [restoredBook, ...booksCache]
  persistRestoredBook(restoredBook)
}

/** Reset in-memory state after the browser database has been deleted. */
export function resetStoreCache(): void {
  settingsCache = { ...DEFAULT_SETTINGS }
  booksCache = []
  initializationPromise = null
  settingsWriteQueue = Promise.resolve()
  booksWriteQueue = Promise.resolve()
  persistenceErrors = []
}

export function getBook(id: string): Book | undefined {
  return getBooks().find(b => b.id === id)
}

export async function reloadBookFromPersistence(id: string): Promise<Book | undefined> {
  await booksWriteQueue
  const storedBook = await getIndexedDBBook(id)

  if (!storedBook) {
    booksCache = booksCache.filter(book => book.id !== id)
    return undefined
  }

  const normalizedBook = normalizeBookLearningState(storedBook)
  booksCache = booksCache.map(book => book.id === id ? normalizedBook : book)
  if (!booksCache.some(book => book.id === id)) {
    booksCache = [normalizedBook, ...booksCache]
  }
  return normalizedBook
}

export async function reloadBooksFromPersistence(): Promise<Book[]> {
  await booksWriteQueue
  const storedBooks = await getIndexedDBBooks()
  booksCache = (Array.isArray(storedBooks) ? storedBooks : []).map(normalizeBookLearningState)
  return getBooks()
}

function replaceBookInCache(book: Book): void {
  const existingBook = booksCache.find(existing => existing.id === book.id)
  if (!existingBook) throw new Error(`BOOK_NOT_FOUND:${book.id}`)
  const normalizedBook = normalizeBookLearningState(book)
  booksCache = booksCache.map(existing => existing.id === book.id ? normalizedBook : existing)
  persistExistingBook(normalizedBook, existingBook.updatedAt)
}


export function addPracticeRecord(bookId: string, record: Omit<PracticeRecord, 'id' | 'bookId' | 'createdAt'>): PracticeRecord {
  const book = getBook(bookId)
  if (!book) throw new Error('Book not found')
  
  const newRecord: PracticeRecord = {
    ...record,
    passed: validScore(record.scores.overall) >= 60,
    id: createLocalId(),
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
  
  return newRecord
}

export function getPracticeRecords(bookId: string): PracticeRecord[] {
  const book = getBook(bookId)
  return book?.practiceRecords || []
}

export function deletePracticeRecord(bookId: string, recordId: string): void {
  const book = getBook(bookId)
  if (!book) throw new Error(`BOOK_NOT_FOUND:${bookId}`)
  if (!book.practiceRecords?.some(record => record.id === recordId)) {
    throw new Error(`PRACTICE_RECORD_NOT_FOUND:${recordId}`)
  }

  const updatedBook = {
    ...book,
    practiceRecords: book.practiceRecords.filter(record => record.id !== recordId),
    updatedAt: Date.now()
  }
  updatedBook.bestScore = calculateFinalScore(updatedBook)
  replaceBookInCache(updatedBook)
  
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
    id: createLocalId(),
    bookId,
    allPassed: isQAPracticeRecordComplete(record.questions),
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
  
  return newRecord
}

export function updateQAPracticeRecord(bookId: string, recordId: string, updates: Partial<QAPracticeRecord>): void {
  const book = getBook(bookId)
  if (!book) throw new Error(`BOOK_NOT_FOUND:${bookId}`)
  if (!book.qaPracticeRecords) throw new Error(`QA_RECORD_NOT_FOUND:${recordId}`)
  
  const index = book.qaPracticeRecords.findIndex(r => r.id === recordId)
  if (index === -1) throw new Error(`QA_RECORD_NOT_FOUND:${recordId}`)

  const qaPracticeRecords = book.qaPracticeRecords.map((record, recordIndex) => {
    if (recordIndex !== index) return record
    const updatedRecord = { ...record, ...updates, updatedAt: Date.now() }
    return {
      ...updatedRecord,
      allPassed: isQAPracticeRecordComplete(updatedRecord.questions)
    }
  })
  const updatedBook = { ...book, qaPracticeRecords, updatedAt: Date.now() }
  updatedBook.bestScore = calculateFinalScore(updatedBook)
  replaceBookInCache(updatedBook)
}

export function deleteQAPracticeRecord(bookId: string, recordId: string): void {
  const book = getBook(bookId)
  if (!book) throw new Error(`BOOK_NOT_FOUND:${bookId}`)
  if (!book.qaPracticeRecords?.some(record => record.id === recordId)) {
    throw new Error(`QA_RECORD_NOT_FOUND:${recordId}`)
  }

  const updatedBook = {
    ...book,
    qaPracticeRecords: book.qaPracticeRecords.filter(record => record.id !== recordId),
    updatedAt: Date.now()
  }
  updatedBook.bestScore = calculateFinalScore(updatedBook)
  replaceBookInCache(updatedBook)
  
}

// 检查是否完成所有费曼实践（教学+问答）
export function isQAPracticeRecordComplete(recordOrQuestions: QAPracticeRecord | PersonaQuestion[]): boolean {
  const questions = Array.isArray(recordOrQuestions) ? recordOrQuestions : recordOrQuestions.questions
  return questions.length === 3 && questions.every(question =>
    typeof question.score === 'number' &&
    Number.isFinite(question.score) &&
    question.score >= 60 &&
    question.score <= 100
  )
}

export function checkFeynmanComplete(bookId: string): boolean {
  const book = getBook(bookId)
  if (!book) return false
  
  // 1. 检查教学实践：取所有记录中的最高分
  const teachingMaxScore = book.practiceRecords && book.practiceRecords.length > 0
    ? book.practiceRecords.reduce((max, r) => Math.max(max, validScore(r.scores?.overall)), 0)
    : 0
  const teachingPassed = teachingMaxScore >= 60
  
  // 2. 只有一组问题全部通过，才允许问答成绩参与完成判定。
  const completedQARecords = (book.qaPracticeRecords || []).filter(isQAPracticeRecordComplete)
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
    ? book.practiceRecords.reduce((max, r) => Math.max(max, validScore(r.scores?.overall)), 0)
    : 0

  // 问答未全部通过时不产生综合得分。
  const completedQARecords = (book.qaPracticeRecords || []).filter(isQAPracticeRecordComplete)
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
export const DATA_VERSION = BACKUP_DATA_VERSION

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

export type BackupDownloadResult = 'saved' | 'download-started'

interface BackupFileHandle {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>
    close: () => Promise<void>
  }>
}

interface BackupSavePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: Array<{
      description: string
      accept: Record<string, string[]>
    }>
  }) => Promise<BackupFileHandle>
}

// 只有系统保存流程完成时才能直接确认备份成功；普通下载需由用户确认文件已落盘。
export async function downloadDataBackup(): Promise<BackupDownloadResult> {
  const data = exportAllData()
  const blob = new Blob([data], { type: 'application/json' })
  if (blob.size > MAX_BACKUP_FILE_BYTES) {
    throw new Error(`备份文件超过 ${MAX_BACKUP_FILE_BYTES / 1024 / 1024} MB，无法在浏览器中安全导出`)
  }
  const fileName = `feynman-backup-${new Date().toISOString().split('T')[0]}.json`
  const picker = (window as BackupSavePickerWindow).showSaveFilePicker

  if (typeof picker === 'function') {
    const handle = await picker.call(window, {
      suggestedName: fileName,
      types: [{
        description: 'Feynman Reader backup',
        accept: { 'application/json': ['.json'] }
      }]
    })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return 'saved'
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  return 'download-started'
}

// 验证导入数据的结构
export function validateImportData(data: unknown): { valid: boolean; error?: string } {
  const result = normalizeImportData(data)
  return result.valid ? { valid: true } : { valid: false, error: result.error }
}

// 导入数据（仅验证，不应用）
export function previewImportData(jsonString: string): { valid: boolean; data?: ExportData; error?: string } {
  try {
    const data = JSON.parse(jsonString)
    const result = normalizeImportData(data)
    if (!result.valid) {
      return { valid: false, error: result.error }
    }
    return { valid: true, data: result.data }
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
  const normalized = normalizeImportData(data)
  if (!normalized.valid) throw new Error(normalized.error)
  data = normalized.data

  const {
    importSettings = true,
    importBooks = true,
    mergeBooks = true
  } = options

  // 导入设置
  if (importSettings && data.settings) {
    const currentSettings = getSettings()
    const importedSettings = data.settings
    saveSettings({
      ...currentSettings,
      language: importedSettings.language === 'zh' || importedSettings.language === 'en'
        ? importedSettings.language
        : currentSettings.language,
      theme: importedSettings.theme === 'dark' || importedSettings.theme === 'light'
        ? importedSettings.theme
        : currentSettings.theme,
      hideApiKeyAlert: currentSettings.hideApiKeyAlert,
      aiDataConsent: currentSettings.aiDataConsent,
      quotes: Array.isArray(importedSettings.quotes)
        ? importedSettings.quotes
        : currentSettings.quotes,
      quotesInitialized: typeof importedSettings.quotesInitialized === 'boolean'
        ? importedSettings.quotesInitialized
        : currentSettings.quotesInitialized,
      apiKey: currentSettings.apiKey
    })
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
