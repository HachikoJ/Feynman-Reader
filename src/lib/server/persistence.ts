import type { AuthStore, AuthUser, AuthSession } from './auth'
import type { EncryptedSecret } from './apiKeyVault'
import { PostgresPersistenceAdapter } from './postgresPersistence'

export interface ApiKeyRecord {
  userId: string
  provider: 'tokendance' | 'deepseek'
  secret: EncryptedSecret
  createdAt: string
  updatedAt: string
}

export interface PersistenceAdapter extends AuthStore {
  findAdminRole?(userId: string): Promise<AdminRole | null>
  getAdminTotpCredential?(userId: string): Promise<AdminTotpCredential | null>
  recordAdminTotpFailure?(userId: string, lockedUntil: string | null): Promise<void>
  resetAdminTotpFailures?(userId: string): Promise<void>
  markAdminTotpUsed?(userId: string): Promise<void>
  createAdminSession?(session: AdminSessionRecord): Promise<void>
  findAdminSession?(idHash: string): Promise<AdminSessionRecord | null>
  revokeAdminSession?(idHash: string): Promise<void>
  writeAdminAuditLog?(entry: AdminAuditEntry): Promise<void>
  getAdminDashboard?(): Promise<AdminDashboard>
  findPasswordHashByUsername?(username: string): Promise<string | null>
  updatePasswordHash?(userId: string, passwordHash: string): Promise<void>
  mergePasswordAccountIntoWatchaAccount?(sourceUserId: string, targetUserId: string): Promise<AccountMergeResult>
  saveApiKey(record: ApiKeyRecord): Promise<void>
  getApiKey(userId: string, provider: ApiKeyRecord['provider']): Promise<ApiKeyRecord | null>
  deleteApiKey(userId: string, provider: ApiKeyRecord['provider']): Promise<void>
  importUserData?(userId: string, payload: unknown): Promise<ImportResult>
  getUserDataSummary?(userId: string): Promise<UserDataSummary>
  getUserSettings?(userId: string): Promise<Record<string, unknown>>
  listUserBooks?(userId: string): Promise<UserBookSummary[]>
  saveBook?(userId: string, book: unknown): Promise<void>
  getBook?(userId: string, bookId: string): Promise<unknown | null>
  exportUserData?(userId: string, format?: 'full' | 'core'): Promise<unknown>
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

export interface AdminRole {
  userId: string
  tokendanceSubject: string
  role: 'super_admin' | 'admin' | 'analyst'
  revokedAt: string | null
}

export interface AdminTotpCredential {
  userId: string
  secret: EncryptedSecret
  enabled: boolean
  failedAttempts: number
  lockedUntil: string | null
}

export interface AdminSessionRecord {
  idHash: string
  userId: string
  expiresAt: string
  mfaVerifiedAt: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export interface AdminAuditEntry {
  adminUserId: string
  action: string
  targetUserId?: string | null
  metadata?: Record<string, unknown>
}

export interface AdminDashboard {
  generatedAt: string
  users: { total: number; newLast30Days: number; activeLast7Days: number }
  books: { total: number; active: number; recycleBin: number; byStatus: Record<string, number>; byPhase: Record<string, number> }
  ai: { requestsLast30Days: number; promptTokensLast30Days: number; completionTokensLast30Days: number; totalTokensLast30Days: number }
  activity: { eventsLast30Days: number; storageBytes: number; recycleBinBytes: number }
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

export interface UserBookSummary {
  id: string
  name: string
  author?: string
  status: string
  currentPhase: number
  bestScore: number
  createdAt: number
  updatedAt: number
  noteCount: number
  practiceCount: number
  questionsDone: number
  questionsTotal: number
  hasRecommendations: boolean
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
    '53300', // too_many_connections
    '57P01', // admin_shutdown
    '57014', // query_canceled (usually a database-side timeout)
    '40001', // serialization_failure
    '40P01', // deadlock_detected
    '55P03', // lock_not_available
    '08001', // unable_to_establish_sql_connection
    '08003', // connection_does_not_exist
    '08004', // sqlserver_rejected_establishment_of_sql_connection
    '08006', // connection_failure
    'ECONNREFUSED',
    'ECONNRESET',
    'EPIPE',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ETIMEDOUT',
  ].includes(code)
}

export type { AuthUser, AuthSession }
