import { Pool } from 'pg'

export type AdminDataColumn = { key: string; label: string }
export type AdminDataTable = {
  id: string
  label: string
  description: string
  columns: AdminDataColumn[]
  primaryKeys: string[]
  userColumn: string | null
}
export type AdminDataRow = { key: string; fields: Record<string, unknown> }
export type AdminUserProfile = { id: string; displayName: string | null; username: string | null; avatarUrl: string | null }
export type AdminDataQuery = {
  table: string
  userId?: string
  search?: string
  page?: number
  pageSize?: number
  from?: string
  to?: string
  sort?: 'newest' | 'oldest'
}
export type AdminDataPage = { table: string; rows: AdminDataRow[]; total: number; page: number; pageSize: number }

type TableSpec = AdminDataTable & {
  fields: string[]
  searchFields: string[]
  timeColumn: string
  jsonFields?: string[]
  configured?: Record<string, string>
  opaque?: boolean
}

export const ADMIN_DATA_FIELD_LABELS: Readonly<Record<string, string>> = {
  id: '编号', user_id: '用户 UUID', username: '用户名', display_name: '昵称', avatar_url: '头像',
  tokendance_subject: '观猹身份', phone: '手机号', email: '邮箱', created_at: '创建时间', updated_at: '更新时间',
  merged_into_user_id: '合并目标用户', merged_at: '合并时间', login_disabled_at: '停用时间',
  password_account_merged_at: '密码账号合并时间', phone_verified_at: '手机验证时间', email_verified_at: '邮箱验证时间',
  password_configured: '密码已设置', book_id: '书籍编号', name: '名称', author: '作者', status: '状态',
  current_phase: '学习阶段', best_score: '最高分', deleted_at: '回收时间', purge_at: '清除期限',
  imported_at: '导入时间', last_opened_at: '最后阅读时间', version: '版本', record_id: '记录编号',
  session_id: '会话编号', task: '任务', model: '模型', prompt_tokens: '输入用量', completion_tokens: '输出用量',
  total_tokens: '总用量', list_id: '书单编号', description: '说明', book_ids: '书籍列表', relation_id: '关系编号',
  from_book_id: '来源书籍', to_book_id: '目标书籍', relation_type: '关系类型', note: '备注', title: '标题',
  memory_id: '记忆编号', content: '内容', category: '分类', source_session_id: '来源会话', event_id: '事件编号',
  event_type: '事件类型', occurred_at: '发生时间', namespace: '命名空间', schema_version: '结构版本',
  sync_version: '同步版本', last_import_at: '最近导入', last_sync_at: '最近同步', migration_status: '迁移状态',
  migration_version: '迁移版本', migration_started_at: '迁移开始', migration_deadline_at: '迁移截止',
  migration_completed_at: '迁移完成', last_migration_error: '迁移错误', expires_at: '到期时间', revoked_at: '撤销时间',
  last_used_at: '最近使用', provider: '服务提供方', key_configured: '密钥已配置', role: '角色', granted_by: '授权人',
  granted_at: '授权时间', enabled: '已启用', enrolled_at: '绑定时间', failed_attempts: '失败次数', locked_until: '锁定截止',
  encryption_key_version: '加密版本', totp_configured: '动态验证已配置', used_at: '使用时间', code_configured: '恢复码已配置',
  mfa_verified_at: '二次验证时间', admin_user_id: '操作管理员', action: '操作', target_user_id: '目标用户', request_id: '请求编号',
  metric_date: '日期', registered_users: '注册用户', active_users: '活跃用户', new_books: '新增书籍', active_books: '在读书籍',
  completed_books: '已读书籍', ai_requests: 'AI 请求', behavior_events: '行为事件', storage_bytes: '存储字节',
  recycle_bin_bytes: '回收站字节', data: '完整业务数据', payload: '事件详情', metadata: '操作详情',
}

const SUMMARY_FIELDS: Record<string, string[]> = {
  app_users: ['display_name', 'username', 'tokendance_subject', 'email', 'created_at', 'login_disabled_at', 'merged_into_user_id'],
  user_books: ['name', 'author', 'user_id', 'status', 'best_score', 'updated_at', 'deleted_at'],
  user_settings: ['user_id', 'version', 'updated_at'],
  user_ai_usage: ['user_id', 'task', 'model', 'prompt_tokens', 'completion_tokens', 'total_tokens', 'created_at'],
  user_book_lists: ['name', 'user_id', 'description', 'created_at', 'updated_at'],
  user_book_relations: ['user_id', 'from_book_id', 'to_book_id', 'relation_type', 'note', 'updated_at'],
  user_assistant_sessions: ['title', 'user_id', 'book_id', 'created_at', 'updated_at'],
  user_assistant_memories: ['user_id', 'content', 'category', 'source_session_id', 'updated_at'],
  user_behavior_events: ['user_id', 'event_type', 'occurred_at', 'created_at'],
  user_aux_data: ['user_id', 'namespace', 'version', 'updated_at'],
  user_data_state: ['user_id', 'sync_version', 'migration_status', 'last_sync_at', 'last_import_at', 'updated_at'],
  auth_sessions: ['user_id', 'created_at', 'expires_at', 'last_used_at', 'revoked_at'],
  api_key_records: ['user_id', 'provider', 'key_configured', 'created_at', 'updated_at'],
  admin_roles: ['user_id', 'tokendance_subject', 'role', 'granted_at', 'revoked_at', 'note'],
  admin_totp_credentials: ['user_id', 'enabled', 'totp_configured', 'failed_attempts', 'locked_until', 'last_used_at', 'updated_at'],
  admin_recovery_codes: ['user_id', 'code_configured', 'created_at', 'used_at'],
  admin_sessions: ['user_id', 'mfa_verified_at', 'created_at', 'expires_at', 'last_used_at', 'revoked_at'],
  admin_audit_logs: ['action', 'admin_user_id', 'target_user_id', 'request_id', 'occurred_at'],
  admin_daily_metrics: ['metric_date', 'registered_users', 'active_users', 'new_books', 'ai_requests', 'total_tokens', 'storage_bytes'],
}

function table(id: string, label: string, fields: string[], options: Partial<Omit<TableSpec, 'id' | 'label' | 'fields'>> = {}): TableSpec {
  const defaults = {
    description: label,
    primaryKeys: ['user_id'],
    userColumn: 'user_id',
    searchFields: ['user_id'],
    timeColumn: 'updated_at',
  }
  const config = { ...defaults, ...options }
  return {
    id, label, fields, ...config,
    columns: config.columns ?? SUMMARY_FIELDS[id].map(key => ({ key, label: ADMIN_DATA_FIELD_LABELS[key] ?? key })),
  }
}

const TABLES: TableSpec[] = [
  table('app_users', '用户账号', ['id', 'username', 'display_name', 'avatar_url', 'tokendance_subject', 'phone', 'email', 'phone_verified_at', 'email_verified_at', 'created_at', 'updated_at', 'merged_into_user_id', 'merged_at', 'login_disabled_at', 'password_account_merged_at'], {
    primaryKeys: ['id'], userColumn: 'id', searchFields: ['id', 'username', 'display_name', 'tokendance_subject', 'phone', 'email'],
    configured: { password_configured: 'password_hash' },
  }),
  table('user_books', '书籍与完整学习数据', ['user_id', 'book_id', 'name', 'author', 'status', 'current_phase', 'best_score', 'created_at', 'updated_at', 'deleted_at', 'purge_at', 'imported_at', 'last_opened_at', 'data'], {
    primaryKeys: ['user_id', 'book_id'], searchFields: ['user_id', 'book_id', 'name', 'author'], jsonFields: ['data'],
  }),
  table('user_settings', '用户设置', ['user_id', 'version', 'updated_at', 'data'], { jsonFields: ['data'] }),
  table('user_ai_usage', 'AI 用量', ['user_id', 'record_id', 'book_id', 'session_id', 'task', 'model', 'prompt_tokens', 'completion_tokens', 'total_tokens', 'created_at', 'updated_at', 'data'], {
    primaryKeys: ['user_id', 'record_id'], searchFields: ['user_id', 'record_id', 'book_id', 'task', 'model'], jsonFields: ['data'],
  }),
  table('user_book_lists', '书单', ['user_id', 'list_id', 'name', 'description', 'book_ids', 'created_at', 'updated_at'], {
    primaryKeys: ['user_id', 'list_id'], searchFields: ['user_id', 'name', 'description'], jsonFields: ['book_ids'],
  }),
  table('user_book_relations', '书籍关系', ['user_id', 'relation_id', 'from_book_id', 'to_book_id', 'relation_type', 'note', 'created_at', 'updated_at'], {
    primaryKeys: ['user_id', 'relation_id'], searchFields: ['user_id', 'from_book_id', 'to_book_id', 'relation_type', 'note'],
  }),
  table('user_assistant_sessions', '助手会话', ['user_id', 'session_id', 'title', 'book_id', 'created_at', 'updated_at', 'data'], {
    primaryKeys: ['user_id', 'session_id'], searchFields: ['user_id', 'session_id', 'title', 'book_id'], jsonFields: ['data'],
  }),
  table('user_assistant_memories', '助手记忆', ['user_id', 'memory_id', 'content', 'category', 'source_session_id', 'created_at', 'updated_at'], {
    primaryKeys: ['user_id', 'memory_id'], searchFields: ['user_id', 'content', 'category'],
  }),
  table('user_behavior_events', '行为事件', ['user_id', 'event_id', 'event_type', 'occurred_at', 'created_at', 'payload'], {
    primaryKeys: ['event_id'], searchFields: ['user_id', 'event_type'], timeColumn: 'occurred_at', jsonFields: ['payload'],
  }),
  table('user_aux_data', '历史辅助数据', ['user_id', 'namespace', 'version', 'updated_at', 'data'], {
    primaryKeys: ['user_id', 'namespace'], searchFields: ['user_id', 'namespace'], jsonFields: ['data'],
  }),
  table('user_data_state', '同步与迁移状态', ['user_id', 'schema_version', 'sync_version', 'last_import_at', 'last_sync_at', 'updated_at', 'migration_status', 'migration_version', 'migration_started_at', 'migration_deadline_at', 'migration_completed_at', 'last_migration_error']),
  table('auth_sessions', '登录会话', ['user_id', 'created_at', 'expires_at', 'revoked_at', 'last_used_at'], {
    primaryKeys: ['user_id', 'opaque'], timeColumn: 'created_at', opaque: true,
  }),
  table('api_key_records', 'API 密钥配置', ['user_id', 'provider', 'created_at', 'updated_at'], {
    primaryKeys: ['user_id', 'provider'], searchFields: ['user_id', 'provider'], configured: { key_configured: 'secret' },
  }),
  table('admin_roles', '管理员角色', ['user_id', 'tokendance_subject', 'role', 'granted_by', 'granted_at', 'revoked_at', 'note'], {
    timeColumn: 'granted_at', searchFields: ['user_id', 'tokendance_subject', 'role', 'note'],
  }),
  table('admin_totp_credentials', '管理员动态验证', ['user_id', 'enabled', 'encryption_key_version', 'enrolled_at', 'last_used_at', 'failed_attempts', 'locked_until', 'created_at', 'updated_at'], {
    configured: { totp_configured: 'secret_ciphertext' },
  }),
  table('admin_recovery_codes', '管理员恢复码', ['id', 'user_id', 'used_at', 'created_at'], {
    primaryKeys: ['id'], timeColumn: 'created_at', configured: { code_configured: 'code_hash' },
  }),
  table('admin_sessions', '管理员会话', ['user_id', 'created_at', 'expires_at', 'mfa_verified_at', 'last_used_at', 'revoked_at'], {
    primaryKeys: ['user_id', 'opaque'], timeColumn: 'created_at', opaque: true,
  }),
  table('admin_audit_logs', '管理员操作日志', ['event_id', 'admin_user_id', 'action', 'target_user_id', 'request_id', 'occurred_at', 'metadata'], {
    primaryKeys: ['event_id'], userColumn: 'target_user_id', searchFields: ['event_id', 'admin_user_id', 'target_user_id', 'action', 'request_id'], timeColumn: 'occurred_at', jsonFields: ['metadata'],
  }),
  table('admin_daily_metrics', '每日历史指标', ['metric_date', 'registered_users', 'active_users', 'new_books', 'active_books', 'completed_books', 'ai_requests', 'prompt_tokens', 'completion_tokens', 'total_tokens', 'behavior_events', 'storage_bytes', 'recycle_bin_bytes', 'updated_at'], {
    primaryKeys: ['metric_date'], userColumn: null, searchFields: ['metric_date'], timeColumn: 'metric_date',
  }),
]

export const ADMIN_DATA_TABLES: readonly AdminDataTable[] = TABLES.map(({ id, label, description, columns, primaryKeys, userColumn }) => ({ id, label, description, columns, primaryKeys, userColumn }))

export class AdminDataError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); this.name = 'AdminDataError' }
}

let pool: Pool | undefined
function database(): Pool {
  if (pool) return pool
  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString) throw new Error('DATABASE_URL is not configured.')
  const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, '\n').trim()
  const host = new URL(connectionString).hostname.toLowerCase()
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)
  pool = new Pool({ connectionString, max: 3, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000,
    ssl: local ? false : ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false } })
  return pool
}

function specFor(id: string): TableSpec {
  const spec = TABLES.find(item => item.id === id)
  if (!spec) throw new AdminDataError('不支持的数据表。')
  return spec
}

const SENSITIVE_FIELDS = new Set([
  'password', 'passwordhash', 'secret', 'secretciphertext', 'codehash', 'idhash', 'iphash', 'useragenthash',
  'apikey', 'apikeys', 'accesstoken', 'refreshtoken', 'idtoken', 'authorization', 'cookie', 'setcookie',
  'clientsecret', 'encryptionkey', 'privatekey', 'totpsecret', 'recoverycode', 'recoverycodes', 'sessiontoken',
  'authToken'.toLowerCase(), 'token', 'ciphertext', 'csrfToken'.toLowerCase(),
])

export function isAdminSensitiveField(key: string): boolean {
  return SENSITIVE_FIELDS.has(key.toLowerCase().replace(/[^a-z0-9]/g, ''))
}

export function redactAdminData(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(redactAdminData)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
    if (['__proto__', 'prototype', 'constructor', '__record_token'].includes(key)) return []
    if (isAdminSensitiveField(key)) {
      return [[`${key}_configured`, item !== null && item !== undefined && item !== '']]
    }
    return [[key, redactAdminData(item)]]
  }))
}

function opaqueSecret(): string {
  const secret = process.env.FEYNMAN_AUTH_STATE_SECRET
  if (!secret) throw new Error('FEYNMAN_AUTH_STATE_SECRET is not configured.')
  return `admin-data-record-v1:${secret}`
}

function projection(spec: TableSpec, detail: boolean, values: unknown[]): string {
  const fields = spec.fields.filter(field => detail || !spec.jsonFields?.includes(field))
  const result = fields.map(field => !detail && ['content', 'note', 'description', 'last_migration_error'].includes(field)
    ? `left("${field}", 180) AS "${field}"` : `"${field}"`)
  for (const [name, source] of Object.entries(spec.configured ?? {})) result.push(`("${source}" IS NOT NULL) AS "${name}"`)
  if (spec.opaque) {
    values.push(opaqueSecret())
    result.push(`encode(hmac(id_hash, $${values.length}::text, 'sha256'), 'hex') AS __record_token`)
  }
  return result.join(', ')
}

function rowResult(spec: TableSpec, row: Record<string, unknown>): AdminDataRow {
  const key = Object.fromEntries(spec.primaryKeys.map(field => [field, field === 'opaque' ? row.__record_token : row[field] instanceof Date ? (row[field] as Date).toISOString().slice(0, 10) : row[field]]))
  // Reapply the field allowlist after SQL so an accidental future query change cannot expose credentials.
  const allowed = new Set([...spec.fields, ...Object.keys(spec.configured ?? {})])
  const fields = Object.fromEntries(Object.entries(row).filter(([field]) => allowed.has(field)))
  return { key: Buffer.from(JSON.stringify(key)).toString('base64url'), fields: redactAdminData(fields) as Record<string, unknown> }
}

function validDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  if (!/^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z)?$/.test(value) || !Number.isFinite(Date.parse(value))) throw new AdminDataError('时间筛选格式无效。')
  return value
}

export async function getAdminDataPage(query: AdminDataQuery): Promise<AdminDataPage> {
  const spec = specFor(query.table)
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 25
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new AdminDataError('分页参数无效。')
  if (query.sort && !['newest', 'oldest'].includes(query.sort)) throw new AdminDataError('排序参数无效。')
  const search = query.search?.trim() ?? ''
  if (search.length > 200) throw new AdminDataError('搜索内容不能超过 200 字。')
  const values: unknown[] = []
  const clauses: string[] = []
  if (query.userId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query.userId)) throw new AdminDataError('用户 UUID 无效。')
    if (!spec.userColumn) throw new AdminDataError('此数据表不支持用户筛选。')
    values.push(query.userId)
    clauses.push(`"${spec.userColumn}" = $${values.length}::uuid`)
  }
  if (search) {
    values.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`)
    clauses.push(`(${spec.searchFields.map(field => `"${field}"::text ILIKE $${values.length} ESCAPE '\\'`).join(' OR ')})`)
  }
  const from = validDate(query.from)
  const to = validDate(query.to)
  if (from && to && Date.parse(from) > Date.parse(to)) throw new AdminDataError('开始时间不能晚于结束时间。')
  if (from) { values.push(from); clauses.push(`"${spec.timeColumn}" >= $${values.length}::timestamptz`) }
  if (to) {
    values.push(to)
    clauses.push(`"${spec.timeColumn}" ${to.length === 10 ? '<' : '<='} $${values.length}::timestamptz${to.length === 10 ? " + interval '1 day'" : ''}`)
  }
  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''
  const countValues = [...values]
  const select = projection(spec, false, values)
  const tieBreakers = spec.primaryKeys.filter(field => field !== spec.timeColumn && field !== 'opaque').map(field => `"${field}" ASC`)
  if (spec.opaque) tieBreakers.push('id_hash ASC')
  values.push(pageSize, (page - 1) * pageSize)
  const client = await database().connect()
  try {
    // Read a single snapshot so concurrent writes do not make page totals contradict the rows.
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    await client.query("SET LOCAL statement_timeout = '10s'")
    const count = await client.query(`SELECT count(*)::text AS total FROM public."${spec.id}"${where}`, countValues)
    const rows = await client.query(`SELECT ${select} FROM public."${spec.id}"${where} ORDER BY "${spec.timeColumn}" ${query.sort === 'oldest' ? 'ASC' : 'DESC'} NULLS LAST${tieBreakers.length ? `, ${tieBreakers.join(', ')}` : ''} LIMIT $${values.length - 1} OFFSET $${values.length}`, values)
    await client.query('COMMIT')
    return { table: spec.id, rows: rows.rows.map(row => rowResult(spec, row)), total: Number(count.rows[0]?.total ?? 0), page, pageSize }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

export async function getAdminDataRecord(tableId: string, encodedKey: string): Promise<AdminDataRow | null> {
  const spec = specFor(tableId)
  let key: Record<string, string>
  try {
    if (!/^[A-Za-z0-9_-]{1,4096}$/.test(encodedKey)) throw new Error('invalid')
    key = JSON.parse(Buffer.from(encodedKey, 'base64url').toString('utf8'))
    if (!key || Array.isArray(key) || typeof key !== 'object' || Object.keys(key).length !== spec.primaryKeys.length) throw new Error('invalid')
    for (const name of spec.primaryKeys) {
      if (!Object.prototype.hasOwnProperty.call(key, name) || typeof key[name] !== 'string' || !key[name] || key[name].length > 1024) throw new Error('invalid')
      if ((name === 'user_id' || (name === 'id' && ['app_users', 'admin_recovery_codes'].includes(spec.id)) || name === 'event_id') && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key[name])) throw new Error('invalid')
      if (name === 'opaque' && !/^[0-9a-f]{64}$/.test(key[name])) throw new Error('invalid')
      if (name === 'metric_date' && !/^\d{4}-\d{2}-\d{2}$/.test(key[name])) throw new Error('invalid')
    }
  } catch { throw new AdminDataError('记录标识无效。') }
  const values: unknown[] = []
  const select = projection(spec, true, values)
  const predicates = spec.primaryKeys.map(field => {
    values.push(key[field])
    return field === 'opaque' ? `encode(hmac(id_hash, $1::text, 'sha256'), 'hex') = $${values.length}` : `"${field}" = $${values.length}`
  })
  const result = await database().query(`SELECT ${select} FROM public."${spec.id}" WHERE ${predicates.join(' AND ')} LIMIT 1`, values)
  return result.rows[0] ? rowResult(spec, result.rows[0]) : null
}

export async function getAdminUserProfiles(userIds: string[]): Promise<Record<string, AdminUserProfile>> {
  if (!Array.isArray(userIds) || userIds.length > 200) throw new AdminDataError('每次最多读取 200 个用户资料。')
  const ids = [...new Set(userIds.map(id => {
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new AdminDataError('用户 UUID 无效。')
    return id.toLowerCase()
  }))]
  if (!ids.length) return {}
  const result = await database().query(`SELECT u.id, u.display_name, u.username, u.avatar_url,
    s.data->'profile'->>'customDisplayName' AS custom_display_name,
    s.data->'profile'->>'watchaNickname' AS watcha_nickname,
    s.data->'profile'->>'customAvatarUrl' AS custom_avatar_url,
    s.data->'profile'->>'watchaAvatarUrl' AS watcha_avatar_url
    FROM public.app_users u LEFT JOIN public.user_settings s ON s.user_id = u.id
    WHERE u.id = ANY($1::uuid[])`, [ids])
  const requested = new Set(ids)
  const text = (value: unknown): string | null => typeof value === 'string' ? value.trim() || null : null
  return Object.fromEntries(result.rows.flatMap(row => {
    if (typeof row.id !== 'string' || !requested.has(row.id.toLowerCase())) return []
    const id = row.id.toLowerCase()
    return [[id, {
      id,
      displayName: text(row.display_name) || text(row.custom_display_name) || text(row.watcha_nickname),
      username: text(row.username),
      avatarUrl: text(row.avatar_url) || text(row.custom_avatar_url) || text(row.watcha_avatar_url),
    }]]
  }))
}
