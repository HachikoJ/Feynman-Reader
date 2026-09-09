import { ADMIN_DATA_FIELD_LABELS, ADMIN_DATA_TABLES, AdminDataError, getAdminDataPage, getAdminDataRecord, getAdminUserProfiles, isAdminSensitiveField, redactAdminData } from '../adminData'
import { Pool } from 'pg'

jest.mock('pg', () => ({ Pool: jest.fn() }))

const userId = '00000000-0000-4000-8000-000000000001'
const uuid = '78caf6af-97bb-460f-b638-763e46697393'
const mockQuery = jest.fn()
const mockRelease = jest.fn()
const mockConnect = jest.fn()
let rows: Record<string, unknown>[] = []

beforeAll(() => {
  process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test'
  process.env.FEYNMAN_AUTH_STATE_SECRET = 'test-admin-data-secret'
  ;(Pool as unknown as jest.Mock).mockImplementation(() => ({ query: mockQuery, connect: mockConnect }))
})

beforeEach(() => {
  rows = []
  mockQuery.mockReset().mockImplementation(async (sql: string) => {
    if (sql.startsWith('SELECT count(*)')) return { rows: [{ total: String(rows.length) }] }
    return { rows: sql.startsWith('SELECT ') ? rows : [] }
  })
  mockRelease.mockReset()
  mockConnect.mockReset().mockResolvedValue({ query: mockQuery, release: mockRelease })
})

describe('administrator data browser', () => {
  it('skips empty profile lookups and rejects invalid or oversized batches before SQL', async () => {
    expect(await getAdminUserProfiles([])).toEqual({})
    await expect(getAdminUserProfiles(["' OR 1=1"])).rejects.toBeInstanceOf(AdminDataError)
    await expect(getAdminUserProfiles(Array(201).fill(userId))).rejects.toBeInstanceOf(AdminDataError)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('deduplicates profile IDs and returns only requested public profile fields', async () => {
    rows = [{ id: userId, display_name: ' Wilson ', username: 'wilson', avatar_url: 'https://example.test/avatar.png',
      custom_display_name: 'Older name', custom_avatar_url: 'https://example.test/older.png', password_hash: 'private', data: { apiKey: 'private' } },
    { id: uuid, display_name: 'Unrequested user' }]
    expect(await getAdminUserProfiles([userId, userId.toUpperCase()])).toEqual({ [userId]: {
      id: userId, displayName: 'Wilson', username: 'wilson', avatarUrl: 'https://example.test/avatar.png',
    } })
    expect(mockQuery).toHaveBeenCalledTimes(1)
    const [sql, values] = mockQuery.mock.calls[0]
    expect(values).toEqual([[userId]])
    expect(sql).toContain('u.id = ANY($1::uuid[])')
    expect(sql).not.toContain(userId)
    expect(sql).not.toMatch(/SELECT \*|password_hash|secret|s\.data\s*,/)
  })

  it('falls back from canonical profile to custom and Watcha fields without inventing names', async () => {
    rows = [{ id: userId, display_name: null, username: ' local-name ', avatar_url: ' ', custom_display_name: '自定义昵称', custom_avatar_url: 'https://example.test/custom.png', watcha_nickname: '观猹昵称' },
      { id: uuid, display_name: ' ', username: null, custom_display_name: '', watcha_nickname: '观猹昵称', watcha_avatar_url: 'https://example.test/watcha.png' }]
    expect(await getAdminUserProfiles([userId, uuid])).toEqual({
      [userId]: { id: userId, displayName: '自定义昵称', username: 'local-name', avatarUrl: 'https://example.test/custom.png' },
      [uuid]: { id: uuid, displayName: '观猹昵称', username: null, avatarUrl: 'https://example.test/watcha.png' },
    })
    rows = [{ id: userId }]
    expect(await getAdminUserProfiles([userId, uuid])).toEqual({ [userId]: { id: userId, displayName: null, username: null, avatarUrl: null } })
  })

  it('publishes all 19 tables without exposing SQL projections or secret column names', () => {
    expect(ADMIN_DATA_TABLES).toHaveLength(19)
    expect(new Set(ADMIN_DATA_TABLES.map(table => table.id)).size).toBe(19)
    expect(JSON.stringify(ADMIN_DATA_TABLES)).not.toMatch(/password_hash|secret_ciphertext|id_hash|code_hash|ip_hash|user_agent_hash/)
    for (const table of ADMIN_DATA_TABLES) {
      expect(table.label).toMatch(/[\u4e00-\u9fff]/)
      expect(table.columns.length).toBeLessThanOrEqual(7)
      expect(table.columns.every(column => /[\u4e00-\u9fff]/.test(column.label))).toBe(true)
    }
  })

  it('shares full detail labels and credential rules without classifying learning token counts as credentials', () => {
    expect(ADMIN_DATA_FIELD_LABELS.current_phase).toBe('学习阶段')
    expect(ADMIN_DATA_FIELD_LABELS.data).toBe('完整业务数据')
    expect(isAdminSensitiveField('refresh_token')).toBe(true)
    expect(isAdminSensitiveField('secretCiphertext')).toBe(true)
    expect(isAdminSensitiveField('completion_tokens')).toBe(false)
  })

  it.each(ADMIN_DATA_TABLES.map(table => [table.id]))('supports paginated records and full details for %s', async tableId => {
    const table = ADMIN_DATA_TABLES.find(item => item.id === tableId)!
    const row: Record<string, unknown> = { user_id: userId }
    for (const field of table.primaryKeys) row[field === 'opaque' ? '__record_token' : field] =
      field === 'metric_date' ? '2026-09-08' : field === 'user_id' ? userId : field === 'opaque' ? 'a'.repeat(64) : ['id', 'event_id'].includes(field) ? uuid : 'business-id'
    rows = [row]
    const page = await getAdminDataPage({ table: tableId })
    expect(page).toMatchObject({ table: tableId, total: 1, page: 1, pageSize: 25 })
    const record = await getAdminDataRecord(tableId, page.rows[0].key)
    expect(record?.key).toBe(page.rows[0].key)
    expect(mockQuery.mock.calls.some(([sql]) => sql === 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')).toBe(true)
    expect(mockRelease).toHaveBeenCalledTimes(1)
  })

  it('parameterizes Chinese search, literal wildcards, user ownership and pagination', async () => {
    await getAdminDataPage({ table: 'user_books', userId, search: "乌合%_之众' OR 1=1", page: 3, pageSize: 10, sort: 'oldest' })
    const [sql, values] = mockQuery.mock.calls.find(([text]) => text.startsWith('SELECT "user_id"'))!
    expect(sql).not.toContain('乌合')
    expect(sql).toContain('"user_id" = $1::uuid')
    expect(sql).toContain('ILIKE $2')
    expect(sql).toContain('"updated_at" ASC')
    expect(values).toEqual([userId, "%乌合\\%\\_之众' OR 1=1%", 10, 20])
    expect(sql).not.toContain('"data"')
    expect(sql).not.toContain('deleted_at IS NULL')
  })

  it('returns full book JSON only in detail and retains long learning text', async () => {
    const text = '关于 API key 和密码学的学习正文。'.repeat(2000)
    rows = [{ user_id: userId, book_id: 'book-1', data: { analyses: [{ content: text }], settings: { apiKey: 'must-not-leak' }, prompt_tokens: 15 } }]
    const record = await getAdminDataRecord('user_books', Buffer.from(JSON.stringify({ user_id: userId, book_id: 'book-1' })).toString('base64url'))
    expect(record?.fields.data).toEqual({ analyses: [{ content: text }], settings: { apiKey_configured: true }, prompt_tokens: 15 })
    expect(mockQuery.mock.calls[0][0]).toContain('"data"')
  })

  it('redacts structured credentials recursively without altering ordinary text or token counts', () => {
    const output = redactAdminData({
      password_hash: 'password-private', secret: { ciphertext: 'secret-private' }, apiKey: 'api-private',
      data: [{ secret_ciphertext: 'cipher-private', code_hash: 'recovery-private', id_hash: 'session-private', ip_hash: 'ip-private', user_agent_hash: 'ua-private',
        authorization: 'bearer-private', refreshToken: 'refresh-private', access_token: 'access-private', content: 'password_hash is a field name in this lesson', totalTokens: 12 }],
    })
    expect(JSON.stringify(output)).not.toMatch(/password-private|secret-private|api-private|cipher-private|recovery-private|session-private|ip-private|ua-private|bearer-private|refresh-private|access-private/)
    expect(output).toMatchObject({ password_hash_configured: true, secret_configured: true, apiKey_configured: true,
      data: [{ content: 'password_hash is a field name in this lesson', totalTokens: 12 }] })
  })

  it('enforces the response allowlist even if a query accidentally returns credential columns', async () => {
    rows = [{ id: userId, display_name: 'Wilson', password_hash: 'do-not-return', secret: 'do-not-return', id_hash: 'do-not-return', password_configured: true }]
    const page = await getAdminDataPage({ table: 'app_users' })
    expect(page.rows[0].fields).toEqual({ id: userId, display_name: 'Wilson', password_configured: true })
    const sql = mockQuery.mock.calls.find(([text]) => text.startsWith('SELECT "id"'))![0]
    expect(sql).toContain('("password_hash" IS NOT NULL) AS "password_configured"')
    expect(sql).not.toContain('SELECT *')
  })

  it('uses one-way session locators without returning the actual credential hash', async () => {
    rows = [{ user_id: userId, __record_token: 'a'.repeat(64), id_hash: 'original-credential-hash', created_at: new Date('2026-09-08T00:00:00Z') }]
    const page = await getAdminDataPage({ table: 'admin_sessions' })
    const key = JSON.parse(Buffer.from(page.rows[0].key, 'base64url').toString('utf8'))
    expect(key).toEqual({ user_id: userId, opaque: 'a'.repeat(64) })
    expect(JSON.stringify(page)).not.toContain('original-credential-hash')
    expect(page.rows[0].fields).not.toHaveProperty('__record_token')
    await getAdminDataRecord('admin_sessions', page.rows[0].key)
    const [sql, values] = mockQuery.mock.calls.at(-1)!
    expect(sql).toContain("encode(hmac(id_hash, $1::text, 'sha256'), 'hex') = $3")
    expect(values).toEqual(['admin-data-record-v1:test-admin-data-secret', userId, 'a'.repeat(64)])
  })

  it('returns null for a missing record instead of an empty fabricated object', async () => {
    expect(await getAdminDataRecord('app_users', Buffer.from(JSON.stringify({ id: userId })).toString('base64url'))).toBeNull()
  })

  it.each([
    { table: 'app_users; DROP TABLE app_users' },
    { table: '__proto__' },
    { table: 'app_users', page: 0 },
    { table: 'app_users', page: 1.5 },
    { table: 'app_users', pageSize: 101 },
    { table: 'app_users', pageSize: -1 },
    { table: 'app_users', userId: "' OR true" },
    { table: 'admin_daily_metrics', userId },
    { table: 'app_users', search: '长'.repeat(201) },
    { table: 'app_users', from: 'yesterday' },
    { table: 'app_users', from: '2026-09-09', to: '2026-09-08' },
  ])('rejects invalid queries before accessing the database: %o', async query => {
    await expect(getAdminDataPage(query)).rejects.toBeInstanceOf(AdminDataError)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it.each(['not-json', 'e30', Buffer.from(JSON.stringify({ id: userId, password_hash: 'extra' })).toString('base64url'), Buffer.from(JSON.stringify({ id: "' OR 1=1" })).toString('base64url')])('rejects invalid and extra record key fields: %s', async key => {
    await expect(getAdminDataRecord('app_users', key)).rejects.toBeInstanceOf(AdminDataError)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('rolls back and releases the connection after a database failure', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT count(*)')) throw new Error('database unavailable')
      return { rows: [] }
    })
    await expect(getAdminDataPage({ table: 'app_users' })).rejects.toThrow('database unavailable')
    expect(mockQuery).toHaveBeenCalledWith('ROLLBACK')
    expect(mockRelease).toHaveBeenCalledTimes(1)
  })
})
