import { createHash, randomBytes } from 'node:crypto'
import { Pool, type QueryResultRow } from 'pg'
import type { AuthSession, AuthUser } from './auth'
import type {
  ApiKeyRecord,
  AssistantMemoryRecord,
  AssistantSessionRecord,
  ActivityDay,
  ImportResult,
  MigrationResult,
  MigrationState,
  PersistenceAdapter,
  RecycleBinItem,
  UserProfile,
  UserDataSummary,
} from './persistence'
import { normalizeImportData } from '@/lib/backupValidation'
import { SAMPLE_BOOK_ID } from '@/lib/sampleBook'
import { mergeDefaultQuotes } from '@/lib/defaultQuotes'

type UserRow = {
  id: string
  username: string | null
  password_hash: string | null
  tokendance_subject: string | null
  phone: string | null
  email: string | null
  phone_verified_at: Date | string | null
  email_verified_at: Date | string | null
  created_at: Date | string
  updated_at: Date | string
}

type ProfileSettings = {
  profile?: {
    watchaNickname?: unknown
    watchaAvatarUrl?: unknown
    customDisplayName?: unknown
    customAvatarUrl?: unknown
  }
}

type SessionRow = {
  id_hash: string
  user_id: string
  expires_at: Date | string
  created_at: Date | string
}

type MigrationStateRow = {
  migration_status: MigrationState['status']
  migration_version: number
  migration_started_at: Date | string | null
  migration_deadline_at: Date | string | null
  migration_completed_at: Date | string | null
  last_migration_error: string | null
  sync_version: number
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function mapUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    ...(row.username ? { username: row.username } : {}),
    ...(row.tokendance_subject ? { tokendanceSubject: row.tokendance_subject } : {}),
    ...(row.phone ? { phone: row.phone } : {}),
    ...(row.email ? { email: row.email } : {}),
    ...(row.phone_verified_at ? { phoneVerifiedAt: iso(row.phone_verified_at) } : {}),
    ...(row.email_verified_at ? { emailVerifiedAt: iso(row.email_verified_at) } : {}),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

function profileFromSettings(settings: unknown): UserProfile {
  const item = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? settings as ProfileSettings
    : {}
  const profile = item.profile && typeof item.profile === 'object' ? item.profile : {}
  const watchaName = typeof profile.watchaNickname === 'string' ? profile.watchaNickname.trim() : ''
  const watchaAvatar = typeof profile.watchaAvatarUrl === 'string' && profile.watchaAvatarUrl.trim() ? profile.watchaAvatarUrl.trim() : null
  const customName = typeof profile.customDisplayName === 'string' && profile.customDisplayName.trim() ? profile.customDisplayName.trim() : null
  const customAvatar = typeof profile.customAvatarUrl === 'string' && profile.customAvatarUrl.trim() ? profile.customAvatarUrl.trim() : null
  return {
    displayName: customName || watchaName || '观猹用户',
    avatarUrl: customAvatar || watchaAvatar,
    customDisplayName: customName,
    customAvatarUrl: customAvatar,
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

  private async ensureDefaultQuotes(userId: string): Promise<Record<string, unknown>> {
    const row = await this.one<{ data: unknown }>('select data from public.user_settings where user_id = $1', [userId])
    const current = row?.data && typeof row.data === 'object' && !Array.isArray(row.data)
      ? row.data as Record<string, unknown>
      : {}
    const quotes = mergeDefaultQuotes(current.quotes)
    const next = { ...current, quotes, apiKey: '' }
    const currentQuotes = Array.isArray(current.quotes) ? JSON.stringify(current.quotes) : ''
    if (!row || currentQuotes !== JSON.stringify(quotes) || current.apiKey !== '') {
      await this.pool.query(
        `insert into public.user_settings (user_id, data, version, updated_at)
         values ($1, jsonb_build_object('quotes', $2::jsonb), 1, now())
         on conflict (user_id) do update set
           data = jsonb_set(coalesce(public.user_settings.data, '{}'::jsonb), '{quotes}', $2::jsonb, true) - 'apiKey',
           version = public.user_settings.version + 1, updated_at = now()`,
        [userId, JSON.stringify(quotes)],
      )
    }
    return next
  }

  async findUserById(userId: string): Promise<AuthUser | null> {
    const row = await this.one<UserRow>('select * from public.app_users where id = $1', [userId])
    if (!row) return null
    const profile = await this.getUserProfile(userId)
    return { ...mapUser(row), displayName: profile.displayName, ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}) }
  }

  async findByTokendanceSubject(subject: string): Promise<AuthUser | null> {
    const row = await this.one<UserRow>('select * from public.app_users where tokendance_subject = $1', [subject])
    if (!row) return null
    const profile = await this.getUserProfile(row.id)
    return { ...mapUser(row), displayName: profile.displayName, ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}) }
  }

  async findByPhone(phone: string): Promise<AuthUser | null> {
    const row = await this.one<UserRow>('select * from public.app_users where phone = $1', [phone])
    if (!row) return null
    const profile = await this.getUserProfile(row.id)
    return { ...mapUser(row), displayName: profile.displayName, ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}) }
  }

  async findByEmail(email: string): Promise<AuthUser | null> {
    const row = await this.one<UserRow>('select * from public.app_users where email = $1', [email])
    if (!row) return null
    const profile = await this.getUserProfile(row.id)
    return { ...mapUser(row), displayName: profile.displayName, ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}) }
  }

  async findByUsername(username: string): Promise<AuthUser | null> {
    const row = await this.one<UserRow>('select * from public.app_users where username = $1', [username])
    if (!row) return null
    const profile = await this.getUserProfile(row.id)
    return { ...mapUser(row), displayName: profile.displayName, ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}) }
  }

  async findPasswordHashByUsername(username: string): Promise<string | null> {
    const row = await this.one<{ password_hash: string | null }>('select password_hash from public.app_users where username = $1', [username])
    return row?.password_hash || null
  }

  async createUser(input: { tokendanceSubject?: string; username?: string; passwordHash?: string; displayName?: string; avatarUrl?: string; phone?: string; email?: string }): Promise<AuthUser> {
    const row = await this.one<UserRow>(
      `insert into public.app_users (tokendance_subject, username, password_hash, phone, email)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [input.tokendanceSubject || null, input.username || null, input.passwordHash || null, input.phone || null, input.email || null],
    )
    if (!row) throw new Error('User creation returned no row.')
    await this.ensureDefaultQuotes(row.id)
    return this.findUserById(row.id) as Promise<AuthUser>
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
    return this.findUserById(row.id) as Promise<AuthUser>
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
      `update public.auth_sessions
       set last_used_at = now()
       where id_hash = $1 and revoked_at is null and expires_at > now()
       returning id_hash, user_id, expires_at, created_at
      `,
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
    await this.ensureDefaultQuotes(userId)
    const row = await this.one<{
      books: string; notes: string; practices: string; qa_records: string; ai_usage_records: string;
      lists: string; relations: string; quotes: string; assistant_sessions: string; assistant_memories: string;
      storage_bytes: string; last_import_at: Date | string | null; last_sync_at: Date | string | null
    }>(`select
      (select count(*) from public.user_books where user_id = $1 and deleted_at is null) as books,
      (select coalesce(sum(jsonb_array_length(coalesce(data->'noteRecords', '[]'::jsonb))), 0) from public.user_books where user_id = $1 and deleted_at is null) as notes,
      (select coalesce(sum(jsonb_array_length(coalesce(data->'practiceRecords', '[]'::jsonb))), 0) from public.user_books where user_id = $1 and deleted_at is null) as practices,
      (select coalesce(sum(jsonb_array_length(coalesce(data->'qaPracticeRecords', '[]'::jsonb))), 0) from public.user_books where user_id = $1 and deleted_at is null) as qa_records,
      (select count(*) from public.user_ai_usage where user_id = $1) as ai_usage_records,
      (select count(*) from public.user_book_lists where user_id = $1) as lists,
      (select count(*) from public.user_book_relations where user_id = $1) as relations,
      (select coalesce(jsonb_array_length(case when jsonb_typeof(data->'quotes') = 'array' then data->'quotes' else '[]'::jsonb end), 0) from public.user_settings where user_id = $1) as quotes,
      (select count(*) from public.user_assistant_sessions where user_id = $1) as assistant_sessions,
      (select count(*) from public.user_assistant_memories where user_id = $1) as assistant_memories,
      (select coalesce(sum(bytes), 0) from (
        select coalesce(sum(pg_column_size(data)), 0)::bigint as bytes from public.user_settings where user_id = $1
        union all select coalesce(sum(pg_column_size(data)), 0)::bigint from public.user_books where user_id = $1 and deleted_at is null
        union all select coalesce(sum(pg_column_size(data)), 0)::bigint from public.user_ai_usage where user_id = $1
        union all select coalesce(sum(pg_column_size(data)), 0)::bigint from public.user_assistant_sessions where user_id = $1
        union all select coalesce(sum(pg_column_size(content)), 0)::bigint from public.user_assistant_memories where user_id = $1
        union all select coalesce(sum(pg_column_size(name) + coalesce(pg_column_size(description), 0) + pg_column_size(book_ids)), 0)::bigint from public.user_book_lists where user_id = $1
        union all select coalesce(sum(pg_column_size(relation_type) + coalesce(pg_column_size(note), 0)), 0)::bigint from public.user_book_relations where user_id = $1
      ) storage) as storage_bytes,
      (select last_import_at from public.user_data_state where user_id = $1) as last_import_at,
      (select last_sync_at from public.user_data_state where user_id = $1) as last_sync_at`, [userId])
    return {
      books: Number(row?.books || 0), notes: Number(row?.notes || 0), practices: Number(row?.practices || 0),
      qaRecords: Number(row?.qa_records || 0), aiUsageRecords: Number(row?.ai_usage_records || 0),
      lists: Number(row?.lists || 0), relations: Number(row?.relations || 0),
      quotes: Number(row?.quotes || 0), assistantSessions: Number(row?.assistant_sessions || 0),
      assistantMemories: Number(row?.assistant_memories || 0), storageBytes: Number(row?.storage_bytes || 0),
      lastImportAt: row?.last_import_at ? iso(row.last_import_at) : null,
      lastSyncAt: row?.last_sync_at ? iso(row.last_sync_at) : null,
    }
  }

  async exportUserData(userId: string): Promise<unknown> {
    const ensuredSettings = await this.ensureDefaultQuotes(userId)
    const [books, usage, lists, relations, assistantSessions, assistantMemories] = await Promise.all([
      this.pool.query<{ data: Record<string, unknown> }>('select data from public.user_books where user_id = $1 and deleted_at is null order by updated_at asc', [userId]),
      this.pool.query<{ data: Record<string, unknown> }>('select data from public.user_ai_usage where user_id = $1 order by created_at asc', [userId]),
      this.pool.query<{ list_id: string; name: string; description: string | null; book_ids: unknown; created_at: Date | string; updated_at: Date | string }>('select list_id, name, description, book_ids, created_at, updated_at from public.user_book_lists where user_id = $1 order by updated_at asc', [userId]),
      this.pool.query<{ relation_id: string; from_book_id: string; to_book_id: string; relation_type: string; note: string | null; created_at: Date | string; updated_at: Date | string }>('select relation_id, from_book_id, to_book_id, relation_type, note, created_at, updated_at from public.user_book_relations where user_id = $1 order by updated_at asc', [userId]),
      this.pool.query<{ session_id: string; title: string; book_id: string | null; data: unknown; created_at: Date | string; updated_at: Date | string }>('select session_id, title, book_id, data, created_at, updated_at from public.user_assistant_sessions where user_id = $1 order by updated_at asc', [userId]),
      this.pool.query<{ memory_id: string; content: string; category: AssistantMemoryRecord['category']; source_session_id: string | null; created_at: Date | string; updated_at: Date | string }>('select memory_id, content, category, source_session_id, created_at, updated_at from public.user_assistant_memories where user_id = $1 order by updated_at asc', [userId]),
    ])
    const safeSettings = { ...ensuredSettings, apiKey: '' }
    return {
      version: 5,
      exportDate: Date.now(),
      settings: safeSettings,
      books: books.rows.map(row => row.data),
      aiUsageRecords: usage.rows.map(row => row.data),
      bookLists: lists.rows.map(row => ({
        id: row.list_id,
        name: row.name,
        ...(row.description ? { description: row.description } : {}),
        bookIds: Array.isArray(row.book_ids) ? row.book_ids : [],
        createdAt: new Date(row.created_at).getTime(),
        updatedAt: new Date(row.updated_at).getTime(),
      })),
      bookRelations: relations.rows.map(row => ({
        id: row.relation_id,
        fromBookId: row.from_book_id,
        toBookId: row.to_book_id,
        type: row.relation_type,
        ...(row.note ? { note: row.note } : {}),
        createdAt: new Date(row.created_at).getTime(),
        updatedAt: new Date(row.updated_at).getTime(),
      })),
      assistantSessions: assistantSessions.rows.map(row => ({
        id: row.session_id,
        title: row.title,
        bookId: row.book_id || undefined,
        data: row.data,
        createdAt: new Date(row.created_at).getTime(),
        updatedAt: new Date(row.updated_at).getTime(),
      })),
      assistantMemories: assistantMemories.rows.map(row => ({
        id: row.memory_id,
        content: row.content,
        category: row.category,
        ...(row.source_session_id ? { sourceSessionId: row.source_session_id } : {}),
        createdAt: new Date(row.created_at).getTime(),
        updatedAt: new Date(row.updated_at).getTime(),
      })),
    }
  }

  async saveUserSettings(userId: string, data: unknown): Promise<void> {
    const incoming = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {}
    const current = await this.ensureDefaultQuotes(userId)
    // Profile fields have their own atomic endpoint. Ignore a stale profile
    // snapshot from the client so settings writes cannot revert a new name/avatar.
    const { profile: _profile, ...settingsIncoming } = incoming
    const settings = { ...settingsIncoming, quotes: mergeDefaultQuotes(incoming.quotes ?? current.quotes), apiKey: '' }
    await this.pool.query(
      `insert into public.user_settings (user_id, data, version, updated_at)
       values ($1, $2::jsonb, 1, now())
       on conflict (user_id) do update set data = coalesce(public.user_settings.data, '{}'::jsonb) || excluded.data,
         version = public.user_settings.version + 1, updated_at = now()`,
      [userId, JSON.stringify(settings)],
    )
  }

  async getUserProfile(userId: string): Promise<UserProfile> {
    const settings = await this.one<{ data: unknown }>('select data from public.user_settings where user_id = $1', [userId])
    return profileFromSettings(settings?.data)
  }

  async saveUserProfile(userId: string, profile: UserProfile): Promise<UserProfile> {
    return this.saveUserProfilePatch(userId, {
      customDisplayName: profile.customDisplayName,
      customAvatarUrl: profile.customAvatarUrl,
    })
  }

  async saveUserProfilePatch(userId: string, patch: { customDisplayName?: string | null; customAvatarUrl?: string | null }): Promise<UserProfile> {
    await this.ensureDefaultQuotes(userId)
    const customDisplayName = patch.customDisplayName?.trim() || null
    const customAvatarUrl = patch.customAvatarUrl?.trim() || null
    if (customDisplayName && (customDisplayName.length > 40 || /[\u0000-\u001f]/.test(customDisplayName))) throw new Error('昵称长度或格式无效。')
    if (customAvatarUrl?.startsWith('data:image/')) {
      if (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(customAvatarUrl) || customAvatarUrl.length > 1_500_000) throw new Error('头像图片格式或大小无效。')
    } else if (customAvatarUrl && (customAvatarUrl.length > 2000 || !/^https:\/\//i.test(customAvatarUrl))) {
      throw new Error('头像地址必须是 HTTPS 链接。')
    }
    const profilePatch = {
      ...(patch.customDisplayName !== undefined ? { customDisplayName } : {}),
      ...(patch.customAvatarUrl !== undefined ? { customAvatarUrl } : {}),
    }
    await this.pool.query(
      `insert into public.user_settings (user_id, data, version, updated_at)
       values ($1, jsonb_build_object('profile', $2::jsonb), 1, now())
       on conflict (user_id) do update set
         data = jsonb_set(coalesce(public.user_settings.data, '{}'::jsonb), '{profile}',
           coalesce(public.user_settings.data->'profile', '{}'::jsonb) || $2::jsonb, true) - 'apiKey',
         version = public.user_settings.version + 1, updated_at = now()`,
      [userId, JSON.stringify(profilePatch)],
    )
    return this.getUserProfile(userId)
  }

  async syncWatchaProfile(userId: string, profile: { nickname?: string; avatarUrl?: string | null }): Promise<void> {
    await this.ensureDefaultQuotes(userId)
    const nickname = typeof profile.nickname === 'string' ? profile.nickname.trim().slice(0, 80) : ''
    const avatarUrl = typeof profile.avatarUrl === 'string' && profile.avatarUrl.trim() ? profile.avatarUrl.trim().slice(0, 2000) : null
    const profilePatch = {
      ...(nickname ? { watchaNickname: nickname } : {}),
      watchaAvatarUrl: avatarUrl,
    }
    await this.pool.query(
      `insert into public.user_settings (user_id, data, version, updated_at)
       values ($1, jsonb_build_object('profile', $2::jsonb), 1, now())
       on conflict (user_id) do update set
         data = jsonb_set(coalesce(public.user_settings.data, '{}'::jsonb), '{profile}',
           coalesce(public.user_settings.data->'profile', '{}'::jsonb) || $2::jsonb, true) - 'apiKey',
         version = public.user_settings.version + 1, updated_at = now()`,
      [userId, JSON.stringify(profilePatch)],
    )
  }

  async getMigrationState(userId: string, activateWindow = false): Promise<MigrationState> {
    if (activateWindow) {
      await this.pool.query(
        `insert into public.user_data_state (user_id, migration_deadline_at)
         values ($1, timestamptz '2026-10-01 00:00:00+08')
         on conflict (user_id) do update set migration_deadline_at = excluded.migration_deadline_at
         where public.user_data_state.migration_status <> 'completed'`,
        [userId],
      )
    } else {
      await this.pool.query(`insert into public.user_data_state (user_id) values ($1) on conflict (user_id) do nothing`, [userId])
    }
    const row = await this.one<MigrationStateRow>(
      `select migration_status, migration_version, migration_started_at,
         migration_deadline_at, migration_completed_at, last_migration_error, sync_version
       from public.user_data_state where user_id = $1`,
      [userId],
    )
    if (!row) throw new Error('Migration state unavailable.')
    return {
      status: row.migration_status,
      version: Number(row.migration_version || 0),
      startedAt: row.migration_started_at ? iso(row.migration_started_at) : null,
      deadlineAt: row.migration_deadline_at ? iso(row.migration_deadline_at) : null,
      completedAt: row.migration_completed_at ? iso(row.migration_completed_at) : null,
      lastError: row.last_migration_error,
      syncVersion: Number(row.sync_version || 0),
    }
  }

  async migrateUserData(userId: string, payload: unknown): Promise<MigrationResult> {
    const normalized = normalizeImportData(payload)
    if (!normalized.valid) throw new Error(normalized.error)
    const data = normalized.data
    const books = data.books.filter(book => book.id !== SAMPLE_BOOK_ID && !book.isSample)
    const bookIds = new Set(books.map(book => book.id))
    const lists = data.bookLists.map(list => ({
      ...list,
      bookIds: list.bookIds.filter(bookId => bookIds.has(bookId)),
    }))
    const relations = data.bookRelations.filter(relation => bookIds.has(relation.fromBookId) && bookIds.has(relation.toBookId))
    const usageRecords = data.aiUsageRecords.filter(record => !record.bookId || bookIds.has(record.bookId))
    const assistantSessions = data.assistantSessions
    const assistantMemories = data.assistantMemories
    const client = await this.pool.connect()
    const migrationVersion = 1
    try {
      await client.query('begin')
      await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [userId])
      const state = await client.query<MigrationStateRow>(
        `select migration_status, migration_deadline_at from public.user_data_state where user_id = $1 for update`,
        [userId],
      )
      const current = state.rows[0]
      if (current?.migration_status === 'completed') {
        throw new Error('历史数据已经迁移完成。')
      }
      const migrationCutoff = Date.parse('2026-10-01T00:00:00+08:00')
      if (migrationCutoff <= Date.now()) {
        throw new Error('历史数据迁移入口已过期。')
      }
      await client.query(
        `insert into public.user_data_state
           (user_id, migration_status, migration_version, migration_started_at, migration_deadline_at, last_migration_error, updated_at)
         values ($1, 'running', $2, now(), timestamptz '2026-10-01 00:00:00+08', null, now())
         on conflict (user_id) do update set migration_status = 'running', migration_version = $2,
           migration_started_at = coalesce(public.user_data_state.migration_started_at, now()),
           migration_deadline_at = timestamptz '2026-10-01 00:00:00+08',
           last_migration_error = null, updated_at = now()`,
        [userId, migrationVersion],
      )
      const settings = { ...(data.settings || {}), apiKey: '', quotes: mergeDefaultQuotes((data.settings as { quotes?: unknown } | undefined)?.quotes) }
      const settingsAt = new Date(data.exportDate)
      await client.query(
        `insert into public.user_settings (user_id, data, version, updated_at)
         values ($1, $2::jsonb, 1, to_timestamp($3 / 1000.0))
         on conflict (user_id) do update set data = excluded.data, version = public.user_settings.version + 1, updated_at = excluded.updated_at
         where excluded.updated_at >= public.user_settings.updated_at`,
        [userId, JSON.stringify(settings), settingsAt.getTime()],
      )
      for (const book of books) {
        await client.query(
          `insert into public.user_books (user_id, book_id, name, author, status, current_phase, best_score, data, created_at, updated_at, imported_at, deleted_at, purge_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, to_timestamp($9 / 1000.0), to_timestamp($10 / 1000.0), now(), null, null)
           on conflict (user_id, book_id) do update set name=excluded.name, author=excluded.author, status=excluded.status,
             current_phase=excluded.current_phase, best_score=excluded.best_score, data=excluded.data,
             updated_at=excluded.updated_at, deleted_at=null, purge_at=null
           where excluded.updated_at >= public.user_books.updated_at`,
          [userId, book.id, book.name, book.author || null, book.status, book.currentPhase, book.bestScore, JSON.stringify(book), book.createdAt, book.updatedAt],
        )
      }
      for (const record of usageRecords) {
        await client.query(
          `insert into public.user_ai_usage (user_id, record_id, book_id, session_id, task, model, prompt_tokens, completion_tokens, total_tokens, data, created_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, to_timestamp($11 / 1000.0))
           on conflict (user_id, record_id) do update set data=excluded.data, updated_at=now()
           where excluded.created_at >= public.user_ai_usage.created_at`,
          [userId, record.id, record.bookId || null, record.sessionId || null, record.task, record.model, record.promptTokens, record.completionTokens, record.totalTokens, JSON.stringify(record), record.createdAt],
        )
      }
      for (const list of lists) {
        await client.query(
          `insert into public.user_book_lists (user_id, list_id, name, description, book_ids, created_at, updated_at)
           values ($1, $2, $3, $4, $5::jsonb, to_timestamp($6 / 1000.0), to_timestamp($7 / 1000.0))
           on conflict (user_id, list_id) do update set name=excluded.name, description=excluded.description,
             book_ids=excluded.book_ids, updated_at=excluded.updated_at
           where excluded.updated_at >= public.user_book_lists.updated_at`,
          [userId, list.id, list.name, list.description || null, JSON.stringify(list.bookIds), list.createdAt, list.updatedAt],
        )
      }
      for (const relation of relations) {
        await client.query(
          `insert into public.user_book_relations (user_id, relation_id, from_book_id, to_book_id, relation_type, note, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0), to_timestamp($8 / 1000.0))
           on conflict (user_id, relation_id) do update set from_book_id=excluded.from_book_id, to_book_id=excluded.to_book_id,
             relation_type=excluded.relation_type, note=excluded.note, updated_at=excluded.updated_at
           where excluded.updated_at >= public.user_book_relations.updated_at`,
          [userId, relation.id, relation.fromBookId, relation.toBookId, relation.type, relation.note || null, relation.createdAt, relation.updatedAt || relation.createdAt],
        )
      }
      for (const session of assistantSessions) {
        await client.query(
          `insert into public.user_assistant_sessions
             (user_id, session_id, title, book_id, data, created_at, updated_at)
           values ($1, $2, $3, $4, $5::jsonb, to_timestamp($6 / 1000.0), to_timestamp($7 / 1000.0))
           on conflict (user_id, session_id) do update set title=excluded.title, book_id=excluded.book_id,
             data=excluded.data, updated_at=excluded.updated_at
           where excluded.updated_at >= public.user_assistant_sessions.updated_at`,
          [userId, session.id, session.title, session.bookId || null, JSON.stringify(session.data), session.createdAt, session.updatedAt],
        )
      }
      for (const memory of assistantMemories) {
        await client.query(
          `insert into public.user_assistant_memories
             (user_id, memory_id, content, category, source_session_id, created_at, updated_at)
           values ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0), to_timestamp($7 / 1000.0))
           on conflict (user_id, memory_id) do update set content=excluded.content, category=excluded.category,
             source_session_id=excluded.source_session_id, updated_at=excluded.updated_at
           where excluded.updated_at >= public.user_assistant_memories.updated_at`,
          [userId, memory.id, memory.content, memory.category, memory.sourceSessionId || null, memory.createdAt, memory.updatedAt],
        )
      }
      const result = await client.query<{ sync_version: number }>(
        `update public.user_data_state set migration_status='completed', migration_completed_at=now(),
           last_import_at=now(), last_sync_at=now(), sync_version=sync_version + 1, updated_at=now()
         where user_id=$1 returning sync_version`,
        [userId],
      )
      await client.query('commit')
      return {
        status: 'completed', migrationVersion, syncVersion: Number(result.rows[0]?.sync_version || 0),
        booksImported: books.length, aiUsageImported: usageRecords.length,
        listsImported: lists.length, relationsImported: relations.length,
        assistantSessionsImported: assistantSessions.length,
        assistantMemoriesImported: assistantMemories.length,
      }
    } catch (error) {
      await client.query('rollback')
      try {
        await this.pool.query(
          `insert into public.user_data_state (user_id, migration_status, last_migration_error, updated_at)
           values ($1, 'failed', $2, now())
           on conflict (user_id) do update set migration_status='failed', last_migration_error=$2, updated_at=now()
           where public.user_data_state.migration_status <> 'completed'`,
          [userId, error instanceof Error ? error.message : '迁移失败'],
        )
      } catch { /* preserve original migration error */ }
      throw error
    } finally {
      client.release()
    }
  }

  async listRecycleBin(userId: string): Promise<RecycleBinItem[]> {
    const result = await this.pool.query<{ book_id: string; name: string; author: string | null; deleted_at: Date | string; purge_at: Date | string | null }>(
      `select book_id, name, author, deleted_at, purge_at from public.user_books
       where user_id = $1 and deleted_at is not null and deleted_at > now() - interval '7 days'
       order by deleted_at desc`, [userId],
    )
    return result.rows.map(row => ({ bookId: row.book_id, name: row.name, author: row.author, deletedAt: iso(row.deleted_at), purgeAt: row.purge_at ? iso(row.purge_at) : null }))
  }

  async softDeleteBook(userId: string, bookId: string): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      const result = await client.query(
        `update public.user_books set deleted_at = now(), purge_at = now() + interval '30 days', updated_at = now()
         where user_id = $1 and book_id = $2 and deleted_at is null`, [userId, bookId],
      )
      if (result.rowCount !== 1) throw new Error('书籍不存在。')
      await client.query(`delete from public.user_book_relations where user_id = $1 and (from_book_id = $2 or to_book_id = $2)`, [userId, bookId])
      await client.query(`update public.user_book_lists set book_ids = coalesce((select jsonb_agg(value) from jsonb_array_elements(book_ids) value where value #>> '{}' <> $2), '[]'::jsonb), updated_at = now() where user_id = $1`, [userId, bookId])
      await client.query('commit')
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally { client.release() }
  }

  async restoreBook(userId: string, bookId: string): Promise<void> {
    const result = await this.pool.query(
      `update public.user_books set deleted_at = null, purge_at = null, updated_at = now()
       where user_id = $1 and book_id = $2 and deleted_at is not null
         and deleted_at > now() - interval '7 days'`, [userId, bookId],
    )
    if (result.rowCount !== 1) throw new Error('书籍不存在或当前无法恢复。')
  }

  async permanentlyDeleteBook(userId: string, bookId: string): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      const result = await client.query('delete from public.user_books where user_id = $1 and book_id = $2 and deleted_at is not null', [userId, bookId])
      if (result.rowCount !== 1) throw new Error('回收站中未找到该书籍。')
      await client.query(`delete from public.user_book_relations where user_id = $1 and (from_book_id = $2 or to_book_id = $2)`, [userId, bookId])
      await client.query(`update public.user_book_lists set book_ids = coalesce((select jsonb_agg(value) from jsonb_array_elements(book_ids) value where value #>> '{}' <> $2), '[]'::jsonb), updated_at = now() where user_id = $1`, [userId, bookId])
      await client.query('commit')
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally { client.release() }
  }

  async purgeRecycleBin(userId: string): Promise<number> {
    const result = await this.pool.query(
      `delete from public.user_books where user_id = $1 and deleted_at is not null
       and coalesce(purge_at, deleted_at + interval '30 days') <= now()`, [userId],
    )
    return result.rowCount || 0
  }

  /** Purge expired recycle-bin rows for all accounts; call from a server timer. */
  async purgeExpiredRecycleBin(): Promise<number> {
    const result = await this.pool.query(
      `delete from public.user_books where deleted_at is not null
       and coalesce(purge_at, deleted_at + interval '30 days') <= now()`,
    )
    return result.rowCount || 0
  }

  async importUserData(userId: string, payload: unknown): Promise<ImportResult> {
    const normalized = normalizeImportData(payload)
    if (!normalized.valid) throw new Error(normalized.error)
    const data = normalized.data
    const books = data.books.filter(item => item.id !== SAMPLE_BOOK_ID && !item.isSample)
    const bookIds = new Set(books.map(book => book.id))
    const lists = data.bookLists.map(list => ({ ...list, bookIds: list.bookIds.filter(bookId => bookIds.has(bookId)) }))
    const relations = data.bookRelations.filter(relation => bookIds.has(relation.fromBookId) && bookIds.has(relation.toBookId))
    const usageRecords = data.aiUsageRecords.filter(record => !record.bookId || bookIds.has(record.bookId))
    const assistantSessions = data.assistantSessions
    const assistantMemories = data.assistantMemories
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      const settings = { ...data.settings, apiKey: '', quotes: mergeDefaultQuotes(data.settings.quotes) }
      await client.query(`insert into public.user_settings (user_id, data, version, updated_at) values ($1, $2::jsonb, 1, now())
        on conflict (user_id) do update set data = excluded.data, version = public.user_settings.version + 1, updated_at = now()`, [userId, JSON.stringify(settings)])
      for (const book of books) {
        await client.query(`insert into public.user_books (user_id, book_id, name, author, status, current_phase, best_score, data, created_at, updated_at, imported_at, deleted_at)
          values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, to_timestamp($9 / 1000.0), to_timestamp($10 / 1000.0), now(), null)
          on conflict (user_id, book_id) do update set name=excluded.name, author=excluded.author, status=excluded.status,
            current_phase=excluded.current_phase, best_score=excluded.best_score, data=excluded.data, updated_at=excluded.updated_at
            where excluded.updated_at >= public.user_books.updated_at`,
        [userId, book.id, book.name, book.author || null, book.status, book.currentPhase, book.bestScore, JSON.stringify(book), book.createdAt, book.updatedAt])
      }
      for (const record of usageRecords) {
        await client.query(`insert into public.user_ai_usage (user_id, record_id, book_id, session_id, task, model, prompt_tokens, completion_tokens, total_tokens, data, created_at)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, to_timestamp($11 / 1000.0))
          on conflict (user_id, record_id) do update set data=excluded.data, updated_at=now()
          where excluded.created_at >= public.user_ai_usage.created_at`,
        [userId, record.id, record.bookId || null, record.sessionId || null, record.task, record.model, record.promptTokens, record.completionTokens, record.totalTokens, JSON.stringify(record), record.createdAt])
      }
      for (const list of lists) {
        await client.query(`insert into public.user_book_lists (user_id, list_id, name, description, book_ids, created_at, updated_at)
          values ($1, $2, $3, $4, $5::jsonb, to_timestamp($6 / 1000.0), to_timestamp($7 / 1000.0))
          on conflict (user_id, list_id) do update set name=excluded.name, description=excluded.description, book_ids=excluded.book_ids, updated_at=excluded.updated_at
          where excluded.updated_at >= public.user_book_lists.updated_at`,
        [userId, list.id, list.name, list.description || null, JSON.stringify(list.bookIds), list.createdAt, list.updatedAt])
      }
      for (const relation of relations) {
        await client.query(`insert into public.user_book_relations (user_id, relation_id, from_book_id, to_book_id, relation_type, note, created_at, updated_at)
          values ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0), to_timestamp($8 / 1000.0))
          on conflict (user_id, relation_id) do update set from_book_id=excluded.from_book_id, to_book_id=excluded.to_book_id, relation_type=excluded.relation_type, note=excluded.note, updated_at=excluded.updated_at
          where excluded.updated_at >= public.user_book_relations.updated_at`,
        [userId, relation.id, relation.fromBookId, relation.toBookId, relation.type, relation.note || null, relation.createdAt, relation.updatedAt || relation.createdAt])
      }
      for (const session of assistantSessions) {
        await client.query(`insert into public.user_assistant_sessions
          (user_id, session_id, title, book_id, data, created_at, updated_at)
          values ($1, $2, $3, $4, $5::jsonb, to_timestamp($6 / 1000.0), to_timestamp($7 / 1000.0))
          on conflict (user_id, session_id) do update set title=excluded.title, book_id=excluded.book_id,
            data=excluded.data, updated_at=excluded.updated_at
          where excluded.updated_at >= public.user_assistant_sessions.updated_at`,
        [userId, session.id, session.title, session.bookId || null, JSON.stringify(session.data), session.createdAt, session.updatedAt])
      }
      for (const memory of assistantMemories) {
        await client.query(`insert into public.user_assistant_memories
          (user_id, memory_id, content, category, source_session_id, created_at, updated_at)
          values ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0), to_timestamp($7 / 1000.0))
          on conflict (user_id, memory_id) do update set content=excluded.content, category=excluded.category,
            source_session_id=excluded.source_session_id, updated_at=excluded.updated_at
          where excluded.updated_at >= public.user_assistant_memories.updated_at`,
        [userId, memory.id, memory.content, memory.category, memory.sourceSessionId || null, memory.createdAt, memory.updatedAt])
      }
      await client.query(`insert into public.user_data_state (user_id, schema_version, sync_version, last_import_at, last_sync_at, updated_at)
        values ($1, $2, 1, now(), now(), now()) on conflict (user_id) do update set schema_version=excluded.schema_version,
        sync_version=public.user_data_state.sync_version + 1, last_import_at=now(), last_sync_at=now(), updated_at=now()`, [userId, data.version])
      await client.query('commit')
      return {
        booksImported: books.length,
        aiUsageImported: usageRecords.length,
        listsImported: lists.length,
        relationsImported: relations.length,
        assistantSessionsImported: assistantSessions.length,
        assistantMemoriesImported: assistantMemories.length,
      }
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }

  async listAssistantSessions(userId: string): Promise<AssistantSessionRecord[]> {
    const result = await this.pool.query<{
      session_id: string
      title: string
      book_id: string | null
      data: unknown
      created_at: Date | string
      updated_at: Date | string
    }>(
      `select session_id, title, book_id, data, created_at, updated_at
       from public.user_assistant_sessions where user_id = $1
       order by updated_at desc`,
      [userId],
    )
    return result.rows.map(row => ({
      sessionId: row.session_id,
      title: row.title,
      bookId: row.book_id,
      data: row.data,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    }))
  }

  async saveAssistantSession(userId: string, session: AssistantSessionRecord): Promise<void> {
    await this.pool.query(
      `insert into public.user_assistant_sessions
         (user_id, session_id, title, book_id, data, created_at, updated_at)
       values ($1, $2, $3, $4, $5::jsonb, $6, $7)
       on conflict (user_id, session_id) do update set
         title = excluded.title, book_id = excluded.book_id, data = excluded.data,
         updated_at = excluded.updated_at
       where excluded.updated_at >= public.user_assistant_sessions.updated_at`,
      [userId, session.sessionId, session.title, session.bookId, JSON.stringify(session.data), session.createdAt, session.updatedAt],
    )
  }

  async deleteAssistantSession(userId: string, sessionId: string): Promise<void> {
    await this.pool.query(
      'delete from public.user_assistant_sessions where user_id = $1 and session_id = $2',
      [userId, sessionId],
    )
  }

  async clearAssistantSessions(userId: string): Promise<void> {
    await this.pool.query('delete from public.user_assistant_sessions where user_id = $1', [userId])
  }

  async listAssistantMemories(userId: string): Promise<AssistantMemoryRecord[]> {
    const result = await this.pool.query<{
      memory_id: string
      content: string
      category: AssistantMemoryRecord['category']
      source_session_id: string | null
      created_at: Date | string
      updated_at: Date | string
    }>(
      `select memory_id, content, category, source_session_id, created_at, updated_at
       from public.user_assistant_memories where user_id = $1
       order by updated_at desc`,
      [userId],
    )
    return result.rows.map(row => ({
      memoryId: row.memory_id,
      content: row.content,
      category: row.category,
      sourceSessionId: row.source_session_id,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    }))
  }

  async saveAssistantMemory(userId: string, memory: AssistantMemoryRecord): Promise<void> {
    const content = memory.content.trim()
    if (!content || content.length > 500) throw new Error('长期记忆内容格式无效。')
    if (!['preference', 'learning-style', 'goal', 'workflow'].includes(memory.category)) {
      throw new Error('长期记忆类别无效。')
    }
    await this.pool.query(
      `insert into public.user_assistant_memories
         (user_id, memory_id, content, category, source_session_id, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (user_id, memory_id) do update set
         content=excluded.content, category=excluded.category,
         source_session_id=excluded.source_session_id, updated_at=excluded.updated_at
       where excluded.updated_at >= public.user_assistant_memories.updated_at`,
      [userId, memory.memoryId, content, memory.category, memory.sourceSessionId, memory.createdAt, memory.updatedAt],
    )
  }

  async deleteAssistantMemory(userId: string, memoryId: string): Promise<void> {
    await this.pool.query(
      'delete from public.user_assistant_memories where user_id = $1 and memory_id = $2',
      [userId, memoryId],
    )
  }

  async clearAssistantMemories(userId: string): Promise<void> {
    await this.pool.query('delete from public.user_assistant_memories where user_id = $1', [userId])
  }

  async recordBehaviorEvent(userId: string, eventType: string, payload: unknown, occurredAt?: string): Promise<void> {
    const consent = await this.one<{ enabled: boolean }>(
      `select case when data->>'personalizationAnalyticsEnabled' = 'false' then false else true end as enabled
       from public.user_settings where user_id = $1`, [userId],
    )
    if (consent?.enabled === false) return
    await this.pool.query(
      `insert into public.user_behavior_events (user_id, event_type, payload, occurred_at)
       values ($1, $2, $3::jsonb, coalesce($4::timestamptz, now()))`,
      [userId, eventType.trim().slice(0, 80), JSON.stringify(payload && typeof payload === 'object' ? payload : {}), occurredAt || null],
    )
  }

  async getActivityCalendar(userId: string, from: string, to: string): Promise<ActivityDay[]> {
    // The analytics migration is optional during rollout. A missing events table
    // should not hide the calendar data available from core account tables.
    const safeQuery = async <T extends QueryResultRow>(text: string, values: unknown[]): Promise<T[]> => {
      try {
        const result = await this.pool.query<T>(text, values)
        return result.rows
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '42P01') return []
        throw error
      }
    }
    const values = [userId, from, to]
    const [bookRows, aiRows, assistantRows, eventRows] = await Promise.all([
      safeQuery<{ day: string; category: string; count: string }>(
        `select (updated_at at time zone 'UTC')::date::text as day, 'reading' as category, count(*)::text as count
         from public.user_books
         where user_id = $1 and deleted_at is null and updated_at >= $2::date and updated_at < ($3::date + interval '1 day')
         group by 1`, values),
      safeQuery<{ day: string; category: string; count: string }>(
        `select (created_at at time zone 'UTC')::date::text as day, 'ai' as category, count(*)::text as count
         from public.user_ai_usage
         where user_id = $1 and created_at >= $2::date and created_at < ($3::date + interval '1 day')
         group by 1`, values),
      safeQuery<{ day: string; category: string; count: string }>(
        `select (updated_at at time zone 'UTC')::date::text as day, 'assistant' as category, count(*)::text as count
         from public.user_assistant_sessions
         where user_id = $1 and updated_at >= $2::date and updated_at < ($3::date + interval '1 day')
         group by 1`, values),
      safeQuery<{ day: string; category: string; count: string }>(
        `select (occurred_at at time zone 'UTC')::date::text as day,
           case when event_type like 'assistant%' then 'assistant'
                when event_type like 'ai%' then 'ai' else 'activity' end as category,
           count(*)::text as count
         from public.user_behavior_events
         where user_id = $1 and occurred_at >= $2::date and occurred_at < ($3::date + interval '1 day')
         group by 1, 2`, values),
    ])
    const byDate = new Map<string, ActivityDay>()
    for (const row of [...bookRows, ...aiRows, ...assistantRows, ...eventRows]) {
      const count = Math.max(0, Number(row.count) || 0)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.day) || count === 0) continue
      const day = byDate.get(row.day) || { date: row.day, count: 0, categories: {} }
      day.count += count
      day.categories[row.category] = (day.categories[row.category] || 0) + count
      byDate.set(row.day, day)
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  }
}

export async function closePostgresPersistence(adapter: PostgresPersistenceAdapter): Promise<void> {
  await (adapter as unknown as { pool: Pool }).pool.end()
}
