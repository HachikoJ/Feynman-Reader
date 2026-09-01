import { createHash, randomBytes } from 'node:crypto'
import { Pool, type QueryResultRow } from 'pg'
import type { AuthSession, AuthUser } from './auth'
import type {
  ApiKeyRecord,
  AssistantMemoryRecord,
  AssistantSessionRecord,
  ActivityDay,
  AccountMergeResult,
  AdminAuditEntry,
  AdminDashboard,
  AdminRole,
  AdminSessionRecord,
  AdminTotpCredential,
  ImportResult,
  MigrationResult,
  MigrationState,
  PersistenceAdapter,
  RecycleBinItem,
  UserProfile,
  UserBookSummary,
  UserDataSummary,
} from './persistence'
import { normalizeImportData } from '@/lib/backupValidation'
import { SAMPLE_BOOK_ID } from '@/lib/sampleBook'
import { mergeDefaultQuotes } from '@/lib/defaultQuotes'
import { isWatchaOAuthEnabled } from './authConfig'

type UserRow = {
  id: string
  username: string | null
  password_hash: string | null
  display_name: string | null
  avatar_url: string | null
  tokendance_subject: string | null
  phone: string | null
  email: string | null
  phone_verified_at: Date | string | null
  email_verified_at: Date | string | null
  created_at: Date | string
  updated_at: Date | string
  merged_into_user_id: string | null
  merged_at: Date | string | null
  login_disabled_at: Date | string | null
  password_account_merged_at: Date | string | null
}

type UserWithProfileRow = UserRow & { profile_data: unknown }

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
    ...(row.password_hash ? { hasPassword: true } : {}),
    ...(row.display_name ? { displayName: row.display_name } : {}),
    ...(row.avatar_url ? { avatarUrl: row.avatar_url } : {}),
    ...(row.tokendance_subject ? { tokendanceSubject: row.tokendance_subject } : {}),
    ...(row.password_account_merged_at ? { passwordAccountMergedAt: iso(row.password_account_merged_at) } : {}),
    ...(row.phone ? { phone: row.phone } : {}),
    ...(row.email ? { email: row.email } : {}),
    ...(row.phone_verified_at ? { phoneVerifiedAt: iso(row.phone_verified_at) } : {}),
    ...(row.email_verified_at ? { emailVerifiedAt: iso(row.email_verified_at) } : {}),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

function profileFromSettings(settings: unknown, canonical?: { displayName?: string | null; avatarUrl?: string | null }): UserProfile {
  const item = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? settings as ProfileSettings
    : {}
  const profile = item.profile && typeof item.profile === 'object' ? item.profile : {}
  const watchaName = typeof profile.watchaNickname === 'string' ? profile.watchaNickname.trim() : ''
  const watchaAvatar = typeof profile.watchaAvatarUrl === 'string' && profile.watchaAvatarUrl.trim() ? profile.watchaAvatarUrl.trim() : null
  const customName = typeof profile.customDisplayName === 'string' && profile.customDisplayName.trim() ? profile.customDisplayName.trim() : null
  const customAvatar = typeof profile.customAvatarUrl === 'string' && profile.customAvatarUrl.trim() ? profile.customAvatarUrl.trim() : null
  return {
    displayName: canonical?.displayName?.trim() || customName || watchaName || '观猹用户',
    avatarUrl: canonical?.avatarUrl?.trim() || customAvatar || watchaAvatar,
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

type SettingsRow = {
  data: unknown
  version: number | string
  updated_at: Date | string
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function mergeAccountSettings(source: SettingsRow | null, target: SettingsRow | null): Record<string, unknown> {
  const sourceData = objectValue(source?.data)
  const targetData = objectValue(target?.data)
  const sourceIsNewer = Boolean(source && (!target || new Date(source.updated_at).getTime() > new Date(target.updated_at).getTime()))
  const older = sourceIsNewer ? targetData : sourceData
  const newer = sourceIsNewer ? sourceData : targetData
  const targetProfile = objectValue(targetData.profile)
  return {
    ...older,
    ...newer,
    profile: targetProfile,
    quotes: mergeDefaultQuotes([
      ...(Array.isArray(sourceData.quotes) ? sourceData.quotes : []),
      ...(Array.isArray(targetData.quotes) ? targetData.quotes : []),
    ]),
    apiKey: '',
  }
}

export class PostgresPersistenceAdapter implements PersistenceAdapter {
  private readonly pool: Pool

  constructor(connectionString = process.env.DATABASE_URL) {
    if (!connectionString?.trim()) throw new Error('DATABASE_URL is not configured.')
    const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, '\n').trim()
    const databaseHost = new URL(connectionString).hostname.toLowerCase()
    const localDatabase = databaseHost === '127.0.0.1' || databaseHost === 'localhost' || databaseHost === '::1'
    this.pool = new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: localDatabase ? false : ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
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
    if (!row || currentQuotes !== JSON.stringify(quotes) || Object.prototype.hasOwnProperty.call(current, 'apiKey')) {
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

  /** Read settings without turning a GET request into a write transaction. */
  private async readUserSettings(userId: string): Promise<Record<string, unknown>> {
    const row = await this.one<{ data: unknown }>('select data from public.user_settings where user_id = $1', [userId])
    const current = objectValue(row?.data)
    return {
      ...current,
      quotes: mergeDefaultQuotes(current.quotes),
      apiKey: '',
    }
  }

  private async findActiveUserBy(
    field: 'id' | 'tokendance_subject' | 'phone' | 'email' | 'username',
    value: string,
  ): Promise<AuthUser | null> {
    const row = await this.one<UserWithProfileRow>(
      `select u.*, s.data->'profile' as profile_data
       from public.app_users u
       left join public.user_settings s on s.user_id = u.id
       where u.${field} = $1 and u.login_disabled_at is null`,
      [value],
    )
    if (!row) return null
    const profile = profileFromSettings({ profile: row.profile_data }, { displayName: row.display_name, avatarUrl: row.avatar_url })
    return {
      ...mapUser(row),
      displayName: row.display_name || profile.displayName,
      ...(row.avatar_url || profile.avatarUrl ? { avatarUrl: row.avatar_url || profile.avatarUrl || undefined } : {}),
    }
  }

  async findUserById(userId: string): Promise<AuthUser | null> {
    return this.findActiveUserBy('id', userId)
  }

  async findByTokendanceSubject(subject: string): Promise<AuthUser | null> {
    return this.findActiveUserBy('tokendance_subject', subject)
  }

  async findByPhone(phone: string): Promise<AuthUser | null> {
    return this.findActiveUserBy('phone', phone)
  }

  async findByEmail(email: string): Promise<AuthUser | null> {
    return this.findActiveUserBy('email', email)
  }

  async findByUsername(username: string): Promise<AuthUser | null> {
    return this.findActiveUserBy('username', username)
  }

  async findPasswordHashByUsername(username: string): Promise<string | null> {
    const row = await this.one<{ password_hash: string | null }>('select password_hash from public.app_users where username = $1 and login_disabled_at is null', [username])
    return row?.password_hash || null
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.pool.query(
      'update public.app_users set password_hash = $2, updated_at = now() where id = $1',
      [userId, passwordHash],
    )
  }

  async createUser(input: { tokendanceSubject?: string; username?: string; passwordHash?: string; displayName?: string; avatarUrl?: string; phone?: string; email?: string }): Promise<AuthUser> {
    const row = await this.one<UserRow>(
      `insert into public.app_users (tokendance_subject, username, password_hash, display_name, avatar_url, phone, email)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning *`,
      [input.tokendanceSubject || null, input.username || null, input.passwordHash || null, input.displayName || null, input.avatarUrl || null, input.phone || null, input.email || null],
    )
    if (!row) throw new Error('User creation returned no row.')
    await this.ensureDefaultQuotes(row.id)
    return this.findUserById(row.id) as Promise<AuthUser>
  }

  async updateUser(userId: string, patch: Partial<Pick<AuthUser, 'tokendanceSubject' | 'username' | 'displayName' | 'avatarUrl' | 'phone' | 'email' | 'phoneVerifiedAt' | 'emailVerifiedAt'>>): Promise<AuthUser> {
    const fields: string[] = []
    const values: unknown[] = []
    const add = (field: string, value: unknown) => {
      values.push(value)
      fields.push(`${field} = $${values.length}`)
    }
    if (patch.tokendanceSubject !== undefined) add('tokendance_subject', patch.tokendanceSubject)
    if (patch.username !== undefined) add('username', patch.username)
    if (patch.displayName !== undefined) add('display_name', patch.displayName)
    if (patch.avatarUrl !== undefined) add('avatar_url', patch.avatarUrl)
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
       select $1, id, now() + ($3 * interval '1 second')
       from public.app_users where id = $2 and login_disabled_at is null
       returning id_hash, user_id, expires_at, created_at`,
      [sessionHash(rawId), userId, ttlSeconds],
    )
    if (!row) throw new Error('Session creation returned no row.')
    return mapSession(row, rawId)
  }

  async findSession(id: string): Promise<AuthSession | null> {
    const row = await this.one<SessionRow>(
      `select s.id_hash, s.user_id, s.expires_at, s.created_at
       from public.auth_sessions s
       join public.app_users u on u.id = s.user_id
       where s.id_hash = $1 and s.revoked_at is null and s.expires_at > now()
         and u.id = s.user_id and u.login_disabled_at is null
         and ($2::boolean = false or u.tokendance_subject is not null)`,
      [sessionHash(id), isWatchaOAuthEnabled()],
    )
    return row ? mapSession(row, id) : null
  }

  async mergePasswordAccountIntoWatchaAccount(sourceUserId: string, targetUserId: string): Promise<AccountMergeResult> {
    if (sourceUserId === targetUserId) throw new Error('不能迁移当前观猹账号。')
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      const users = await client.query<UserRow>(
        `select * from public.app_users
         where id = any($1::uuid[])
         order by id for update`,
        [[sourceUserId, targetUserId]],
      )
      const source = users.rows.find(row => row.id === sourceUserId)
      const target = users.rows.find(row => row.id === targetUserId)
      if (!source || !target) throw new Error('迁移账号不存在。')
      if (source.login_disabled_at || source.merged_into_user_id) throw new Error('该原账号已经迁移或停用。')
      if (!source.username || !source.password_hash || source.tokendance_subject) throw new Error('只能迁移备案期间创建的用户名密码账号。')
      if (target.login_disabled_at || !target.tokendance_subject) throw new Error('请先使用观猹账号登录后再迁移。')
      if (target.password_account_merged_at) throw new Error('当前观猹账号已经完成过原账号迁移。')

      const handledTables = new Set([
        'api_key_records', 'auth_sessions', 'user_ai_usage', 'user_assistant_memories',
        'user_assistant_sessions', 'user_aux_data', 'user_behavior_events',
        'user_book_lists', 'user_book_relations', 'user_books', 'user_data_state',
        'user_settings',
      ])
      const references = await client.query<{ table_name: string }>(
        `select distinct child.relname as table_name
         from pg_constraint constraint_row
         join pg_class child on child.oid = constraint_row.conrelid
         join pg_namespace child_namespace on child_namespace.oid = child.relnamespace
         join unnest(constraint_row.conkey) child_key(attnum) on true
         join pg_attribute child_column on child_column.attrelid = child.oid and child_column.attnum = child_key.attnum
         where constraint_row.contype = 'f'
           and constraint_row.confrelid = 'public.app_users'::regclass
           and child_namespace.nspname = 'public'
           and child.relname <> 'app_users'`,
      )
      const unhandled = references.rows.map(row => row.table_name).filter(table => !handledTables.has(table))
      if (unhandled.length) throw new Error(`账号迁移尚未覆盖数据表：${unhandled.join('、')}`)

      const count = async (text: string, values: unknown[]): Promise<number> => {
        const result = await client.query(text, values)
        return result.rowCount || 0
      }

      const books = await count(
        `insert into public.user_books
         select $2, book_id, name, author, status, current_phase, best_score, data,
           created_at, updated_at, deleted_at, purge_at, imported_at, last_opened_at
         from public.user_books where user_id = $1
         on conflict (user_id, book_id) do update set
           name=excluded.name, author=excluded.author, status=excluded.status,
           current_phase=excluded.current_phase, best_score=excluded.best_score,
           data=excluded.data, created_at=least(public.user_books.created_at, excluded.created_at),
           updated_at=excluded.updated_at, deleted_at=excluded.deleted_at,
           purge_at=excluded.purge_at, imported_at=excluded.imported_at,
           last_opened_at=excluded.last_opened_at
         where excluded.updated_at > public.user_books.updated_at`,
        [sourceUserId, targetUserId],
      )
      const aiUsageRecords = await count(
        `insert into public.user_ai_usage
         select $2, record_id, book_id, session_id, task, model, prompt_tokens,
           completion_tokens, total_tokens, data, created_at, updated_at
         from public.user_ai_usage where user_id = $1
         on conflict (user_id, record_id) do update set
           book_id=excluded.book_id, session_id=excluded.session_id, task=excluded.task,
           model=excluded.model, prompt_tokens=excluded.prompt_tokens,
           completion_tokens=excluded.completion_tokens, total_tokens=excluded.total_tokens,
           data=excluded.data, created_at=least(public.user_ai_usage.created_at, excluded.created_at),
           updated_at=excluded.updated_at
         where excluded.updated_at > public.user_ai_usage.updated_at`,
        [sourceUserId, targetUserId],
      )
      const lists = await count(
        `insert into public.user_book_lists
         select $2, list_id, name, description, book_ids, created_at, updated_at
         from public.user_book_lists where user_id = $1
         on conflict (user_id, list_id) do update set
           name=excluded.name, description=excluded.description, book_ids=excluded.book_ids,
           created_at=least(public.user_book_lists.created_at, excluded.created_at),
           updated_at=excluded.updated_at
         where excluded.updated_at > public.user_book_lists.updated_at`,
        [sourceUserId, targetUserId],
      )
      const relations = await count(
        `insert into public.user_book_relations
         select $2, relation_id, from_book_id, to_book_id, relation_type, note, created_at, updated_at
         from public.user_book_relations where user_id = $1
         on conflict (user_id, relation_id) do update set
           from_book_id=excluded.from_book_id, to_book_id=excluded.to_book_id,
           relation_type=excluded.relation_type, note=excluded.note,
           created_at=least(public.user_book_relations.created_at, excluded.created_at),
           updated_at=excluded.updated_at
         where excluded.updated_at > public.user_book_relations.updated_at`,
        [sourceUserId, targetUserId],
      )
      const assistantSessions = await count(
        `insert into public.user_assistant_sessions
         select $2, session_id, title, book_id, data, created_at, updated_at
         from public.user_assistant_sessions where user_id = $1
         on conflict (user_id, session_id) do update set
           title=excluded.title, book_id=excluded.book_id, data=excluded.data,
           created_at=least(public.user_assistant_sessions.created_at, excluded.created_at),
           updated_at=excluded.updated_at
         where excluded.updated_at > public.user_assistant_sessions.updated_at`,
        [sourceUserId, targetUserId],
      )
      const assistantMemories = await count(
        `insert into public.user_assistant_memories
         select $2, memory_id, content, category, source_session_id, created_at, updated_at
         from public.user_assistant_memories where user_id = $1
         on conflict (user_id, memory_id) do update set
           content=excluded.content, category=excluded.category,
           source_session_id=excluded.source_session_id,
           created_at=least(public.user_assistant_memories.created_at, excluded.created_at),
           updated_at=excluded.updated_at
         where excluded.updated_at > public.user_assistant_memories.updated_at`,
        [sourceUserId, targetUserId],
      )
      const auxiliaryRecords = await count(
        `insert into public.user_aux_data
         select $2, namespace, data, version, updated_at
         from public.user_aux_data where user_id = $1
         on conflict (user_id, namespace) do update set
           data=excluded.data, version=excluded.version, updated_at=excluded.updated_at
         where excluded.updated_at > public.user_aux_data.updated_at`,
        [sourceUserId, targetUserId],
      )

      const settingsByUser = await client.query<SettingsRow & { user_id: string }>(
        `select user_id, data, version, updated_at from public.user_settings
         where user_id = any($1::uuid[]) for update`,
        [[sourceUserId, targetUserId]],
      )
      const mergedSettings = mergeAccountSettings(
        settingsByUser.rows.find(row => row.user_id === sourceUserId) || null,
        settingsByUser.rows.find(row => row.user_id === targetUserId) || null,
      )
      const maxSettingsVersion = Math.max(0, ...settingsByUser.rows.map(row => Number(row.version) || 0)) + 1
      await client.query(
        `insert into public.user_settings (user_id, data, version, updated_at)
         values ($1, $2::jsonb, $3, now())
         on conflict (user_id) do update set data=excluded.data, version=excluded.version, updated_at=now()`,
        [targetUserId, JSON.stringify(mergedSettings), maxSettingsVersion],
      )

      const apiKeys = await count(
        `insert into public.api_key_records
         select $2, provider, secret, created_at, updated_at
         from public.api_key_records where user_id = $1
         on conflict (user_id, provider) do update set
           secret=excluded.secret,
           created_at=least(public.api_key_records.created_at, excluded.created_at),
           updated_at=excluded.updated_at
         where excluded.updated_at > public.api_key_records.updated_at`,
        [sourceUserId, targetUserId],
      )

      await client.query(
        `insert into public.user_data_state
         select $2, schema_version, sync_version, last_import_at, last_sync_at, now(),
           migration_status, migration_version, migration_started_at, migration_deadline_at,
           migration_completed_at, last_migration_error
         from public.user_data_state where user_id = $1
         on conflict (user_id) do update set
           schema_version=greatest(public.user_data_state.schema_version, excluded.schema_version),
           sync_version=greatest(public.user_data_state.sync_version, excluded.sync_version) + 1,
           last_import_at=greatest(public.user_data_state.last_import_at, excluded.last_import_at),
           last_sync_at=now(), updated_at=now(),
           migration_version=greatest(public.user_data_state.migration_version, excluded.migration_version),
           migration_completed_at=greatest(public.user_data_state.migration_completed_at, excluded.migration_completed_at)`,
        [sourceUserId, targetUserId],
      )
      await client.query(
        `insert into public.user_data_state (user_id, sync_version, last_sync_at, updated_at)
         values ($1, 1, now(), now())
         on conflict (user_id) do update set sync_version=public.user_data_state.sync_version + 1,
           last_sync_at=now(), updated_at=now()`,
        [targetUserId],
      )

      const behaviorEvents = await count(
        'update public.user_behavior_events set user_id = $2 where user_id = $1',
        [sourceUserId, targetUserId],
      )

      const sourceEmail = source.email
      await client.query('delete from public.auth_sessions where user_id = $1', [sourceUserId])
      await client.query('delete from public.user_books where user_id = $1', [sourceUserId])
      await client.query('delete from public.user_ai_usage where user_id = $1', [sourceUserId])
      await client.query('delete from public.user_book_lists where user_id = $1', [sourceUserId])
      await client.query('delete from public.user_book_relations where user_id = $1', [sourceUserId])
      await client.query('delete from public.user_settings where user_id = $1', [sourceUserId])
      await client.query('delete from public.user_data_state where user_id = $1', [sourceUserId])
      await client.query('delete from public.user_aux_data where user_id = $1', [sourceUserId])
      await client.query('delete from public.user_assistant_sessions where user_id = $1', [sourceUserId])
      await client.query('delete from public.user_assistant_memories where user_id = $1', [sourceUserId])
      await client.query('delete from public.api_key_records where user_id = $1', [sourceUserId])
      await client.query(
        `update public.app_users set username=null, password_hash=null, email=null,
           login_disabled_at=now(), merged_into_user_id=$2, merged_at=now(), updated_at=now()
         where id=$1`,
        [sourceUserId, targetUserId],
      )
      if (!target.email && sourceEmail) {
        await client.query('update public.app_users set email=$2, updated_at=now() where id=$1', [targetUserId, sourceEmail])
      }
      await client.query(
        'update public.app_users set password_account_merged_at=now(), updated_at=now() where id=$1',
        [targetUserId],
      )
      await client.query('commit')
      return { books, aiUsageRecords, lists, relations, assistantSessions, assistantMemories, behaviorEvents, auxiliaryRecords, apiKeys }
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
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

  async getApiKey(userId: string, provider: ApiKeyRecord['provider']): Promise<ApiKeyRecord | null> {
    const row = await this.one<{ user_id: string; provider: ApiKeyRecord['provider']; secret: ApiKeyRecord['secret']; created_at: Date | string; updated_at: Date | string }>(
      'select user_id, provider, secret, created_at, updated_at from public.api_key_records where user_id = $1 and provider = $2',
      [userId, provider],
    )
    return row ? { userId: row.user_id, provider: row.provider, secret: row.secret, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) } : null
  }

  async deleteApiKey(userId: string, provider: ApiKeyRecord['provider']): Promise<void> {
    await this.pool.query('delete from public.api_key_records where user_id = $1 and provider = $2', [userId, provider])
  }

  async getUserDataSummary(userId: string): Promise<UserDataSummary> {
    const row = await this.one<{
      books: string; notes: string; practices: string; qa_records: string; ai_usage_records: string;
      lists: string; relations: string; quotes: string; assistant_sessions: string; assistant_memories: string;
      storage_bytes: string; last_import_at: Date | string | null; last_sync_at: Date | string | null
    }>(`select
      (select count(*) from public.user_books where user_id = $1 and deleted_at is null) as books,
      (select coalesce(sum(case when jsonb_typeof(data->'noteRecords') = 'array' then jsonb_array_length(data->'noteRecords') else 0 end), 0) from public.user_books where user_id = $1 and deleted_at is null) as notes,
      (select coalesce(sum(case when jsonb_typeof(data->'practiceRecords') = 'array' then jsonb_array_length(data->'practiceRecords') else 0 end), 0) from public.user_books where user_id = $1 and deleted_at is null) as practices,
      (select coalesce(sum(case when jsonb_typeof(data->'qaPracticeRecords') = 'array' then jsonb_array_length(data->'qaPracticeRecords') else 0 end), 0) from public.user_books where user_id = $1 and deleted_at is null) as qa_records,
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

  async listUserBooks(userId: string): Promise<UserBookSummary[]> {
    // The account center only needs metadata and progress counters. Avoid
    // transferring each book's parsed document and learning records just to
    // render the bookshelf list.
    const result = await this.pool.query<{
      book_id: string
      name: string
      author: string | null
      status: string
      current_phase: number
      best_score: number
      created_at: Date | string
      updated_at: Date | string
      note_count: string
      practice_count: string
      questions_done: string
      questions_total: string
      has_recommendations: boolean
    }>(`select book_id, name, author, status, current_phase, best_score, created_at, updated_at,
        case when jsonb_typeof(data->'noteRecords') = 'array' then jsonb_array_length(data->'noteRecords') else 0 end as note_count,
        case when jsonb_typeof(data->'practiceRecords') = 'array' then jsonb_array_length(data->'practiceRecords') else 0 end as practice_count,
        (select count(*) from jsonb_array_elements(
          case when jsonb_typeof(data->'qaPracticeRecords') = 'array' then data->'qaPracticeRecords' else '[]'::jsonb end
        ) record cross join lateral jsonb_array_elements(
          case when jsonb_typeof(record->'questions') = 'array' then record->'questions' else '[]'::jsonb end
        ) question where jsonb_typeof(question->'score') = 'number' or nullif(question->>'userAnswer', '') is not null) as questions_done,
        (select count(*) from jsonb_array_elements(
          case when jsonb_typeof(data->'qaPracticeRecords') = 'array' then data->'qaPracticeRecords' else '[]'::jsonb end
        ) record cross join lateral jsonb_array_elements(
          case when jsonb_typeof(record->'questions') = 'array' then record->'questions' else '[]'::jsonb end
        ) question) as questions_total,
        length(nullif(data->>'recommendations', '')) > 0 as has_recommendations
      from public.user_books
      where user_id = $1 and deleted_at is null
      order by updated_at desc`, [userId])

    return result.rows.map(row => ({
      id: row.book_id,
      name: row.name,
      ...(row.author ? { author: row.author } : {}),
      status: row.status,
      currentPhase: Number(row.current_phase || 0),
      bestScore: Number(row.best_score || 0),
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
      noteCount: Number(row.note_count || 0),
      practiceCount: Number(row.practice_count || 0),
      questionsDone: Number(row.questions_done || 0),
      questionsTotal: Number(row.questions_total || 0),
      hasRecommendations: Boolean(row.has_recommendations),
    }))
  }

  async getUserSettings(userId: string): Promise<Record<string, unknown>> {
    return this.readUserSettings(userId)
  }

  async saveBook(userId: string, input: unknown): Promise<void> {
    const book = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
    const id = typeof book.id === 'string' ? book.id : ''
    const name = typeof book.name === 'string' ? book.name.trim() : ''
    if (!id || !name) throw new Error('书籍数据格式无效。')
    const createdAt = Number(book.createdAt)
    const updatedAt = Number(book.updatedAt)
    if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) throw new Error('书籍时间格式无效。')
    await this.pool.query(
      `insert into public.user_books
         (user_id, book_id, name, author, status, current_phase, best_score, data, created_at, updated_at, imported_at, deleted_at, purge_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, to_timestamp($9 / 1000.0), to_timestamp($10 / 1000.0), now(), null, null)
       on conflict (user_id, book_id) do update set
         name = excluded.name, author = excluded.author, status = excluded.status,
         current_phase = excluded.current_phase, best_score = excluded.best_score,
         data = public.user_books.data || '{}'::jsonb || excluded.data,
         updated_at = excluded.updated_at, deleted_at = null, purge_at = null
       where excluded.updated_at >= public.user_books.updated_at`,
      [
        userId,
        id,
        name,
        typeof book.author === 'string' && book.author.trim() ? book.author.trim() : null,
        typeof book.status === 'string' ? book.status : 'unread',
        Number.isFinite(Number(book.currentPhase)) ? Number(book.currentPhase) : 0,
        Number.isFinite(Number(book.bestScore)) ? Number(book.bestScore) : 0,
        JSON.stringify(book),
        createdAt,
        updatedAt,
      ],
    )
  }

  async getBook(userId: string, bookId: string): Promise<unknown | null> {
    const row = await this.one<{ data: unknown }>(
      'select data from public.user_books where user_id = $1 and book_id = $2 and deleted_at is null',
      [userId, bookId],
    )
    return row?.data || null
  }

  async exportUserData(userId: string, format: 'full' | 'core' = 'full'): Promise<unknown> {
    const includeAssistantData = format === 'full'
    const booksPromise = includeAssistantData
      ? this.pool.query<{ data: Record<string, unknown> }>(
          'select data from public.user_books where user_id = $1 and deleted_at is null order by updated_at asc',
          [userId],
        )
      : this.pool.query<{
          book_id: string
          name: string
          author: string | null
          status: string
          current_phase: number
          best_score: number
          cover: string | null
          description: string | null
          tags: unknown
          reading_progress: unknown
          created_at: Date | string
          updated_at: Date | string
        }>(`select book_id, name, author, status, current_phase, best_score,
              data->>'cover' as cover, data->>'description' as description,
              case when jsonb_typeof(data->'tags') = 'array' then data->'tags' else '[]'::jsonb end as tags,
              data->'readingProgress' as reading_progress,
              created_at, updated_at
            from public.user_books
            where user_id = $1 and deleted_at is null
            order by updated_at asc`, [userId])
    const usagePromise = includeAssistantData
      ? this.pool.query<{ data: Record<string, unknown> }>('select data from public.user_ai_usage where user_id = $1 order by created_at asc', [userId])
      : this.pool.query<{ data: Record<string, unknown> }>(
          `select data from (
             select data, created_at from public.user_ai_usage
             where user_id = $1 order by created_at desc limit 500
           ) recent_usage order by created_at asc`,
          [userId],
        )
    const [settings, books, usage, lists, relations, assistantSessions, assistantMemories] = await Promise.all([
      this.readUserSettings(userId),
      booksPromise,
      usagePromise,
      this.pool.query<{ list_id: string; name: string; description: string | null; book_ids: unknown; created_at: Date | string; updated_at: Date | string }>('select list_id, name, description, book_ids, created_at, updated_at from public.user_book_lists where user_id = $1 order by updated_at asc', [userId]),
      this.pool.query<{ relation_id: string; from_book_id: string; to_book_id: string; relation_type: string; note: string | null; created_at: Date | string; updated_at: Date | string }>('select relation_id, from_book_id, to_book_id, relation_type, note, created_at, updated_at from public.user_book_relations where user_id = $1 order by updated_at asc', [userId]),
      includeAssistantData
        ? this.pool.query<{ session_id: string; title: string; book_id: string | null; data: unknown; created_at: Date | string; updated_at: Date | string }>('select session_id, title, book_id, data, created_at, updated_at from public.user_assistant_sessions where user_id = $1 order by updated_at asc', [userId])
        : Promise.resolve({ rows: [] as Array<{ session_id: string; title: string; book_id: string | null; data: unknown; created_at: Date | string; updated_at: Date | string }> }),
      includeAssistantData
        ? this.pool.query<{ memory_id: string; content: string; category: AssistantMemoryRecord['category']; source_session_id: string | null; created_at: Date | string; updated_at: Date | string }>('select memory_id, content, category, source_session_id, created_at, updated_at from public.user_assistant_memories where user_id = $1 order by updated_at asc', [userId])
        : Promise.resolve({ rows: [] as Array<{ memory_id: string; content: string; category: AssistantMemoryRecord['category']; source_session_id: string | null; created_at: Date | string; updated_at: Date | string }> }),
    ])
    const safeSettings = { ...settings, apiKey: '' }
    const exportedBooks = includeAssistantData
      ? (books.rows as Array<{ data: Record<string, unknown> }>).map(row => row.data)
      : (books.rows as Array<{
          book_id: string
          name: string
          author: string | null
          status: string
          current_phase: number
          best_score: number
          cover: string | null
          description: string | null
          tags: unknown
          reading_progress: unknown
          created_at: Date | string
          updated_at: Date | string
        }>).map(row => ({
          id: row.book_id,
          name: row.name,
          ...(row.author ? { author: row.author } : {}),
          ...(row.cover ? { cover: row.cover } : {}),
          ...(row.description ? { description: row.description } : {}),
          tags: Array.isArray(row.tags) ? row.tags : [],
          ...(row.reading_progress && typeof row.reading_progress === 'object' ? { readingProgress: row.reading_progress } : {}),
          status: row.status,
          currentPhase: Number(row.current_phase || 0),
          bestScore: Number(row.best_score || 0),
          noteRecords: [],
          responses: {},
          practiceRecords: [],
          qaPracticeRecords: [],
          createdAt: new Date(row.created_at).getTime(),
          updatedAt: new Date(row.updated_at).getTime(),
          _summaryOnly: true,
        }))
    return {
      version: 5,
      exportDate: Date.now(),
      settings: safeSettings,
      books: exportedBooks,
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
    const row = await this.one<{ data: unknown; display_name: string | null; avatar_url: string | null }>(
      `select s.data, u.display_name, u.avatar_url
       from public.app_users u
       left join public.user_settings s on s.user_id = u.id
       where u.id = $1`,
      [userId],
    )
    return profileFromSettings(row?.data, row ? { displayName: row.display_name, avatarUrl: row.avatar_url } : undefined)
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
      `update public.app_users set
         display_name = case when $2::boolean then $3 else display_name end,
         avatar_url = case when $4::boolean then $5 else avatar_url end,
         updated_at = now()
       where id = $1`,
      [userId, patch.customDisplayName !== undefined, customDisplayName, patch.customAvatarUrl !== undefined, customAvatarUrl],
    )
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
      `update public.app_users set
         display_name = coalesce(
           nullif((select s.data->'profile'->>'customDisplayName' from public.user_settings s where s.user_id = public.app_users.id), ''),
           nullif($2, ''), display_name
         ),
         avatar_url = coalesce(
           nullif((select s.data->'profile'->>'customAvatarUrl' from public.user_settings s where s.user_id = public.app_users.id), ''),
           $3, avatar_url
         ),
         updated_at = now()
       where id = $1`,
      [userId, nickname, avatarUrl],
    )
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
         values ($1, null)
         on conflict (user_id) do update set migration_deadline_at = null
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
      await client.query(
        `insert into public.user_data_state
           (user_id, migration_status, migration_version, migration_started_at, migration_deadline_at, last_migration_error, updated_at)
         values ($1, 'running', $2, now(), null, null, now())
         on conflict (user_id) do update set migration_status = 'running', migration_version = $2,
           migration_started_at = coalesce(public.user_data_state.migration_started_at, now()),
           migration_deadline_at = null,
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
    try {
      const result = await this.pool.query<{ book_id: string; name: string; author: string | null; deleted_at: Date | string; purge_at: Date | string | null }>(
        `select book_id, name, author, deleted_at, purge_at from public.user_books
         where user_id = $1 and deleted_at is not null and deleted_at > now() - interval '7 days'
         order by deleted_at desc`, [userId],
      )
      return result.rows.map(row => ({ bookId: row.book_id, name: row.name, author: row.author, deletedAt: iso(row.deleted_at), purgeAt: row.purge_at ? iso(row.purge_at) : null }))
    } catch (error) {
      // Keep the recycle bin readable during a rolling deployment where the
      // optional purge_at column has not been added yet.
      if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '42703') {
        const result = await this.pool.query<{ book_id: string; name: string; author: string | null; deleted_at: Date | string }>(
          `select book_id, name, author, deleted_at from public.user_books
           where user_id = $1 and deleted_at is not null and deleted_at > now() - interval '7 days'
           order by deleted_at desc`, [userId],
        )
        return result.rows.map(row => ({ bookId: row.book_id, name: row.name, author: row.author, deletedAt: iso(row.deleted_at), purgeAt: null }))
      }
      throw error
    }
  }

  async softDeleteBook(userId: string, bookId: string): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      let result
      try {
        result = await client.query(
          `update public.user_books set deleted_at = now(), purge_at = now() + interval '30 days', updated_at = now()
           where user_id = $1 and book_id = $2 and deleted_at is null`, [userId, bookId],
        )
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '42703')) throw error
        result = await client.query(
          `update public.user_books set deleted_at = now(), updated_at = now()
           where user_id = $1 and book_id = $2 and deleted_at is null`, [userId, bookId],
        )
      }
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
    let result
    try {
      result = await this.pool.query(
        `update public.user_books set deleted_at = null, purge_at = null, updated_at = now()
         where user_id = $1 and book_id = $2 and deleted_at is not null
           and deleted_at > now() - interval '7 days'`, [userId, bookId],
      )
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '42703')) throw error
      result = await this.pool.query(
        `update public.user_books set deleted_at = null, updated_at = now()
         where user_id = $1 and book_id = $2 and deleted_at is not null
           and deleted_at > now() - interval '7 days'`, [userId, bookId],
      )
    }
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
    let result
    try {
      result = await this.pool.query(
        `delete from public.user_books where user_id = $1 and deleted_at is not null
         and coalesce(purge_at, deleted_at + interval '30 days') <= now()`, [userId],
      )
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '42703')) throw error
      result = await this.pool.query(
        `delete from public.user_books where user_id = $1 and deleted_at is not null
         and deleted_at + interval '30 days' <= now()`, [userId],
      )
    }
    return result.rowCount || 0
  }

  /** Purge expired recycle-bin rows for all accounts; call from a server timer. */
  async purgeExpiredRecycleBin(): Promise<number> {
    let result
    try {
      result = await this.pool.query(
        `delete from public.user_books where deleted_at is not null
         and coalesce(purge_at, deleted_at + interval '30 days') <= now()`,
      )
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '42703')) throw error
      result = await this.pool.query(
        `delete from public.user_books where deleted_at is not null
         and deleted_at + interval '30 days' <= now()`,
      )
    }
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

  async findAdminRole(userId: string): Promise<AdminRole | null> {
    const row = await this.one<{ user_id: string; tokendance_subject: string; role: string; revoked_at: Date | string | null }>(
      `select r.user_id, r.tokendance_subject, r.role, r.revoked_at
       from public.admin_roles r
       join public.app_users u on u.id = r.user_id
         and u.tokendance_subject = r.tokendance_subject
         and u.login_disabled_at is null
       where r.user_id = $1`, [userId],
    )
    if (!row || !row.tokendance_subject || !['super_admin', 'admin', 'analyst'].includes(row.role)) return null
    return { userId: row.user_id, tokendanceSubject: row.tokendance_subject, role: row.role as AdminRole['role'], revokedAt: row.revoked_at ? iso(row.revoked_at) : null }
  }

  async getAdminTotpCredential(userId: string): Promise<AdminTotpCredential | null> {
    const row = await this.one<{
      user_id: string
      secret_ciphertext: unknown
      enabled: boolean
      failed_attempts: number | string
      locked_until: Date | string | null
    }>(
      `select user_id, secret_ciphertext, enabled, failed_attempts, locked_until
       from public.admin_totp_credentials where user_id = $1`, [userId],
    )
    if (!row || !row.secret_ciphertext || typeof row.secret_ciphertext !== 'object' || Array.isArray(row.secret_ciphertext)) return null
    return {
      userId: row.user_id,
      secret: row.secret_ciphertext as AdminTotpCredential['secret'],
      enabled: Boolean(row.enabled),
      failedAttempts: Number(row.failed_attempts || 0),
      lockedUntil: row.locked_until ? iso(row.locked_until) : null,
    }
  }

  async recordAdminTotpFailure(userId: string, lockedUntil: string | null): Promise<void> {
    await this.pool.query(
      `update public.admin_totp_credentials
       set failed_attempts = failed_attempts + 1, locked_until = $2::timestamptz, updated_at = now()
       where user_id = $1`, [userId, lockedUntil],
    )
  }

  async resetAdminTotpFailures(userId: string): Promise<void> {
    await this.pool.query(
      `update public.admin_totp_credentials
       set failed_attempts = 0, locked_until = null, updated_at = now()
       where user_id = $1`, [userId],
    )
  }

  async markAdminTotpUsed(userId: string): Promise<void> {
    await this.pool.query(
      `update public.admin_totp_credentials
       set last_used_at = now(), updated_at = now() where user_id = $1`, [userId],
    )
  }

  async createAdminSession(session: AdminSessionRecord): Promise<void> {
    await this.pool.query(
      `insert into public.admin_sessions
       (id_hash, user_id, expires_at, mfa_verified_at, created_at, last_used_at, revoked_at)
       values ($1, $2, $3::timestamptz, $4::timestamptz, $5::timestamptz, $6::timestamptz, null)
       on conflict (id_hash) do nothing`,
      [session.idHash, session.userId, session.expiresAt, session.mfaVerifiedAt, session.createdAt, session.lastUsedAt],
    )
  }

  async findAdminSession(idHash: string): Promise<AdminSessionRecord | null> {
    const row = await this.one<{
      id_hash: string; user_id: string; expires_at: Date | string; mfa_verified_at: Date | string
      created_at: Date | string; last_used_at: Date | string | null; revoked_at: Date | string | null
    }>(
      `select id_hash, user_id, expires_at, mfa_verified_at, created_at, last_used_at, revoked_at
       from public.admin_sessions where id_hash = $1`, [idHash],
    )
    if (!row) return null
    return {
      idHash: row.id_hash,
      userId: row.user_id,
      expiresAt: iso(row.expires_at),
      mfaVerifiedAt: iso(row.mfa_verified_at),
      createdAt: iso(row.created_at),
      lastUsedAt: row.last_used_at ? iso(row.last_used_at) : null,
      revokedAt: row.revoked_at ? iso(row.revoked_at) : null,
    }
  }

  async revokeAdminSession(idHash: string): Promise<void> {
    await this.pool.query(
      `update public.admin_sessions set revoked_at = now(), last_used_at = now() where id_hash = $1`, [idHash],
    )
  }

  async writeAdminAuditLog(entry: AdminAuditEntry): Promise<void> {
    await this.pool.query(
      `insert into public.admin_audit_logs (admin_user_id, action, target_user_id, metadata)
       values ($1, $2, $3, $4::jsonb)`,
      [entry.adminUserId, entry.action.slice(0, 100), entry.targetUserId || null, JSON.stringify(entry.metadata || {})],
    )
  }

  async getAdminDashboard(): Promise<AdminDashboard> {
    const [users, books, statuses, phases, ai, events, storage] = await Promise.all([
      this.one<{ total: string; new_last_30: string; active_last_7: string }>(
        `select count(*)::text as total,
          count(*) filter (where created_at >= now() - interval '30 days')::text as new_last_30,
          count(*) filter (where updated_at >= now() - interval '7 days')::text as active_last_7
         from public.app_users where login_disabled_at is null`, []),
      this.one<{ total: string; active: string; recycle: string }>(
        `select count(*) filter (where deleted_at is null)::text as total,
          count(*) filter (where deleted_at is null and status = 'reading')::text as active,
          count(*) filter (where deleted_at is not null)::text as recycle
         from public.user_books`, []),
      this.pool.query<{ status: string; count: string }>(
        `select status, count(*)::text as count from public.user_books where deleted_at is null group by status order by status`, []),
      this.pool.query<{ phase: string; count: string }>(
        `select current_phase::text as phase, count(*)::text as count from public.user_books where deleted_at is null group by current_phase order by current_phase`, []),
      this.one<{ requests: string; prompt: string; completion: string; total: string }>(
        `select count(*)::text as requests, coalesce(sum(prompt_tokens), 0)::text as prompt,
          coalesce(sum(completion_tokens), 0)::text as completion, coalesce(sum(total_tokens), 0)::text as total
         from public.user_ai_usage where created_at >= now() - interval '30 days'`, []),
      this.one<{ count: string }>(
        `select count(*)::text as count from public.user_behavior_events where occurred_at >= now() - interval '30 days'`, []),
      this.one<{ storage: string; recycle: string }>(
        `select
          coalesce((select sum(pg_column_size(data)) from public.user_books), 0)
            + coalesce((select sum(pg_column_size(data)) from public.user_settings), 0)
            + coalesce((select sum(pg_column_size(data)) from public.user_ai_usage), 0)
            + coalesce((select sum(pg_column_size(data)) from public.user_assistant_sessions), 0)
            + coalesce((select sum(pg_column_size(content)) from public.user_assistant_memories), 0)::bigint as storage,
          coalesce((select sum(pg_column_size(data)) from public.user_books where deleted_at is not null), 0)::bigint as recycle`, []),
    ])
    const number = (value: string | undefined): number => Math.max(0, Number(value || 0) || 0)
    return {
      generatedAt: new Date().toISOString(),
      users: { total: number(users?.total), newLast30Days: number(users?.new_last_30), activeLast7Days: number(users?.active_last_7) },
      books: {
        total: number(books?.total), active: number(books?.active), recycleBin: number(books?.recycle),
        byStatus: Object.fromEntries(statuses.rows.map(row => [row.status, number(row.count)])),
        byPhase: Object.fromEntries(phases.rows.map(row => [row.phase, number(row.count)])),
      },
      ai: { requestsLast30Days: number(ai?.requests), promptTokensLast30Days: number(ai?.prompt), completionTokensLast30Days: number(ai?.completion), totalTokensLast30Days: number(ai?.total) },
      activity: { eventsLast30Days: number(events?.count), storageBytes: number(storage?.storage), recycleBinBytes: number(storage?.recycle) },
    }
  }
}

export async function closePostgresPersistence(adapter: PostgresPersistenceAdapter): Promise<void> {
  await (adapter as unknown as { pool: Pool }).pool.end()
}
