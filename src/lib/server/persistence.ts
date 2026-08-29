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
  saveApiKey(record: ApiKeyRecord): Promise<void>
  getApiKey(userId: string, provider: 'tokendance'): Promise<ApiKeyRecord | null>
  deleteApiKey(userId: string, provider: 'tokendance'): Promise<void>
  importUserData?(userId: string, payload: unknown): Promise<{ booksImported: number; aiUsageImported: number; listsImported: number; relationsImported: number }>
  getUserDataSummary?(userId: string): Promise<UserDataSummary>
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
}

/**
 * Database access is intentionally explicit. Set this from the server bootstrap
 * with a PostgreSQL/Supabase adapter; never silently fall back to process memory.
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

export type { AuthUser, AuthSession }
