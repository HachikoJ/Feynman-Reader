import type { AuthStore, AuthUser, AuthSession } from './auth'
import type { EncryptedSecret } from './apiKeyVault'
import { PostgresPersistenceAdapter } from './postgresPersistence'

export interface ApiKeyRecord {
  userId: string
  provider: 'tokendance'
  secret: EncryptedSecret
  createdAt: string
  updatedAt: string
}

export interface PersistenceAdapter extends AuthStore {
  findPasswordHashByUsername?(username: string): Promise<string | null>
  updatePasswordHash?(userId: string, passwordHash: string): Promise<void>
  mergePasswordAccountIntoWatchaAccount?(sourceUserId: string, targetUserId: string): Promise<AccountMergeResult>
  saveApiKey(record: ApiKeyRecord): Promise<void>
  getApiKey(userId: string, provider: 'tokendance'): Promise<ApiKeyRecord | null>
  deleteApiKey(userId: string, provider: 'tokendance'): Promise<void>
  importUserData?(userId: string, payload: unknown): Promise<ImportResult>
  getUserDataSummary?(userId: string): Promise<UserDataSummary>
  exportUserData?(userId: string): Promise<unknown>
  saveUserSettings?(userId: string, data: unknown): Promise<void>
  getUserProfile?(userId: string): Promise<UserProfile>
  saveUserProfile?(userId: string, profile: UserProfile): Promise<UserProfile>
  saveUserProfilePatch?(userId: string, patch: { customDisplayName?: string | null; customAvatarUrl?: string | null }): Promise<UserProfile>
  syncWatchaProfile?(userId: string, profile: { nickname?: string; avatarUrl?: string | null }): Promise<void>
  getMigrationState?(userId: string, activateWindow?: boolean): Promise<MigrationState>
  migrateUserData?(userId: string, payload: unknown): Promise<MigrationResult>
  listRecycleBin?(userId: string): Promise<RecycleBinItem[]>
  softDeleteBook?(userId: string, bookId: string): Promise<void>
  restoreBook?(userId: string, bookId: string): Promise<void>
  permanentlyDeleteBook?(userId: string, bookId: string): Promise<void>
  purgeRecycleBin?(userId: string): Promise<number>
  listAssistantSessions?(userId: string): Promise<AssistantSessionRecord[]>
  saveAssistantSession?(userId: string, session: AssistantSessionRecord): Promise<void>
  deleteAssistantSession?(userId: string, sessionId: string): Promise<void>
  clearAssistantSessions?(userId: string): Promise<void>
  listAssistantMemories?(userId: string): Promise<AssistantMemoryRecord[]>
  saveAssistantMemory?(userId: string, memory: AssistantMemoryRecord): Promise<void>
  deleteAssistantMemory?(userId: string, memoryId: string): Promise<void>
  clearAssistantMemories?(userId: string): Promise<void>
  recordBehaviorEvent?(userId: string, eventType: string, payload: unknown, occurredAt?: string): Promise<void>
  getActivityCalendar?(userId: string, from: string, to: string): Promise<ActivityDay[]>
}

export interface AccountMergeResult {
  books: number
  aiUsageRecords: number
  lists: number
  relations: number
  assistantSessions: number
  assistantMemories: number
  behaviorEvents: number
  auxiliaryRecords: number
  apiKeys: number
}

export interface MigrationState {
  status: 'pending' | 'running' | 'completed' | 'failed'
  version: number
  startedAt: string | null
  deadlineAt: string | null
  completedAt: string | null
  lastError: string | null
  syncVersion: number
}

export interface UserProfile {
  displayName: string
  avatarUrl: string | null
  customDisplayName: string | null
  customAvatarUrl: string | null
}

export interface MigrationResult {
  status: 'completed'
  migrationVersion: number
  syncVersion: number
  booksImported: number
  aiUsageImported: number
  listsImported: number
  relationsImported: number
  assistantSessionsImported: number
  assistantMemoriesImported: number
}

export interface ImportResult {
  booksImported: number
  aiUsageImported: number
  listsImported: number
  relationsImported: number
  assistantSessionsImported: number
  assistantMemoriesImported: number
}

export interface RecycleBinItem {
  bookId: string
  name: string
  author: string | null
  deletedAt: string
  purgeAt: string | null
}

export interface AssistantSessionRecord {
  sessionId: string
  title: string
  bookId: string | null
  data: unknown
  createdAt: string
  updatedAt: string
}

export interface AssistantMemoryRecord {
  memoryId: string
  content: string
  category: 'preference' | 'learning-style' | 'goal' | 'workflow'
  sourceSessionId: string | null
  createdAt: string
  updatedAt: string
}

export interface UserDataSummary {
  books: number
  notes: number
  practices: number
  qaRecords: number
  aiUsageRecords: number
  lists: number
  relations: number
  lastImportAt: string | null
  lastSyncAt: string | null
  quotes: number
  assistantSessions: number
  assistantMemories: number
  storageBytes: number
}

export interface ActivityDay {
  date: string
  count: number
  categories: Record<string, number>
}

/**
 * Database access is intentionally explicit. Set this from the server bootstrap
 * with the server-side PostgreSQL adapter; never silently fall back to process memory.
 */
let adapter: PersistenceAdapter | null = null

export function configurePersistence(next: PersistenceAdapter): void {
  adapter = next
}

export function getPersistence(): PersistenceAdapter {
  if (!adapter && process.env.DATABASE_URL) {
    // Lazy initialization keeps the pool server-only and avoids opening a
    // database connection for routes that do not use account features.
    adapter = new PostgresPersistenceAdapter()
  }
  if (!adapter) throw new Error('Persistence adapter is not configured.')
  return adapter
}

/**
 * Database setup failures should be reported as service configuration errors,
 * without exposing driver details to the browser. This covers a missing
 * migration table as well as connection/authentication failures.
 */
export function isPersistenceUnavailable(error: unknown): boolean {
  if (error instanceof Error && error.message === 'Persistence adapter is not configured.') return true
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String((error as { code?: unknown }).code || '') : ''
  return [
    '42P01', // undefined_table: migrations have not been applied
    '3D000', // invalid_catalog_name
    '28P01', // invalid_password
    '28000', // invalid_authorization_specification
    '42501', // insufficient_privilege
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
  ].includes(code)
}

export type { AuthUser, AuthSession }
