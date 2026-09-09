import { createHash, randomUUID } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import { normalizeBooks, normalizeBookLists, normalizeBookRelations, normalizeSettings } from '@/lib/backupValidation'
import { encryptApiKey, decryptApiKey, type EncryptedSecret } from './apiKeyVault'
import { adminIdentityMatches } from './adminAuth'
import { isAdminSensitiveField } from './adminData'

type Row = Record<string, unknown>
export class AdminMutationError extends Error {}
export type AdminMutationAction = 'edit' | 'delete' | 'disable' | 'enable' | 'revoke'
type Rule = { keys: string[]; editable: string[]; actions: AdminMutationAction[] }
const RULES: Record<string, Rule> = {
  app_users: { keys: ['id'], editable: ['display_name', 'phone', 'email'], actions: ['edit', 'disable', 'enable'] },
  user_books: { keys: ['user_id', 'book_id'], editable: ['data'], actions: ['edit', 'delete'] },
  user_settings: { keys: ['user_id'], editable: ['data'], actions: ['edit', 'delete'] },
  user_book_lists: { keys: ['user_id', 'list_id'], editable: ['name', 'description', 'book_ids'], actions: ['edit', 'delete'] },
  user_book_relations: { keys: ['user_id', 'relation_id'], editable: ['from_book_id', 'to_book_id', 'relation_type', 'note'], actions: ['edit', 'delete'] },
  user_assistant_sessions: { keys: ['user_id', 'session_id'], editable: ['title', 'data'], actions: ['edit', 'delete'] },
  user_assistant_memories: { keys: ['user_id', 'memory_id'], editable: ['content', 'category'], actions: ['edit', 'delete'] },
  user_aux_data: { keys: ['user_id', 'namespace'], editable: ['data'], actions: ['edit', 'delete'] },
  api_key_records: { keys: ['user_id', 'provider'], editable: [], actions: ['revoke'] },
}
const SECRET_KEY = /(?:api.?key|password|secret|credential|authorization|^(?:access|refresh|session)?_?token$)/i
function sensitiveField(key: string): boolean { return isAdminSensitiveField(key) || SECRET_KEY.test(key) }
let pool: Pool | undefined
function database(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) throw new AdminMutationError('数据库未配置。')
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(connectionString).hostname)
    const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, '\n').trim()
    pool = new Pool({ connectionString, max: 3, connectionTimeoutMillis: 10_000,
      ssl: local ? false : ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false } })
  }
  return pool
}

function ruleFor(table: string): Rule {
  if (!Object.hasOwn(RULES, table)) throw new AdminMutationError('此数据表不允许修改。')
  return RULES[table]
}
function decodeKey(table: string, key: string): Row {
  if (typeof key !== 'string' || key.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(key)) throw new AdminMutationError('记录标识无效。')
  let value: unknown
  try { value = JSON.parse(Buffer.from(key, 'base64url').toString('utf8')) } catch { throw new AdminMutationError('记录标识无效。') }
  const keys = ruleFor(table).keys
  if (!isObject(value) || Object.keys(value).length !== keys.length || !keys.every(k => typeof value[k] === 'string' && (value[k] as string).length > 0)) throw new AdminMutationError('记录标识无效。')
  return value
}
function isObject(value: unknown): value is Row { return !!value && typeof value === 'object' && !Array.isArray(value) }
function stable(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (isObject(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`
  return JSON.stringify(value)
}
export function adminRecordVersion(row: Row | null): string { return createHash('sha256').update(stable(row)).digest('hex') }
function where(key: Row): { sql: string; values: unknown[] } {
  return { sql: Object.keys(key).map((k, i) => `"${k}" = $${i + 1}`).join(' and '), values: Object.values(key) }
}
async function load(client: Pick<PoolClient, 'query'>, table: string, key: Row, lock = false): Promise<Row | null> {
  const clause = where(key)
  const result = await client.query(`select * from public."${table}" where ${clause.sql}${lock ? ' for update' : ''}`, clause.values)
  return result.rows[0] || null
}
function hasSecrets(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasSecrets)
  return isObject(value) && Object.entries(value).some(([key, v]) => sensitiveField(key) || hasSecrets(v))
}
function hasUnsafeKeys(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasUnsafeKeys)
  return isObject(value) && Object.entries(value).some(([key, v]) => ['__proto__', 'prototype', 'constructor'].includes(key) || hasUnsafeKeys(v))
}
function safeEditable(row: Row, table: string): Row {
  const fields: Row = {}
  for (const key of ruleFor(table).editable) {
    const value = row[key]
    if (isObject(value)) fields[key] = Object.fromEntries(Object.entries(value).filter(([k, v]) => !sensitiveField(k) && !hasSecrets(v) && !(table === 'user_books' && k === '_summaryOnly')))
    else fields[key] = value
  }
  return fields
}
export function getAdminMutationCapabilities(table: string): { editableFields: string[]; actions: AdminMutationAction[] } {
  const rule = Object.hasOwn(RULES, table) ? RULES[table] : undefined
  return { editableFields: rule ? [...rule.editable] : [], actions: rule ? [...rule.actions] : [] }
}
export async function getAdminEditableRecord(table: string, key: string): Promise<{ version: string; fields: Row }> {
  const row = await load(database(), table, decodeKey(table, key))
  if (!row) throw new AdminMutationError('记录不存在。')
  return { version: adminRecordVersion(row), fields: safeEditable(row, table) }
}
export async function getAdminMutationVersion(table: string, key: string): Promise<string> {
  return (await getAdminEditableRecord(table, key)).version
}

// Reuse the authenticated vault format; bounded chunks support full book documents.
function encryptSnapshot(value: unknown): EncryptedSecret[] {
  const serialized = Buffer.from(JSON.stringify({ adminDataSnapshot: value })).toString('base64')
  const result: EncryptedSecret[] = []
  for (let start = 0; start < serialized.length; start += 3000) {
    result.push(encryptApiKey(JSON.stringify({ adminDataChunk: serialized.slice(start, start + 3000) })))
  }
  return result
}
function decryptSnapshot(value: EncryptedSecret[]): { before: Row; after: Row | null } {
  const serialized = value.map(chunk => JSON.parse(decryptApiKey(chunk)).adminDataChunk).join('')
  return JSON.parse(Buffer.from(serialized, 'base64').toString('utf8')).adminDataSnapshot
}
async function requireActor(client: PoolClient, userId: string): Promise<void> {
  const result = await client.query(`select r.user_id, r.tokendance_subject from public.admin_roles r join public.app_users u on u.id = r.user_id
    where r.user_id = $1 and r.role = 'super_admin' and r.revoked_at is null
      and r.tokendance_subject = u.tokendance_subject and u.login_disabled_at is null
      and u.merged_into_user_id is null for share of r, u`, [userId])
  const row = result.rows[0]
  if (!row || !adminIdentityMatches({ userId: row.user_id, tokendanceSubject: row.tokendance_subject }, { id: row.user_id, tokendanceSubject: row.tokendance_subject })) throw new AdminMutationError('无权修改管理员数据。')
}
function checkVersion(row: Row | null, version: string): void {
  if (typeof version !== 'string' || adminRecordVersion(row) !== version) throw new AdminMutationError('数据已发生变化，请刷新后重新确认。')
}
function assertText(value: unknown, name: string, maximum: number, nullable = false): void {
  if (nullable && value === null) return
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new AdminMutationError(`${name}格式或长度无效。`)
}
async function validatePatch(client: PoolClient, table: string, before: Row, patch: Row): Promise<Row> {
  const rule = ruleFor(table)
  if (!isObject(patch) || !Object.keys(patch).length || Object.keys(patch).some(k => !rule.editable.includes(k))) throw new AdminMutationError('修改包含不允许编辑的字段。')
  if (JSON.stringify(patch).length > 20 * 1024 * 1024 || hasSecrets(patch) || hasUnsafeKeys(patch)) throw new AdminMutationError('修改不能包含凭据或危险字段，或数据超过大小限制。')
  const next: Row = { ...before, ...patch }
  if ('data' in patch) {
    if (!isObject(patch.data)) throw new AdminMutationError('data 必须是 JSON 对象。')
    const oldData = isObject(before.data) ? before.data : {}
    for (const [key, value] of Object.entries(oldData)) {
      if ((sensitiveField(key) || hasSecrets(value)) && key in patch.data) throw new AdminMutationError('不能修改包含凭据的字段。')
    }
    const protectedData = Object.fromEntries(Object.entries(oldData).filter(([k, v]) => sensitiveField(k) || hasSecrets(v)))
    next.data = { ...patch.data, ...protectedData }
  }
  if (table === 'app_users') {
    if ('display_name' in patch) assertText(patch.display_name, '昵称', 40, true)
    if ('phone' in patch) { assertText(patch.phone, '手机号', 32, true); if (patch.phone !== null && !/^\+?[0-9 ()-]{8,32}$/.test(String(patch.phone))) throw new AdminMutationError('手机号格式无效。'); next.phone_verified_at = null }
    if ('email' in patch) { assertText(patch.email, '邮箱', 254, true); if (patch.email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(patch.email))) throw new AdminMutationError('邮箱格式无效。'); next.email_verified_at = null }
  } else if (table === 'user_books') {
    const data = next.data as Row
    if (data.id !== before.book_id || data._summaryOnly) throw new AdminMutationError('书籍 ID 不可修改，不能使用摘要覆盖完整数据。')
    const normalized = normalizeBooks([data])
    if (!normalized.valid) throw new AdminMutationError(normalized.error)
    const validated = normalized.data[0]
    next.data = { ...data, ...validated }
    delete (next.data as Row)._summaryOnly
    Object.assign(next, { name: validated.name, author: validated.author || null, status: validated.status, current_phase: validated.currentPhase, best_score: validated.bestScore })
  } else if (table === 'user_settings') {
    const normalized = normalizeSettings(next.data)
    if (!normalized.valid) throw new AdminMutationError(normalized.error)
  } else if (table === 'user_book_lists' || table === 'user_book_relations') {
    const books = await client.query('select book_id from public.user_books where user_id = $1', [before.user_id])
    const ids = new Set<string>(books.rows.map(r => r.book_id))
    const referencedIds = table === 'user_book_lists' ? next.book_ids : [next.from_book_id, next.to_book_id]
    if (!Array.isArray(referencedIds) || referencedIds.some(id => typeof id !== 'string' || !ids.has(id))) throw new AdminMutationError('关联书籍必须属于同一账号。')
    const normalized = table === 'user_book_lists'
      ? normalizeBookLists([{ id: before.list_id, name: next.name, description: next.description, bookIds: next.book_ids, createdAt: new Date(String(before.created_at)).getTime(), updatedAt: Date.now() }], ids)
      : normalizeBookRelations([{ id: before.relation_id, fromBookId: next.from_book_id, toBookId: next.to_book_id, type: next.relation_type, note: next.note, createdAt: new Date(String(before.created_at)).getTime() }], ids)
    if (!normalized.valid) throw new AdminMutationError(normalized.error)
  } else if (table === 'user_assistant_sessions') {
    assertText(next.title, '会话标题', 200)
    if (JSON.stringify(next.data).length > 2 * 1024 * 1024) throw new AdminMutationError('会话数据超过 2 MB。')
  } else if (table === 'user_assistant_memories') {
    assertText(next.content, '记忆内容', 500)
    if (!['preference', 'learning-style', 'goal', 'workflow'].includes(String(next.category))) throw new AdminMutationError('记忆分类无效。')
  }
  return next
}
async function updateRow(client: PoolClient, table: string, key: Row, before: Row, after: Row): Promise<Row> {
  const fields = Object.keys(after).filter(k => !Object.hasOwn(key, k) && stable(after[k]) !== stable(before[k]))
  if (!fields.length) return before
  const clause = where(key)
  const values = [...clause.values, ...fields.map(k => isObject(after[k]) || Array.isArray(after[k]) ? JSON.stringify(after[k]) : after[k])]
  const result = await client.query(`update public."${table}" set ${fields.map((k, i) => `"${k}" = $${clause.values.length + i + 1}`).join(', ')} where ${clause.sql} returning *`, values)
  return result.rows[0]
}
async function audit(client: PoolClient, actor: string, target: string, action: string, changeId: string, table: string): Promise<void> {
  await client.query(`insert into public.admin_audit_logs (admin_user_id, target_user_id, action, metadata)
    values ($1, $2, $3, $4::jsonb)`, [actor, target, action, JSON.stringify({ changeId, table })])
}
export interface AdminMutationInput { table: string; key: string; action: AdminMutationAction; version: string; patch?: Row }
export async function mutateAdminRecord(adminUserId: string, input: AdminMutationInput): Promise<{ changeId: string; restorable: boolean }> {
  const rule = ruleFor(input.table)
  if (!rule.actions.includes(input.action)) throw new AdminMutationError('此操作不被允许。')
  const key = decodeKey(input.table, input.key)
  const target = String(key.user_id || key.id)
  if (input.table === 'app_users' && target === adminUserId) throw new AdminMutationError('不能通过管理工具修改自己的管理员账号。')
  const client = await database().connect()
  try {
    await client.query('begin')
    await requireActor(client, adminUserId)
    const before = await load(client, input.table, key, true)
    if (!before) throw new AdminMutationError('记录不存在。')
    checkVersion(before, input.version)
    if (input.table === 'app_users' && before.merged_into_user_id) throw new AdminMutationError('已合并账号不能修改或重新启用。')
    let after: Row | null
    if (input.action === 'delete' || input.action === 'revoke') {
      if (input.table === 'user_books') {
        if (before.deleted_at) throw new AdminMutationError('该书籍已在回收站。')
        after = { ...before, deleted_at: new Date().toISOString(), purge_at: new Date(Date.now() + 30 * 86400000).toISOString(), updated_at: new Date().toISOString() }
      } else after = null
    } else if (input.action === 'disable' || input.action === 'enable') {
      after = { ...before, login_disabled_at: input.action === 'disable' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }
    } else {
      after = await validatePatch(client, input.table, before, input.patch || {})
      if ('updated_at' in before) after.updated_at = new Date().toISOString()
      if ('version' in before) after.version = String(BigInt(String(before.version)) + BigInt(1))
      if (input.table === 'user_books') after.data = { ...(after.data as Row), updatedAt: Date.now() }
    }
    const changeId = randomUUID()
    const restorable = input.action !== 'revoke'
    const encrypted = encryptSnapshot({ before, after })
    await client.query(`insert into public.admin_data_changes (id, admin_user_id, target_user_id, table_name, record_key, action, snapshot, after_version, restorable)
      values ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8,$9)`, [changeId, adminUserId, target, input.table, JSON.stringify(key), input.action, JSON.stringify(encrypted), adminRecordVersion(after), restorable])
    if (after) {
      after = await updateRow(client, input.table, key, before, after)
      await client.query('update public.admin_data_changes set after_version = $2 where id = $1', [changeId, adminRecordVersion(after)])
    } else {
      const clause = where(key)
      await client.query(`delete from public."${input.table}" where ${clause.sql}`, clause.values)
    }
    await audit(client, adminUserId, target, `data.${input.action}`, changeId, input.table)
    await client.query('commit')
    return { changeId, restorable }
  } catch (error) { await client.query('rollback'); throw error } finally { client.release() }
}

export async function restoreAdminChange(adminUserId: string, changeId: string): Promise<void> {
  if (!/^[a-f0-9-]{36}$/i.test(changeId)) throw new AdminMutationError('变更标识无效。')
  const client = await database().connect()
  try {
    await client.query('begin')
    await requireActor(client, adminUserId)
    const result = await client.query('select * from public.admin_data_changes where id = $1 for update', [changeId])
    const change = result.rows[0]
    if (!change || !change.restorable || change.restored_at) throw new AdminMutationError('该变更不可恢复或已经恢复。')
    const table = String(change.table_name)
    ruleFor(table)
    const key = decodeKey(table, Buffer.from(JSON.stringify(change.record_key)).toString('base64url'))
    if (table === 'app_users' && change.target_user_id === adminUserId) throw new AdminMutationError('不能恢复自己的管理员账号变更。')
    const current = await load(client, table, key, true)
    const { before, after } = decryptSnapshot(change.snapshot)
    // A purged soft-deleted book has no row left to overwrite; the encrypted
    // archive survives the normal recycle-bin retention period.
    if (!(table === 'user_books' && current === null && after?.deleted_at)) checkVersion(current, change.after_version)
    const restored = { ...before }
    const previousTimes = [before, current, after].flatMap(record => {
      if (!record) return []
      return [Date.parse(String(record.updated_at)), isObject(record.data) ? Number(record.data.updatedAt) : NaN]
        .filter(Number.isFinite)
    })
    const restoredAt = new Date(Math.max(Date.now(), ...previousTimes.map(time => time + 1))).toISOString()
    if ('updated_at' in restored) restored.updated_at = restoredAt
    if ('version' in restored) {
      const latestVersion = [before.version, current?.version, after?.version].filter(v => v !== undefined)
        .map(v => BigInt(String(v))).reduce((latest, v) => v > latest ? v : latest, BigInt(0))
      restored.version = String(latestVersion + BigInt(1))
    }
    if (table === 'user_books' && isObject(restored.data)) {
      restored.data = { ...restored.data, updatedAt: Date.parse(restoredAt) }
      delete (restored.data as Row)._summaryOnly
    }
    if (current) await updateRow(client, table, key, current, restored)
    else {
      const columns = Object.keys(restored)
      if (columns.some(k => !/^[a-z_]+$/.test(k))) throw new AdminMutationError('存档字段无效。')
      await client.query(`insert into public."${table}" (${columns.map(k => `"${k}"`).join(',')}) values (${columns.map((_, i) => `$${i + 1}`).join(',')})`, columns.map(k => isObject(restored[k]) || Array.isArray(restored[k]) ? JSON.stringify(restored[k]) : restored[k]))
    }
    await client.query('update public.admin_data_changes set restored_at = now(), restored_by = $2 where id = $1', [changeId, adminUserId])
    await audit(client, adminUserId, change.target_user_id, 'data.restore', changeId, table)
    await client.query('commit')
  } catch (error) { await client.query('rollback'); throw error } finally { client.release() }
}

export async function listAdminChanges(options: { page?: number; pageSize?: number; userId?: string } = {}) {
  const page = Math.max(1, Math.floor(options.page || 1))
  const pageSize = Math.min(50, Math.max(1, Math.floor(options.pageSize || 20)))
  const values: unknown[] = options.userId ? [options.userId] : []
  const filter = options.userId ? 'where target_user_id = $1' : ''
  const count = await database().query(`select count(*)::int as total from public.admin_data_changes ${filter}`, values)
  const result = await database().query(`select id, table_name, record_key, action, admin_user_id, target_user_id, created_at, restored_at, restorable
    from public.admin_data_changes ${filter} order by created_at desc limit $${values.length + 1} offset $${values.length + 2}`, [...values, pageSize, (page - 1) * pageSize])
  return { rows: result.rows.map(row => ({ id: String(row.id), table: String(row.table_name), key: Buffer.from(JSON.stringify(row.record_key)).toString('base64url'),
    action: String(row.action), adminUserId: String(row.admin_user_id), targetUserId: String(row.target_user_id),
    createdAt: new Date(row.created_at).toISOString(), restoredAt: row.restored_at ? new Date(row.restored_at).toISOString() : null, restorable: Boolean(row.restorable) })), total: Number(count.rows[0]?.total || 0), page, pageSize }
}
