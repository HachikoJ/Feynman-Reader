import { getAIUsageRecords, getBookOrganization, getBooks, getSettings, indexedDB, initDB, saveAIUsageRecords, saveBookOrganization, saveBooks, saveSettings } from './db'
import { resetStoreCache } from './store'
import { SAMPLE_BOOK_ID } from './sampleBook'
import { ASSISTANT_SESSIONS_METADATA_KEY, type AssistantSession } from './assistantSessions'
import { ASSISTANT_MEMORY_METADATA_KEY, type AssistantMemory } from './assistantMemory'

const MIGRATION_MARKER = 'feynman-cloud-migration-completed'
const MIGRATION_DISMISSED_MARKER = 'feynman-cloud-migration-dismissed'
const MIGRATION_DETECTED_AT = 'feynman-cloud-migration-detected-at'
const MIGRATION_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

export interface LocalMigrationSnapshot {
  hasData: boolean
  detectedAt: number | null
  deadlineAt: number | null
  payload: unknown | null
  books: number
  aiUsageRecords: number
  lists: number
  relations: number
  assistantSessions: number
  assistantMemories: number
}

const EMPTY_SNAPSHOT: LocalMigrationSnapshot = {
  hasData: false,
  detectedAt: null,
  deadlineAt: null,
  payload: null,
  books: 0,
  aiUsageRecords: 0,
  lists: 0,
  relations: 0,
  assistantSessions: 0,
  assistantMemories: 0,
}

function isSystemBook(book: { id?: string; isSample?: boolean }): boolean {
  return book.isSample === true || book.id === SAMPLE_BOOK_ID
}

/** Reads historical browser data without changing it. */
export async function inspectLocalMigration(options: { includeDismissed?: boolean } = {}): Promise<LocalMigrationSnapshot> {
  if (typeof window === 'undefined') return { ...EMPTY_SNAPSHOT }
  if (
    window.localStorage.getItem(MIGRATION_MARKER) === 'true' ||
    (!options.includeDismissed && window.localStorage.getItem(MIGRATION_DISMISSED_MARKER) === 'true')
  ) return { ...EMPTY_SNAPSHOT }

  await initDB()
  const [books, settings, aiUsageRecords, organization, sessionRecord, memoryRecord] = await Promise.all([
    getBooks(), getSettings(), getAIUsageRecords(), getBookOrganization(),
    indexedDB.get<{ key: string; sessions?: AssistantSession[] }>('metadata', ASSISTANT_SESSIONS_METADATA_KEY),
    indexedDB.get<{ key: string; memories?: AssistantMemory[] }>('metadata', ASSISTANT_MEMORY_METADATA_KEY),
  ])
  const userBooks = books.filter(book => !isSystemBook(book))
  const userBookIds = new Set(userBooks.map(book => book.id))
  const userLists = organization.lists.filter(list => list.bookIds.some(id => userBookIds.has(id)))
  const userRelations = organization.relations.filter(relation => userBookIds.has(relation.fromBookId) || userBookIds.has(relation.toBookId))
  const userUsage = aiUsageRecords.filter(record => !record.bookId || userBookIds.has(record.bookId))
  const assistantSessions = Array.isArray(sessionRecord?.sessions) ? sessionRecord.sessions : []
  const assistantMemories = Array.isArray(memoryRecord?.memories) ? memoryRecord.memories : []
  const hasData = userBooks.length > 0 || userUsage.length > 0 || userLists.length > 0 || userRelations.length > 0 || assistantSessions.length > 0 || assistantMemories.length > 0
  if (!hasData) return { ...EMPTY_SNAPSHOT }

  const detectedAt = Number(window.localStorage.getItem(MIGRATION_DETECTED_AT)) || Date.now()
  if (!window.localStorage.getItem(MIGRATION_DETECTED_AT)) window.localStorage.setItem(MIGRATION_DETECTED_AT, String(detectedAt))
  const payload = {
    version: 5,
    exportDate: Date.now(),
    settings: { ...settings, apiKey: '' },
    books: userBooks,
    aiUsageRecords: userUsage,
    bookLists: userLists.map(list => ({ ...list, bookIds: list.bookIds.filter(id => userBookIds.has(id)) })),
    bookRelations: userRelations,
    assistantSessions,
    assistantMemories,
  }
  return {
    hasData: true,
    detectedAt,
    deadlineAt: detectedAt + MIGRATION_WINDOW_MS,
    payload,
    books: userBooks.length,
    aiUsageRecords: userUsage.length,
    lists: userLists.length,
    relations: userRelations.length,
    assistantSessions: assistantSessions.length,
    assistantMemories: assistantMemories.length,
  }
}

/** Clears only historical user records after the server has committed them. */
export async function clearMigratedLocalData(): Promise<void> {
  const [books] = await Promise.all([getBooks()])
  await saveBooks(books.filter(isSystemBook))
  await saveAIUsageRecords([])
  await saveBookOrganization({ lists: [], relations: [] })
  await initDB()
  await Promise.all([
    indexedDB.delete('metadata', ASSISTANT_SESSIONS_METADATA_KEY),
    indexedDB.delete('metadata', ASSISTANT_MEMORY_METADATA_KEY),
  ])
  const settings = await getSettings()
  await saveSettings({ ...settings, apiKey: '' })
  window.localStorage.setItem(MIGRATION_MARKER, 'true')
  window.localStorage.removeItem(MIGRATION_DETECTED_AT)
  resetStoreCache()
}

export function migrationMarkerKey(): string {
  return MIGRATION_MARKER
}

/** Permanently hides the reminder while intentionally keeping IndexedDB data intact. */
export function dismissLocalMigrationNotice(): void {
  if (typeof globalThis.localStorage === 'undefined') return
  globalThis.localStorage.setItem(MIGRATION_DISMISSED_MARKER, 'true')
}

export function migrationDismissedMarkerKey(): string {
  return MIGRATION_DISMISSED_MARKER
}
