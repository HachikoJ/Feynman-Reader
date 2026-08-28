import { Language } from './i18n'
import { logger } from './logger'
import {
  BACKUP_DATA_VERSION,
  normalizeBookLists,
  normalizeBookRelations,
  normalizeImportData
} from './backupValidation'
import {
  MAX_BACKUP_FILE_BYTES,
  MAX_BACKUP_PART_PAYLOAD_BYTES,
  MAX_BACKUP_PARTS
} from './dataLimits'
import { createLocalId } from './localId'
import { clampCompletedPhaseCount } from './learningProgress'
import {
  AIUsageRecord,
  AIUsageSummary,
  MAX_AI_USAGE_RECORDS,
  summarizeAIUsage
} from './aiUsage'
import {
  initDB,
  getSettings as getIndexedDBSettings,
  saveSettings as saveIndexedDBSettings,
  getBooks as getIndexedDBBooks,
  getAIUsageRecords as getIndexedDBAIUsageRecords,
  getBookOrganization as getIndexedDBBookOrganization,
  getBook as getIndexedDBBook,
  saveBooks as saveIndexedDBBooks,
  saveAIUsageRecords as saveIndexedDBAIUsageRecords,
  saveBookOrganization as saveIndexedDBBookOrganization,
  saveBook as saveIndexedDBBook,
  saveExistingBook as saveExistingIndexedDBBook,
  restoreDeletedBook as restoreDeletedIndexedDBBook,
  deleteExistingBookById as deleteExistingIndexedDBBook
} from './db'
import type {
  BookList,
  BookOrganizationData,
  BookOrganizationSnapshot,
  BookRelation,
  BookRelationType
} from './bookRelations'
import { getBookRelationIdentity } from './bookRelations'
import { migrateToTokenDanceAfterSunset } from './aiProviderPolicy'
import { createSampleBook, SAMPLE_BOOK_DATA_VERSION, SAMPLE_BOOK_SEEDED_KEY } from './sampleBook'

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
  sessionId?: string       // 教学与后续角色问答所属的同一学习会话
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
  sessionId?: string       // 绑定生成这些问题时采用的教学会话
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
  /** Marks the bundled first-visit example; users can delete it like any other book. */
  isSample?: boolean
  /** Allows bundled sample content to be refreshed without touching user books. */
  sampleDataVersion?: number
}

export interface CustomQuote {
  text: string
  author: string
  isPreset?: boolean  // 标记是否为预设金句
}

export interface AppSettings {
  apiKey: string
  aiProvider?: 'tokendance' | 'deepseek'
  language: Language
  theme: Theme
  hideApiKeyAlert: boolean
  aiDataConsent?: boolean
  /** Enables the opt-in assistant memory layer. Only explicit memory requests are stored. */
  assistantMemoryEnabled?: boolean
  quotes: CustomQuote[]  // 改名，包含预设和自定义
  quotesInitialized?: boolean  // 标记是否已初始化预设金句
}

const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  aiProvider: 'tokendance',
  language: 'zh',
  theme: 'light',
  hideApiKeyAlert: false,
  aiDataConsent: false,
  assistantMemoryEnabled: true,
  quotes: [],
  quotesInitialized: false
}

let settingsCache: AppSettings = DEFAULT_SETTINGS
let booksCache: Book[] = []
let aiUsageCache: AIUsageRecord[] = []
let bookListsCache: BookList[] = []
let bookRelationsCache: BookRelation[] = []
let initializationPromise: Promise<void> | null = null
let settingsWriteQueue = Promise.resolve()
let booksWriteQueue = Promise.resolve()
let aiUsageWriteQueue = Promise.resolve()
let bookOrganizationWriteQueue = Promise.resolve()
let persistenceErrors: unknown[] = []
const persistenceErrorListeners = new Set<(error: unknown) => void>()
const aiUsageListeners = new Set<() => void>()

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

function legacyLearningSessionId(bookId: string): string {
  return `legacy:${bookId}`
}

function normalizeBookLearningState(book: Book): Book {
  const legacySessionId = legacyLearningSessionId(book.id)
  const practiceRecords = (book.practiceRecords || []).map(record => {
    const overall = validScore(record.scores?.overall)
    return {
      ...record,
      sessionId: record.sessionId || legacySessionId,
      passed: overall >= 60
    }
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
      sessionId: record.sessionId || legacySessionId,
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
  const status: BookStatus = normalized.currentPhase === 6 && bestScore > 0
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
    const [settings, books, aiUsageRecords, bookOrganization] = await Promise.all([
      getIndexedDBSettings(),
      getIndexedDBBooks(),
      getIndexedDBAIUsageRecords(),
      getIndexedDBBookOrganization()
    ])

    const quotes = settings.quotes || (settings as any).customQuotes || []
    const theme = settings.theme === 'cyber' ? 'light' : settings.theme
    const migratedSettings = migrateToTokenDanceAfterSunset({
      ...DEFAULT_SETTINGS,
      ...settings,
      theme,
      quotes,
      quotesInitialized: settings.quotesInitialized || false
    })
    settingsCache = migratedSettings
    if (settings.theme === 'cyber' || migratedSettings !== settings) {
      saveSettings(migratedSettings)
    }
    const loadedBooks = Array.isArray(books) ? books : []
    booksCache = loadedBooks.map(normalizeBookLearningState)
    const legacySample = booksCache.find(book => book.isSample && book.id === 'sample-the-kite-runner')
    if (legacySample && legacySample.sampleDataVersion !== SAMPLE_BOOK_DATA_VERSION) {
      const refreshedSample = createSampleBook()
      booksCache = booksCache.map(book => book.id === refreshedSample.id ? refreshedSample : book)
      await saveIndexedDBBook(refreshedSample)
    }
    if (booksCache.length === 0 && process.env.NODE_ENV !== 'test' && typeof localStorage !== 'undefined' && !localStorage.getItem(SAMPLE_BOOK_SEEDED_KEY)) {
      const sampleBook = createSampleBook()
      booksCache = [sampleBook]
      localStorage.setItem(SAMPLE_BOOK_SEEDED_KEY, 'true')
      await saveIndexedDBBooks([sampleBook])
    }
    aiUsageCache = Array.isArray(aiUsageRecords)
      ? aiUsageRecords.slice(-MAX_AI_USAGE_RECORDS)
      : []
    const bookIds = new Set(loadedBooks.map(book => book.id))
    const normalizedLists = normalizeBookLists(bookOrganization.lists, bookIds)
    const normalizedRelations = normalizeBookRelations(bookOrganization.relations, bookIds)
    if (!normalizedLists.valid) throw new Error(normalizedLists.error)
    if (!normalizedRelations.valid) throw new Error(normalizedRelations.error)
    bookListsCache = normalizedLists.data
    bookRelationsCache = normalizedRelations.data

    if (bookListsCache.length === 0 && bookRelationsCache.length === 0) {
      if (typeof localStorage !== 'undefined') {
        const legacyLists = localStorage.getItem('feynman-book-lists')
        const legacyRelations = localStorage.getItem('feynman-book-relations')
        if (legacyLists || legacyRelations) {
          try {
            const migratedLists = normalizeBookLists(legacyLists ? JSON.parse(legacyLists) : [], bookIds)
            const migratedRelations = normalizeBookRelations(legacyRelations ? JSON.parse(legacyRelations) : [], bookIds)
            if (migratedLists.valid && migratedRelations.valid) {
              bookListsCache = migratedLists.data
              bookRelationsCache = migratedRelations.data
              await saveIndexedDBBookOrganization({ lists: bookListsCache, relations: bookRelationsCache })
              localStorage.removeItem('feynman-book-lists')
              localStorage.removeItem('feynman-book-relations')
            }
          } catch (error) {
            logger.warn('Legacy book organization data could not be migrated:', error)
          }
        }
      }
    }
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
  settingsCache = migrateToTokenDanceAfterSunset({
    ...DEFAULT_SETTINGS,
    ...storedSettings,
    theme: storedSettings.theme === 'cyber' ? 'light' : storedSettings.theme,
    quotes,
    quotesInitialized: storedSettings.quotesInitialized || false
  })
  return settingsCache
}

export function saveSettings(settings: AppSettings): void {
  settingsCache = migrateToTokenDanceAfterSunset(settings)
  const snapshot = cloneForStorage(settingsCache)
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

export function getAIUsageRecords(): AIUsageRecord[] {
  return [...aiUsageCache]
}

export function getBookLists(): BookList[] {
  return cloneForStorage(bookListsCache)
}

export function getBookRelations(): BookRelation[] {
  return cloneForStorage(bookRelationsCache)
}

function persistBookOrganization(): void {
  const snapshot: BookOrganizationData = cloneForStorage({
    lists: bookListsCache,
    relations: bookRelationsCache
  })
  bookOrganizationWriteQueue = bookOrganizationWriteQueue
    .then(() => saveIndexedDBBookOrganization(snapshot), () => saveIndexedDBBookOrganization(snapshot))
    .catch(error => {
      reportPersistenceError(error)
      logger.error('Failed to persist book lists and relations:', error)
    })
}

function replaceBookOrganization(lists: BookList[], relations: BookRelation[]): void {
  const bookIds = new Set(booksCache.map(book => book.id))
  const normalizedLists = normalizeBookLists(lists, bookIds)
  const normalizedRelations = normalizeBookRelations(relations, bookIds)
  if (!normalizedLists.valid) throw new Error(normalizedLists.error)
  if (!normalizedRelations.valid) throw new Error(normalizedRelations.error)
  bookListsCache = normalizedLists.data
  bookRelationsCache = normalizedRelations.data
  persistBookOrganization()
}

export function createBookList(name: string, description?: string): BookList {
  const now = Date.now()
  const list: BookList = {
    id: createLocalId(),
    name: name.trim(),
    ...(description?.trim() ? { description: description.trim() } : {}),
    bookIds: [],
    createdAt: now,
    updatedAt: now
  }
  replaceBookOrganization([...bookListsCache, list], bookRelationsCache)
  return cloneForStorage(list)
}

export function updateBookList(listId: string, updates: Pick<Partial<BookList>, 'name' | 'description'>): BookList {
  const existing = bookListsCache.find(list => list.id === listId)
  if (!existing) throw new Error(`BOOK_LIST_NOT_FOUND:${listId}`)
  const updated: BookList = {
    ...existing,
    ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
    ...(updates.description?.trim() ? { description: updates.description.trim() } : { description: undefined }),
    updatedAt: Date.now()
  }
  replaceBookOrganization(bookListsCache.map(list => list.id === listId ? updated : list), bookRelationsCache)
  return cloneForStorage(updated)
}

export function deleteBookList(listId: string): void {
  if (!bookListsCache.some(list => list.id === listId)) throw new Error(`BOOK_LIST_NOT_FOUND:${listId}`)
  replaceBookOrganization(bookListsCache.filter(list => list.id !== listId), bookRelationsCache)
}

export function setBookListMembership(listId: string, bookId: string, included: boolean): void {
  if (!booksCache.some(book => book.id === bookId)) throw new Error(`BOOK_NOT_FOUND:${bookId}`)
  const list = bookListsCache.find(item => item.id === listId)
  if (!list) throw new Error(`BOOK_LIST_NOT_FOUND:${listId}`)
  const bookIds = included
    ? Array.from(new Set([...list.bookIds, bookId]))
    : list.bookIds.filter(id => id !== bookId)
  const updated = { ...list, bookIds, updatedAt: Date.now() }
  replaceBookOrganization(bookListsCache.map(item => item.id === listId ? updated : item), bookRelationsCache)
}

export function addBookRelation(fromBookId: string, toBookId: string, type: BookRelationType, note?: string): BookRelation {
  if (fromBookId === toBookId) throw new Error('BOOK_RELATION_SELF_REFERENCE')
  if (!booksCache.some(book => book.id === fromBookId) || !booksCache.some(book => book.id === toBookId)) {
    throw new Error('BOOK_RELATION_BOOK_NOT_FOUND')
  }
  const identity = getBookRelationIdentity(fromBookId, toBookId, type)
  if (bookRelationsCache.some(relation =>
    getBookRelationIdentity(relation.fromBookId, relation.toBookId, relation.type) === identity
  )) throw new Error('BOOK_RELATION_EXISTS')

  const relation: BookRelation = {
    id: createLocalId(),
    fromBookId,
    toBookId,
    type,
    ...(note?.trim() ? { note: note.trim() } : {}),
    createdAt: Date.now()
  }
  replaceBookOrganization(bookListsCache, [...bookRelationsCache, relation])
  return cloneForStorage(relation)
}

export function deleteBookRelation(relationId: string): void {
  if (!bookRelationsCache.some(relation => relation.id === relationId)) {
    throw new Error(`BOOK_RELATION_NOT_FOUND:${relationId}`)
  }
  replaceBookOrganization(bookListsCache, bookRelationsCache.filter(relation => relation.id !== relationId))
}

export function getBookOrganizationSnapshot(bookId: string): BookOrganizationSnapshot {
  return {
    listIds: bookListsCache.filter(list => list.bookIds.includes(bookId)).map(list => list.id),
    relations: cloneForStorage(bookRelationsCache.filter(relation =>
      relation.fromBookId === bookId || relation.toBookId === bookId
    ))
  }
}

export function restoreBookOrganizationSnapshot(bookId: string, snapshot: BookOrganizationSnapshot): void {
  const existingBookIds = new Set(booksCache.map(book => book.id))
  const listIds = new Set(snapshot.listIds)
  const lists = bookListsCache.map(list => listIds.has(list.id)
    ? { ...list, bookIds: Array.from(new Set([...list.bookIds, bookId])), updatedAt: Date.now() }
    : list)
  const relations = [
    ...bookRelationsCache,
    ...snapshot.relations.filter(relation =>
      existingBookIds.has(relation.fromBookId) &&
      existingBookIds.has(relation.toBookId) &&
      !bookRelationsCache.some(existing =>
        existing.id === relation.id ||
        getBookRelationIdentity(existing.fromBookId, existing.toBookId, existing.type) ===
          getBookRelationIdentity(relation.fromBookId, relation.toBookId, relation.type)
      )
    )
  ]
  replaceBookOrganization(lists, relations)
}

export function getAIUsageSummary(): AIUsageSummary {
  return summarizeAIUsage(aiUsageCache)
}

export function subscribeToAIUsage(listener: () => void): () => void {
  aiUsageListeners.add(listener)
  return () => aiUsageListeners.delete(listener)
}

export function addAIUsageRecord(record: Omit<AIUsageRecord, 'id'>): AIUsageRecord {
  const savedRecord: AIUsageRecord = { ...record, id: createLocalId() }
  aiUsageCache = [...aiUsageCache, savedRecord].slice(-MAX_AI_USAGE_RECORDS)
  const snapshot = cloneForStorage(aiUsageCache)
  aiUsageWriteQueue = aiUsageWriteQueue
    .then(() => saveIndexedDBAIUsageRecords(snapshot), () => saveIndexedDBAIUsageRecords(snapshot))
    .catch(error => {
      reportPersistenceError(error)
      logger.error('Failed to persist AI usage records to IndexedDB:', error)
    })
  aiUsageListeners.forEach(listener => listener())
  return savedRecord
}

export function replaceAIUsageRecords(records: AIUsageRecord[]): void {
  aiUsageCache = records.slice(-MAX_AI_USAGE_RECORDS)
  const snapshot = cloneForStorage(aiUsageCache)
  aiUsageWriteQueue = aiUsageWriteQueue
    .then(() => saveIndexedDBAIUsageRecords(snapshot), () => saveIndexedDBAIUsageRecords(snapshot))
    .catch(error => {
      reportPersistenceError(error)
      logger.error('Failed to replace AI usage records in IndexedDB:', error)
    })
  aiUsageListeners.forEach(listener => listener())
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
  await Promise.all([settingsWriteQueue, booksWriteQueue, aiUsageWriteQueue, bookOrganizationWriteQueue])
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
  bookListsCache = bookListsCache.map(list => ({
    ...list,
    bookIds: list.bookIds.filter(bookId => bookId !== id),
    ...(list.bookIds.includes(id) ? { updatedAt: Date.now() } : {})
  }))
  bookRelationsCache = bookRelationsCache.filter(relation => relation.fromBookId !== id && relation.toBookId !== id)
  persistBookOrganization()
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
  aiUsageCache = []
  bookListsCache = []
  bookRelationsCache = []
  initializationPromise = null
  settingsWriteQueue = Promise.resolve()
  booksWriteQueue = Promise.resolve()
  aiUsageWriteQueue = Promise.resolve()
  bookOrganizationWriteQueue = Promise.resolve()
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

export async function reloadBookOrganizationFromPersistence(): Promise<BookOrganizationData> {
  await bookOrganizationWriteQueue
  const stored = await getIndexedDBBookOrganization()
  const bookIds = new Set(booksCache.map(book => book.id))
  const lists = normalizeBookLists(stored.lists, bookIds)
  if (!lists.valid) throw new Error(lists.error)
  const relations = normalizeBookRelations(stored.relations, bookIds)
  if (!relations.valid) throw new Error(relations.error)
  bookListsCache = lists.data
  bookRelationsCache = relations.data
  return cloneForStorage({ lists: bookListsCache, relations: bookRelationsCache })
}

function replaceBookInCache(book: Book): void {
  const existingBook = booksCache.find(existing => existing.id === book.id)
  if (!existingBook) throw new Error(`BOOK_NOT_FOUND:${book.id}`)
  const normalizedBook = normalizeBookLearningState(book)
  booksCache = booksCache.map(existing => existing.id === book.id ? normalizedBook : existing)
  persistExistingBook(normalizedBook, existingBook.updatedAt)
}


export function addPracticeRecord(
  bookId: string,
  record: Omit<PracticeRecord, 'id' | 'bookId' | 'createdAt'> & { sessionId: string }
): PracticeRecord {
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

export function addQAPracticeRecord(
  bookId: string,
  record: Omit<QAPracticeRecord, 'id' | 'bookId' | 'createdAt' | 'updatedAt'> & { sessionId: string }
): QAPracticeRecord {
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
    const updatedRecord = { ...record, ...updates, sessionId: record.sessionId, updatedAt: Date.now() }
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

// 计算书籍的最终总分
export function calculateFinalScore(book: Book): number {
  if (!book) return 0
  const legacySessionId = legacyLearningSessionId(book.id)
  const teachingScores = new Map<string, number>()

  for (const record of book.practiceRecords || []) {
    const score = validScore(record.scores?.overall)
    if (score < 60) continue
    const sessionId = record.sessionId || legacySessionId
    teachingScores.set(sessionId, Math.max(teachingScores.get(sessionId) || 0, score))
  }

  let bestCombinedScore = 0
  for (const record of (book.qaPracticeRecords || []).filter(isQAPracticeRecordComplete)) {
    const sessionId = record.sessionId || legacySessionId
    const teachingScore = teachingScores.get(sessionId) || 0
    if (teachingScore < 60) continue

    const qaScore = record.questions.reduce((sum, question) => sum + validScore(question.score), 0) / record.questions.length
    if (qaScore < 60) continue
    bestCombinedScore = Math.max(bestCombinedScore, (teachingScore + qaScore) / 2)
  }

  return Math.round(bestCombinedScore)
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
  aiUsageRecords: AIUsageRecord[]
  bookLists: BookList[]
  bookRelations: BookRelation[]
}

function createExportData(): ExportData {
  const settings = getSettings()
  const books = getBooks()
  const aiUsageRecords = getAIUsageRecords()
  const bookLists = getBookLists()
  const bookRelations = getBookRelations()

  return {
    version: DATA_VERSION,
    exportDate: Date.now(),
    settings: {
      ...settings,
      // 导出时移除 API Key 的明文，用占位符替代
      apiKey: settings.apiKey ? '[REDACTED]' : ''
    },
    books,
    aiUsageRecords,
    bookLists,
    bookRelations
  }
}

// 导出所有数据为 JSON 字符串
export function exportAllData(): string {
  return JSON.stringify(createExportData(), null, 2)
}

export interface BackupDownloadResult {
  status: 'saved' | 'download-started'
  fileCount: number
  format: 'json' | 'multipart'
}

export interface BackupDownloadOptions {
  singleFileLimitBytes?: number
  partPayloadBytes?: number
}

const BACKUP_PART_MAGIC = 'FEYNMAN_READER_BACKUP_PART_V1'
const BACKUP_PART_HEADER_END = '\n\n'

interface BackupFileHandle {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>
    close: () => Promise<void>
  }>
}

interface BackupDirectoryHandle {
  getFileHandle: (name: string, options: { create: true }) => Promise<BackupFileHandle>
}

interface BackupSavePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: Array<{
      description: string
      accept: Record<string, string[]>
    }>
  }) => Promise<BackupFileHandle>
  showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<BackupDirectoryHandle>
}

function* serializeBackup(data: ExportData): Generator<string> {
  yield `{"version":${data.version},"exportDate":${data.exportDate},"settings":${JSON.stringify(data.settings)},"books":[`
  for (let index = 0; index < data.books.length; index += 1) {
    if (index > 0) yield ','
    yield JSON.stringify(data.books[index])
  }
  yield '],"aiUsageRecords":['
  for (let index = 0; index < data.aiUsageRecords.length; index += 1) {
    if (index > 0) yield ','
    yield JSON.stringify(data.aiUsageRecords[index])
  }
  yield '],"bookLists":['
  for (let index = 0; index < data.bookLists.length; index += 1) {
    if (index > 0) yield ','
    yield JSON.stringify(data.bookLists[index])
  }
  yield '],"bookRelations":['
  for (let index = 0; index < data.bookRelations.length; index += 1) {
    if (index > 0) yield ','
    yield JSON.stringify(data.bookRelations[index])
  }
  yield ']}'
}

function getSerializedBackupSize(data: ExportData, encoder: TextEncoder): number {
  let total = 0
  for (const segment of serializeBackup(data)) total += encoder.encode(segment).byteLength
  return total
}

function createSingleBackupBlob(data: ExportData): Blob {
  return new Blob([...serializeBackup(data)], { type: 'application/json' })
}

function getBackupPartHeader(backupId: string, part: number, total: number): string {
  return `${BACKUP_PART_MAGIC}\n${backupId}\n${part}\n${total}${BACKUP_PART_HEADER_END}`
}

function* createBackupPartBlobs(
  data: ExportData,
  backupId: string,
  totalParts: number,
  partPayloadBytes: number,
  encoder: TextEncoder
): Generator<{ part: number; blob: Blob }> {
  let part = 1
  let partSize = 0
  let chunks: ArrayBuffer[] = []

  for (const segment of serializeBackup(data)) {
    const encoded = encoder.encode(segment)
    let offset = 0

    while (offset < encoded.byteLength) {
      const bytesToCopy = Math.min(partPayloadBytes - partSize, encoded.byteLength - offset)
      const chunk = new Uint8Array(bytesToCopy)
      chunk.set(encoded.subarray(offset, offset + bytesToCopy))
      chunks.push(chunk.buffer)
      offset += bytesToCopy
      partSize += bytesToCopy

      if (partSize === partPayloadBytes) {
        yield {
          part,
          blob: new Blob([getBackupPartHeader(backupId, part, totalParts), ...chunks], {
            type: 'application/octet-stream'
          })
        }
        part += 1
        partSize = 0
        chunks = []
      }
    }
  }

  if (chunks.length > 0) {
    yield {
      part,
      blob: new Blob([getBackupPartHeader(backupId, part, totalParts), ...chunks], {
        type: 'application/octet-stream'
      })
    }
  }
}

async function writeBackupBlob(handle: BackupFileHandle, blob: Blob): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(blob)
  await writable.close()
}

function startBrowserDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function backupPartFileName(date: string, backupId: string, part: number, total: number): string {
  const width = Math.max(3, String(total).length)
  return `feynman-backup-${date}-${backupId}-part-${String(part).padStart(width, '0')}-of-${String(total).padStart(width, '0')}.feynman-part`
}

// 只有系统文件/目录写入完成时才确认备份成功；普通下载仍需由用户确认文件已落盘。
export async function downloadDataBackup(options: BackupDownloadOptions = {}): Promise<BackupDownloadResult> {
  const singleFileLimitBytes = Math.floor(options.singleFileLimitBytes ?? MAX_BACKUP_FILE_BYTES)
  const partPayloadBytes = Math.floor(options.partPayloadBytes ?? MAX_BACKUP_PART_PAYLOAD_BYTES)
  if (
    singleFileLimitBytes <= 0 ||
    singleFileLimitBytes > MAX_BACKUP_FILE_BYTES ||
    partPayloadBytes <= 0 ||
    partPayloadBytes > MAX_BACKUP_FILE_BYTES
  ) {
    throw new Error('备份分卷参数无效')
  }

  const data = createExportData()
  const encoder = new TextEncoder()
  const payloadBytes = getSerializedBackupSize(data, encoder)
  const date = new Date(data.exportDate).toISOString().split('T')[0]
  const pickerWindow = window as BackupSavePickerWindow

  if (payloadBytes <= singleFileLimitBytes) {
    const blob = createSingleBackupBlob(data)
    const fileName = `feynman-backup-${date}.json`
    const picker = pickerWindow.showSaveFilePicker

    if (typeof picker === 'function') {
      const handle = await picker.call(window, {
        suggestedName: fileName,
        types: [{
          description: 'Feynman Reader backup',
          accept: { 'application/json': ['.json'] }
        }]
      })
      await writeBackupBlob(handle, blob)
      return { status: 'saved', fileCount: 1, format: 'json' }
    }

    startBrowserDownload(blob, fileName)
    return { status: 'download-started', fileCount: 1, format: 'json' }
  }

  const totalParts = Math.ceil(payloadBytes / partPayloadBytes)
  if (totalParts > MAX_BACKUP_PARTS) {
    throw new Error(`备份数据过大，分卷数量超过 ${MAX_BACKUP_PARTS} 个`)
  }

  const backupId = createLocalId()
  const directoryPicker = pickerWindow.showDirectoryPicker
  if (typeof directoryPicker === 'function') {
    const directory = await directoryPicker.call(window, { mode: 'readwrite' })
    for (const { part, blob } of createBackupPartBlobs(data, backupId, totalParts, partPayloadBytes, encoder)) {
      const fileName = backupPartFileName(date, backupId, part, totalParts)
      const handle = await directory.getFileHandle(fileName, { create: true })
      await writeBackupBlob(handle, blob)
    }
    return { status: 'saved', fileCount: totalParts, format: 'multipart' }
  }

  for (const { part, blob } of createBackupPartBlobs(data, backupId, totalParts, partPayloadBytes, encoder)) {
    startBrowserDownload(blob, backupPartFileName(date, backupId, part, totalParts))
  }
  return { status: 'download-started', fileCount: totalParts, format: 'multipart' }
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
  } catch {
    return { valid: false, error: 'JSON 解析失败' }
  }
}

interface BackupPartMetadata {
  backupId: string
  part: number
  total: number
  headerBytes: number
  file: File
}

function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error || new Error('无法读取备份文件'))
    reader.readAsArrayBuffer(blob)
  })
}

async function readBackupPartMetadata(file: File): Promise<BackupPartMetadata | null> {
  const prefixBuffer = await readBlobAsArrayBuffer(file.slice(0, 1024))
  const prefix = new TextDecoder().decode(prefixBuffer)
  if (!prefix.startsWith(`${BACKUP_PART_MAGIC}\n`)) return null

  const headerEnd = prefix.indexOf(BACKUP_PART_HEADER_END)
  if (headerEnd < 0) throw new Error(`分卷文件头无效：${file.name}`)

  const header = prefix.slice(0, headerEnd)
  const [magic, backupId, partText, totalText] = header.split('\n')
  const part = Number(partText)
  const total = Number(totalText)
  if (
    magic !== BACKUP_PART_MAGIC ||
    !/^[A-Za-z0-9._-]{1,128}$/.test(backupId) ||
    !Number.isInteger(part) ||
    !Number.isInteger(total) ||
    part < 1 ||
    total < 1 ||
    part > total ||
    total > MAX_BACKUP_PARTS
  ) {
    throw new Error(`分卷文件头无效：${file.name}`)
  }

  return {
    backupId,
    part,
    total,
    headerBytes: new TextEncoder().encode(prefix.slice(0, headerEnd + BACKUP_PART_HEADER_END.length)).byteLength,
    file
  }
}

export async function previewImportBackupFiles(
  files: readonly File[]
): Promise<{ valid: boolean; data?: ExportData; error?: string }> {
  try {
    if (files.length === 0) return { valid: false, error: '请选择备份文件' }
    if (files.length > MAX_BACKUP_PARTS) {
      return { valid: false, error: `备份分卷不能超过 ${MAX_BACKUP_PARTS} 个` }
    }

    const firstPart = await readBackupPartMetadata(files[0])
    if (!firstPart) {
      if (files.length !== 1) return { valid: false, error: '多个文件必须是同一组 .feynman-part 分卷' }
      if (files[0].size > MAX_BACKUP_FILE_BYTES) {
        return { valid: false, error: `单个 JSON 备份不能超过 ${MAX_BACKUP_FILE_BYTES / 1024 / 1024} MB` }
      }
      const content = new TextDecoder().decode(await readBlobAsArrayBuffer(files[0]))
      return previewImportData(content)
    }

    const parts: BackupPartMetadata[] = [firstPart]
    for (let index = 1; index < files.length; index += 1) {
      const metadata = await readBackupPartMetadata(files[index])
      if (!metadata) return { valid: false, error: '不能混合选择 JSON 备份和分卷备份' }
      parts.push(metadata)
    }

    if (parts.some(part => part.file.size > MAX_BACKUP_FILE_BYTES)) {
      return { valid: false, error: `单个备份分卷不能超过 ${MAX_BACKUP_FILE_BYTES / 1024 / 1024} MB` }
    }
    if (parts.some(part => part.backupId !== firstPart.backupId || part.total !== firstPart.total)) {
      return { valid: false, error: '所选文件不属于同一组备份分卷' }
    }
    if (files.length !== firstPart.total) {
      return { valid: false, error: `备份分卷不完整：应选择 ${firstPart.total} 个，实际选择 ${files.length} 个` }
    }

    parts.sort((left, right) => left.part - right.part)
    if (parts.some((part, index) => part.part !== index + 1)) {
      return { valid: false, error: '备份分卷存在重复或缺失' }
    }

    const decoder = new TextDecoder()
    const jsonSegments: string[] = []
    for (const part of parts) {
      const bytes = new Uint8Array(await readBlobAsArrayBuffer(part.file))
      jsonSegments.push(decoder.decode(bytes.subarray(part.headerBytes), { stream: true }))
    }
    jsonSegments.push(decoder.decode())
    return previewImportData(jsonSegments.join(''))
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : '无法读取备份文件'
    }
  }
}

// 应用导入的数据
export function applyImportData(input: unknown, options: {
  importSettings?: boolean
  importBooks?: boolean
  mergeBooks?: boolean  // true = 合并，false = 覆盖
}): void {
  const normalized = normalizeImportData(input)
  if (!normalized.valid) throw new Error(normalized.error)
  const data = normalized.data

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
      const existingUsage = getAIUsageRecords()
      const existingUsageIds = new Set(existingUsage.map(record => record.id))
      replaceAIUsageRecords([
        ...data.aiUsageRecords.filter(record => !existingUsageIds.has(record.id)),
        ...existingUsage
      ])
      const existingLists = getBookLists()
      const existingListIds = new Set(existingLists.map(list => list.id))
      const existingRelations = getBookRelations()
      const existingRelationIds = new Set(existingRelations.map(relation => relation.id))
      replaceBookOrganization(
        [...data.bookLists.filter(list => !existingListIds.has(list.id)), ...existingLists],
        [...data.bookRelations.filter(relation => !existingRelationIds.has(relation.id)), ...existingRelations]
      )
    } else {
      // 覆盖模式：完全替换
      saveBooks(data.books)
      replaceAIUsageRecords(data.aiUsageRecords)
      replaceBookOrganization(data.bookLists, data.bookRelations)
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
  const aiUsageRecords = getAIUsageRecords()
  const bookLists = getBookLists()
  const bookRelations = getBookRelations()

  const totalNotes = books.reduce((sum, b) => sum + (b.noteRecords?.length || 0), 0)
  const totalPractices = books.reduce((sum, b) => sum + (b.practiceRecords?.length || 0), 0)
  const totalQARecords = books.reduce((sum, b) => sum + (b.qaPracticeRecords?.length || 0), 0)

  // 分段统计，避免大书库为显示大小额外构造一份完整 JSON 副本。
  const encoder = new TextEncoder()
  let dataSizeInBytes = encoder.encode(`{"settings":${JSON.stringify(settings)},"books":[`).byteLength
  books.forEach((book, index) => {
    if (index > 0) dataSizeInBytes += 1
    dataSizeInBytes += encoder.encode(JSON.stringify(book)).byteLength
  })
  dataSizeInBytes += encoder.encode(
    `],"aiUsageRecords":${JSON.stringify(aiUsageRecords)},"bookLists":${JSON.stringify(bookLists)},"bookRelations":${JSON.stringify(bookRelations)}}`
  ).byteLength
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
