/**
 * IndexedDB data-access layer.
 *
 * Business rules live in store.ts so every active caller uses the same
 * completion, scoring, import and ID-generation logic.
 */

import { indexedDB, initializeDatabase, migrateFromLocalStorage, getDatabaseStats } from './indexedDB'
import type { AppSettings, Book, NoteRecord, PracticeRecord, QAPracticeRecord, ExportData } from './indexedDB'
import { logger } from './logger'
import {
  normalizeAIUsageRecords,
  normalizeBookLists,
  normalizeBookRelations,
  normalizeBooks,
  normalizeSettings,
  normalizeStoredBooks
} from './backupValidation'
import type { AIUsageRecord } from './aiUsage'
import type { BookOrganizationData } from './bookRelations'

let dbInitialized = false

export async function initDB(): Promise<void> {
  if (dbInitialized) return
  await initializeDatabase()
  dbInitialized = true
}

async function ensureInit(): Promise<void> {
  if (!dbInitialized) await initDB()
}

const defaultSettings: AppSettings = {
  apiKey: '',
  aiProvider: 'tokendance',
  language: 'zh',
  theme: 'light',
  hideApiKeyAlert: false,
  aiDataConsent: false,
  personalizationAnalyticsEnabled: true,
  assistantMemoryEnabled: true,
  quotes: [],
  quotesInitialized: false
}

export async function getSettings(): Promise<AppSettings> {
  await ensureInit()

  try {
    const data = await indexedDB.get<{ id: string } & AppSettings>('settings', 'app')
    if (!data) return defaultSettings

    const normalized = normalizeSettings({
      ...data,
      quotes: data.quotes || (data as { customQuotes?: AppSettings['quotes'] }).customQuotes || []
    }, { preserveApiKey: true })
    if (!normalized.valid) throw new Error(`Stored settings are invalid: ${normalized.error}`)
    if (normalized.data.aiProvider !== data.aiProvider || normalized.data.apiKey !== data.apiKey || normalized.data.aiDataConsent !== data.aiDataConsent) {
      await indexedDB.put('settings', { id: 'app', ...normalized.data })
    }
    return normalized.data
  } catch (error) {
    logger.error('Failed to get settings from IndexedDB:', error)
    throw error
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await ensureInit()
  const normalized = normalizeSettings(settings, { preserveApiKey: true })
  if (!normalized.valid) throw new Error(normalized.error)

  const saved = await indexedDB.put('settings', { id: 'app', ...normalized.data })
  if (!saved) throw new Error('Failed to save settings to IndexedDB')
}

export async function getBooks(): Promise<Book[]> {
  await ensureInit()

  try {
    const books = await indexedDB.getAll<Book>('books')
    const normalized = normalizeStoredBooks(books)
    if (normalized.errors.length > 0) {
      throw new Error(`Stored book data is invalid: ${normalized.errors.join('; ')}`)
    }
    return normalized.books
  } catch (error) {
    logger.error('Failed to get books from IndexedDB:', error)
    throw error
  }
}

const AI_USAGE_METADATA_KEY = 'ai-usage'
const BOOK_ORGANIZATION_METADATA_KEY = 'book-organization'

export async function getAIUsageRecords(): Promise<AIUsageRecord[]> {
  await ensureInit()
  const data = await indexedDB.get<{ key: string; records?: AIUsageRecord[] }>('metadata', AI_USAGE_METADATA_KEY)
  const normalized = normalizeAIUsageRecords(data?.records)
  if (!normalized.valid) {
    logger.warn('Stored AI usage records are invalid and were ignored:', normalized.error)
    return []
  }
  return normalized.data
}

export async function saveAIUsageRecords(records: AIUsageRecord[]): Promise<void> {
  await ensureInit()
  const normalized = normalizeAIUsageRecords(records)
  if (!normalized.valid) throw new Error(normalized.error)
  const saved = await indexedDB.put('metadata', { key: AI_USAGE_METADATA_KEY, records: normalized.data })
  if (!saved) throw new Error('Failed to save AI usage records to IndexedDB')
}

export async function getBookOrganization(): Promise<BookOrganizationData> {
  await ensureInit()
  const data = await indexedDB.get<{ key: string } & BookOrganizationData>('metadata', BOOK_ORGANIZATION_METADATA_KEY)
  const lists = normalizeBookLists(data?.lists)
  if (!lists.valid) throw new Error(`Stored book lists are invalid: ${lists.error}`)
  const relations = normalizeBookRelations(data?.relations)
  if (!relations.valid) throw new Error(`Stored book relations are invalid: ${relations.error}`)
  return { lists: lists.data, relations: relations.data }
}

export async function saveBookOrganization(data: BookOrganizationData): Promise<void> {
  await ensureInit()
  const lists = normalizeBookLists(data.lists)
  if (!lists.valid) throw new Error(lists.error)
  const relations = normalizeBookRelations(data.relations)
  if (!relations.valid) throw new Error(relations.error)
  const saved = await indexedDB.put('metadata', {
    key: BOOK_ORGANIZATION_METADATA_KEY,
    lists: lists.data,
    relations: relations.data
  })
  if (!saved) throw new Error('Failed to save book organization to IndexedDB')
}

export async function saveBooks(books: Book[]): Promise<void> {
  await ensureInit()
  const normalized = normalizeBooks(books)
  if (!normalized.valid) throw new Error(normalized.error)
  await indexedDB.replaceAll('books', normalized.data)
}

export async function saveBook(book: Book): Promise<void> {
  await ensureInit()
  const normalized = normalizeBooks([book])
  if (!normalized.valid) throw new Error(normalized.error)

  const saved = await indexedDB.put('books', normalized.data[0])
  if (!saved) throw new Error(`Failed to save book ${book.id}`)
}

export async function saveExistingBook(book: Book, expectedUpdatedAt: number): Promise<void> {
  await ensureInit()
  const normalized = normalizeBooks([book])
  if (!normalized.valid) throw new Error(normalized.error)

  await indexedDB.putIfUnchanged('books', normalized.data[0], expectedUpdatedAt)
}

export async function restoreDeletedBook(book: Book): Promise<void> {
  await ensureInit()
  const normalized = normalizeBooks([book])
  if (!normalized.valid) throw new Error(normalized.error)

  await indexedDB.add('books', normalized.data[0])
}

export async function deleteExistingBookById(id: string, expectedUpdatedAt: number): Promise<void> {
  await ensureInit()
  await indexedDB.deleteIfUnchanged('books', id, expectedUpdatedAt)
}

export async function getBook(id: string): Promise<Book | undefined> {
  await ensureInit()
  const book = await indexedDB.get<Book>('books', id)
  if (!book) return undefined

  const normalized = normalizeBooks([book])
  if (!normalized.valid) throw new Error(normalized.error)
  return normalized.data[0]
}

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
