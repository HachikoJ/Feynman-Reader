import { createHash, randomBytes } from 'node:crypto'
import { Pool, type QueryResultRow } from 'pg'
import type { AuthSession, AuthUser } from './auth'
import type { ApiKeyRecord, PersistenceAdapter, UserDataSummary } from './persistence'
import { normalizeImportData } from '@/lib/backupValidation'

type UserRow = {
  id: string
  tokendance_subject: string | null
  phone: string | null
  email: string | null
  phone_verified_at: Date | string | null
  email_verified_at: Date | string | null
  created_at: Date | string
  updated_at: Date | string
}

type SessionRow = {
  id_hash: string
  user_id: string
  expires_at: Date | string
  created_at: Date | string
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function mapUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    ...(row.tokendance_subject ? { tokendanceSubject: row.tokendance_subject } : {}),
    ...(row.phone ? { phone: row.phone } : {}),
    ...(row.email ? { email: row.email } : {}),
    ...(row.phone_verified_at ? { phoneVerifiedAt: iso(row.phone_verified_at) } : {}),
    ...(row.email_verified_at ? { emailVerifiedAt: iso(row.email_verified_at) } : {}),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

function mapSession(row: SessionRow, rawId: string): AuthSession {
  return {
    id: rawId,
    userId: row.user_id,
    expiresAt: iso(row.expires_at),
    createdAt: iso(row.created_at),
  }
}

function sessionHash(id: string): string {
  return createHash('sha256').update(id).digest('hex')
}

function queryRows<T extends QueryResultRow>(result: { rows: T[] }): T[] {
  return result.rows
}

export class PostgresPersistenceAdapter implements PersistenceAdapter {
  private readonly pool: Pool

  constructor(connectionString = process.env.DATABASE_URL) {
    if (!connectionString?.trim()) throw new Error('DATABASE_URL is not configured.')
    const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, '\n').trim()
    this.pool = new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
    })
  }

  private async one<T extends QueryResultRow>(text: string, values: unknown[]): Promise<T | null> {
    const result = await this.pool.query<T>(text, values)
    return queryRows(result)[0] || null
  }

  async findUserById(userId: string): Promise<AuthUser | null> {
    const row = await this.one<UserRow>('select * from public.app_users where id = $1', [userId])
    return row ? mapUser(row) : null
  }

  async findByTokendanceSubject(subject: string): Promise<AuthUser | null> {
    const row = await this.one<UserRow>('select * from public.app_users where tokendance_subject = $1', [subject])
    return row ? mapUser(row) : null
  }

  async findByPhone(phone: string): Promise<AuthUser | null> {
    const row = await this.one<UserRow>('select * from public.app_users where phone = $1', [phone])
    return row ? mapUser(row) : null
  }

  async findByEmail(email: string): Promise<AuthUser | null> {
    const row = await this.one<UserRow>('select * from public.app_users where email = $1', [email])
    return row ? mapUser(row) : null
  }

  async createUser(input: { tokendanceSubject?: string; phone?: string; email?: string }): Promise<AuthUser> {
    const row = await this.one<UserRow>(
      `insert into public.app_users (tokendance_subject, phone, email)
       values ($1, $2, $3)
       returning *`,
      [input.tokendanceSubject || null, input.phone || null, input.email || null],
    )
    if (!row) throw new Error('User creation returned no row.')
    return mapUser(row)
  }

  async updateUser(userId: string, patch: Partial<Pick<AuthUser, 'tokendanceSubject' | 'phone' | 'email' | 'phoneVerifiedAt' | 'emailVerifiedAt'>>): Promise<AuthUser> {
    const fields: string[] = []
    const values: unknown[] = []
    const add = (field: string, value: unknown) => {
      values.push(value)
      fields.push(`${field} = $${values.length}`)
    }
    if (patch.tokendanceSubject !== undefined) add('tokendance_subject', patch.tokendanceSubject)
    if (patch.phone !== undefined) add('phone', patch.phone)
    if (patch.email !== undefined) add('email', patch.email)
    if (patch.phoneVerifiedAt !== undefined) add('phone_verified_at', patch.phoneVerifiedAt)
    if (patch.emailVerifiedAt !== undefined) add('email_verified_at', patch.emailVerifiedAt)
    if (fields.length === 0) return (await this.findUserById(userId)) || (() => { throw new Error('User not found.') })()
    values.push(userId)
    const row = await this.one<UserRow>(
      `update public.app_users set ${fields.join(', ')}, updated_at = now()
       where id = $${values.length}
       returning *`,
      values,
    )
    if (!row) throw new Error('User not found.')
    return mapUser(row)
  }

  async createSession(userId: string, ttlSeconds: number): Promise<AuthSession> {
    const rawId = randomBytes(32).toString('base64url')
    const row = await this.one<SessionRow>(
      `insert into public.auth_sessions (id_hash, user_id, expires_at)
       values ($1, $2, now() + ($3 * interval '1 second'))
       returning id_hash, user_id, expires_at, created_at`,
      [sessionHash(rawId), userId, ttlSeconds],
    )
    if (!row) throw new Error('Session creation returned no row.')
    return mapSession(row, rawId)
  }

  async findSession(id: string): Promise<AuthSession | null> {
    const row = await this.one<SessionRow>(
      `select id_hash, user_id, expires_at, created_at
       from public.auth_sessions
       where id_hash = $1 and revoked_at is null and expires_at > now()`,
      [sessionHash(id)],
    )
    return row ? mapSession(row, id) : null
  }

  async deleteSession(id: string): Promise<void> {
    await this.pool.query('delete from public.auth_sessions where id_hash = $1', [sessionHash(id)])
  }

  async saveApiKey(record: ApiKeyRecord): Promise<void> {
    await this.pool.query(
      `insert into public.api_key_records (user_id, provider, secret, created_at, updated_at)
       values ($1, $2, $3::jsonb, $4, $5)
       on conflict (user_id, provider)
       do update set secret = excluded.secret, updated_at = excluded.updated_at`,
      [record.userId, record.provider, JSON.stringify(record.secret), record.createdAt, record.updatedAt],
    )
  }

  async getApiKey(userId: string, provider: 'tokendance'): Promise<ApiKeyRecord | null> {
    const row = await this.one<{ user_id: string; provider: 'tokendance'; secret: ApiKeyRecord['secret']; created_at: Date | string; updated_at: Date | string }>(
      'select user_id, provider, secret, created_at, updated_at from public.api_key_records where user_id = $1 and provider = $2',
      [userId, provider],
    )
    return row ? { userId: row.user_id, provider: row.provider, secret: row.secret, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) } : null
  }

  async deleteApiKey(userId: string, provider: 'tokendance'): Promise<void> {
    await this.pool.query('delete from public.api_key_records where user_id = $1 and provider = $2', [userId, provider])
  }

  async getUserDataSummary(userId: string): Promise<UserDataSummary> {
    const row = await this.one<{
      books: string; notes: string; practices: string; qa_records: string; ai_usage_records: string;
      lists: string; relations: string; last_import_at: Date | string | null; last_sync_at: Date | string | null
    }>(`select
      (select count(*) from public.user_books where user_id = $1 and deleted_at is null) as books,
      (select coalesce(sum(jsonb_array_length(coalesce(data->'noteRecords', '[]'::jsonb))), 0) from public.user_books where user_id = $1 and deleted_at is null) as notes,
      (select coalesce(sum(jsonb_array_length(coalesce(data->'practiceRecords', '[]'::jsonb))), 0) from public.user_books where user_id = $1 and deleted_at is null) as practices,
      (select coalesce(sum(jsonb_array_length(coalesce(data->'qaPracticeRecords', '[]'::jsonb))), 0) from public.user_books where user_id = $1 and deleted_at is null) as qa_records,
      (select count(*) from public.user_ai_usage where user_id = $1) as ai_usage_records,
      (select count(*) from public.user_book_lists where user_id = $1) as lists,
      (select count(*) from public.user_book_relations where user_id = $1) as relations,
      (select last_import_at from public.user_data_state where user_id = $1) as last_import_at,
      (select last_sync_at from public.user_data_state where user_id = $1) as last_sync_at`, [userId])
    return {
      books: Number(row?.books || 0), notes: Number(row?.notes || 0), practices: Number(row?.practices || 0),
      qaRecords: Number(row?.qa_records || 0), aiUsageRecords: Number(row?.ai_usage_records || 0),
      lists: Number(row?.lists || 0), relations: Number(row?.relations || 0),
      lastImportAt: row?.last_import_at ? iso(row.last_import_at) : null,
      lastSyncAt: row?.last_sync_at ? iso(row.last_sync_at) : null,
    }
  }

  async importUserData(userId: string, payload: unknown): Promise<{ booksImported: number; aiUsageImported: number; listsImported: number; relationsImported: number }> {
    const normalized = normalizeImportData(payload)
    if (!normalized.valid) throw new Error(normalized.error)
    const data = normalized.data
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      const settings = { ...data.settings, apiKey: '' }
      await client.query(`insert into public.user_settings (user_id, data, version, updated_at) values ($1, $2::jsonb, 1, now())
        on conflict (user_id) do update set data = excluded.data, version = public.user_settings.version + 1, updated_at = now()`, [userId, JSON.stringify(settings)])
      for (const book of data.books) {
        await client.query(`insert into public.user_books (user_id, book_id, name, author, status, current_phase, best_score, data, created_at, updated_at, deleted_at)
          values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, to_timestamp($9 / 1000.0), to_timestamp($10 / 1000.0), null)
          on conflict (user_id, book_id) do update set name=excluded.name, author=excluded.author, status=excluded.status,
            current_phase=excluded.current_phase, best_score=excluded.best_score, data=excluded.data, updated_at=excluded.updated_at, deleted_at=null`,
        [userId, book.id, book.name, book.author || null, book.status, book.currentPhase, book.bestScore, JSON.stringify(book), book.createdAt, book.updatedAt])
      }
      for (const record of data.aiUsageRecords) {
        await client.query(`insert into public.user_ai_usage (user_id, record_id, book_id, session_id, task, model, prompt_tokens, completion_tokens, total_tokens, data, created_at)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, to_timestamp($11 / 1000.0))
          on conflict (user_id, record_id) do update set data=excluded.data, updated_at=now()`,
        [userId, record.id, record.bookId || null, record.sessionId || null, record.task, record.model, record.promptTokens, record.completionTokens, record.totalTokens, JSON.stringify(record), record.createdAt])
      }
      for (const list of data.bookLists) {
        await client.query(`insert into public.user_book_lists (user_id, list_id, name, description, book_ids, created_at, updated_at)
          values ($1, $2, $3, $4, $5::jsonb, to_timestamp($6 / 1000.0), to_timestamp($7 / 1000.0))
          on conflict (user_id, list_id) do update set name=excluded.name, description=excluded.description, book_ids=excluded.book_ids, updated_at=excluded.updated_at`,
        [userId, list.id, list.name, list.description || null, JSON.stringify(list.bookIds), list.createdAt, list.updatedAt])
      }
      for (const relation of data.bookRelations) {
        await client.query(`insert into public.user_book_relations (user_id, relation_id, from_book_id, to_book_id, relation_type, note, created_at)
          values ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0))
          on conflict (user_id, relation_id) do update set from_book_id=excluded.from_book_id, to_book_id=excluded.to_book_id, relation_type=excluded.relation_type, note=excluded.note`,
        [userId, relation.id, relation.fromBookId, relation.toBookId, relation.type, relation.note || null, relation.createdAt])
      }
      await client.query(`insert into public.user_data_state (user_id, schema_version, sync_version, last_import_at, last_sync_at, updated_at)
        values ($1, $2, 1, now(), now(), now()) on conflict (user_id) do update set schema_version=excluded.schema_version,
        sync_version=public.user_data_state.sync_version + 1, last_import_at=now(), last_sync_at=now(), updated_at=now()`, [userId, data.version])
      await client.query('commit')
      return { booksImported: data.books.length, aiUsageImported: data.aiUsageRecords.length, listsImported: data.bookLists.length, relationsImported: data.bookRelations.length }
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }
}

export async function closePostgresPersistence(adapter: PostgresPersistenceAdapter): Promise<void> {
  await (adapter as unknown as { pool: Pool }).pool.end()
}
