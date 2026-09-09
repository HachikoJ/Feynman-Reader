import { Pool } from 'pg'
import { decryptApiKey } from '../apiKeyVault'
import { AdminMutationError, adminRecordVersion, getAdminEditableRecord, getAdminMutationCapabilities, listAdminChanges, mutateAdminRecord, restoreAdminChange } from '../adminMutations'

jest.mock('pg', () => ({ Pool: jest.fn() }))

const ADMIN = '00000000-0000-4000-8000-000000000001'
const ADMIN_SUBJECT = 'fixture-watcha-admin'
const originalAdminUserId = process.env.FEYNMAN_ADMIN_USER_ID
const originalAdminSubject = process.env.FEYNMAN_ADMIN_PROVIDER_SUBJECT

afterAll(() => {
  if (originalAdminUserId === undefined) delete process.env.FEYNMAN_ADMIN_USER_ID
  else process.env.FEYNMAN_ADMIN_USER_ID = originalAdminUserId
  if (originalAdminSubject === undefined) delete process.env.FEYNMAN_ADMIN_PROVIDER_SUBJECT
  else process.env.FEYNMAN_ADMIN_PROVIDER_SUBJECT = originalAdminSubject
})
const USER = '929b1159-3cb2-45d1-88ca-ea3d2b9d6754'
const key = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
const book = { user_id: USER, book_id: 'b1', name: 'Book', author: null, status: 'reading', current_phase: 1, best_score: 0,
  data: { id: 'b1', name: 'Book', status: 'reading', currentPhase: 1, bestScore: 0, responses: { background: 'Analysis' }, noteRecords: [], practiceRecords: [], qaPracticeRecords: [], createdAt: 1, updatedAt: 2 },
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null, purge_at: null }

describe('administrator reversible mutations', () => {
  const query = jest.fn()
  const release = jest.fn()
  let row: Record<string, unknown> | null
  let change: Record<string, unknown> | null
  let actor = ADMIN
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.FEYNMAN_ADMIN_USER_ID = ADMIN
    process.env.FEYNMAN_ADMIN_PROVIDER_SUBJECT = ADMIN_SUBJECT
    process.env.DATABASE_URL = 'postgres://localhost/test'
    process.env.FEYNMAN_API_KEY_ENCRYPTION_KEY = 'ab'.repeat(32)
    row = { ...book }; change = null; actor = ADMIN
    query.mockImplementation(async (sql: string, values: unknown[] = []) => {
      if (sql.includes('select r.user_id')) return { rows: [{ user_id: actor, tokendance_subject: ADMIN_SUBJECT }] }
      if (sql.includes('select * from public.admin_data_changes')) return { rows: change ? [change] : [] }
      if (sql.startsWith('select * from')) return { rows: row ? [row] : [] }
      if (sql.startsWith('update public."') && sql.includes('returning *')) return { rows: [row] }
      if (sql.includes('insert into public.admin_data_changes')) {
        change = { id: values[0], admin_user_id: values[1], target_user_id: values[2], table_name: values[3], record_key: JSON.parse(String(values[4])), action: values[5], snapshot: JSON.parse(String(values[6])), after_version: values[7], restorable: values[8] }
      }
      if (sql.startsWith('delete from public."')) row = null
      return { rows: [], rowCount: 1 }
    })
    ;(Pool as unknown as jest.Mock).mockImplementation(() => ({ query, connect: async () => ({ query, release }) }))
  })

  it('only exposes bounded business operations; identity and privilege tables are read-only', () => {
    expect(getAdminMutationCapabilities('admin_roles').actions).toEqual([])
    expect(getAdminMutationCapabilities('user_ai_usage').actions).toEqual([])
    expect(getAdminMutationCapabilities('app_users').editableFields).toEqual(['display_name', 'phone', 'email'])
    expect(getAdminMutationCapabilities('api_key_records').actions).toEqual(['revoke'])
  })

  it('rejects other identities and never writes data', async () => {
    actor = USER
    await expect(mutateAdminRecord(USER, { table: 'user_books', key: key({ user_id: USER, book_id: 'b1' }), action: 'delete', version: adminRecordVersion(row) })).rejects.toThrow('无权')
    expect(query.mock.calls.some(([sql]) => sql.startsWith('insert'))).toBe(false)
    expect(query).toHaveBeenCalledWith('rollback')
  })

  it('blocks stale browser edits before recording or modifying anything', async () => {
    await expect(mutateAdminRecord(ADMIN, { table: 'user_books', key: key({ user_id: USER, book_id: 'b1' }), action: 'delete', version: 'stale' })).rejects.toThrow('数据已发生变化')
    expect(query.mock.calls.some(([sql]) => sql.startsWith('insert'))).toBe(false)
  })

  it('soft deletes a book with encrypted full backup and audit in one transaction, preserving relations', async () => {
    const result = await mutateAdminRecord(ADMIN, { table: 'user_books', key: key({ user_id: USER, book_id: 'b1' }), action: 'delete', version: adminRecordVersion(row) })
    expect(result.restorable).toBe(true)
    expect(JSON.stringify(change)).not.toContain('Analysis')
    const chunks = (change!.snapshot as Parameters<typeof decryptApiKey>[0][]).map(chunk => JSON.parse(decryptApiKey(chunk)).adminDataChunk).join('')
    const snapshot = JSON.parse(Buffer.from(chunks, 'base64').toString('utf8')).adminDataSnapshot
    expect(snapshot.before.data.responses.background).toBe('Analysis')
    expect(snapshot.after.deleted_at).toBeTruthy()
    const calls = query.mock.calls.map(([sql]) => sql as string)
    expect(calls.findIndex(sql => sql.includes('insert into public.admin_data_changes'))).toBeLessThan(calls.findIndex(sql => sql.startsWith('update public."user_books"')))
    expect(calls.some(sql => sql.includes('user_book_relations'))).toBe(false)
    expect(calls.some(sql => sql.includes('insert into public.admin_audit_logs'))).toBe(true)
    expect(calls.at(-1)).toBe('commit')
  })

  it('rolls back the data write if audit persistence fails', async () => {
    const normal = query.getMockImplementation()!
    query.mockImplementation(async (...args) => {
      if (String(args[0]).includes('insert into public.admin_audit_logs')) throw new Error('audit failed')
      return normal(...args)
    })
    await expect(mutateAdminRecord(ADMIN, { table: 'user_books', key: key({ user_id: USER, book_id: 'b1' }), action: 'delete', version: adminRecordVersion(row) })).rejects.toThrow('audit failed')
    expect(query).toHaveBeenCalledWith('rollback')
    expect(query).not.toHaveBeenCalledWith('commit')
  })

  it('rejects identity fields, summary book data, and tampered primary keys', async () => {
    await expect(mutateAdminRecord(ADMIN, { table: 'user_books', key: key({ user_id: USER, book_id: 'b1' }), action: 'edit', version: adminRecordVersion(row), patch: { user_id: ADMIN } })).rejects.toThrow('不允许编辑')
    await expect(mutateAdminRecord(ADMIN, { table: 'user_books', key: key({ user_id: USER, book_id: 'b1' }), action: 'edit', version: adminRecordVersion(row), patch: { data: { ...book.data, _summaryOnly: true } } })).rejects.toThrow('摘要')
    await expect(mutateAdminRecord(ADMIN, { table: 'user_books', key: key({ user_id: USER, book_id: 'b1', 'x; DROP TABLE': 'x' }), action: 'delete', version: adminRecordVersion(row) })).rejects.toThrow('记录标识')
  })

  it('never allows editing or disabling the acting administrator account', async () => {
    await expect(mutateAdminRecord(ADMIN, { table: 'app_users', key: key({ id: ADMIN }), action: 'disable', version: 'x' })).rejects.toThrow('自己的管理员账号')
    expect(query).not.toHaveBeenCalled()
  })

  it('redacts credential fields from editing and keeps existing secrets during a settings edit', async () => {
    row = { user_id: USER, data: { apiKey: 'secret-key-never-show', nested: { secret: 'also-secret' }, theme: 'dark' }, version: '1', updated_at: book.updated_at }
    const editable = await getAdminEditableRecord('user_settings', key({ user_id: USER }))
    expect(editable.fields).toEqual({ data: { theme: 'dark' } })
    await mutateAdminRecord(ADMIN, { table: 'user_settings', key: key({ user_id: USER }), action: 'edit', version: editable.version, patch: { data: { theme: 'light' } } })
    const update = query.mock.calls.find(([sql]) => sql.startsWith('update public."user_settings"'))!
    expect(JSON.parse(update[1][1])).toEqual({ apiKey: 'secret-key-never-show', nested: { secret: 'also-secret' }, theme: 'light' })
  })

  it('uses the shared sensitive field policy for both editing and viewing', async () => {
    row = { user_id: USER, namespace: 'notes', data: { cookie: 'session=hidden', authToken: 'hidden-auth', csrfToken: 'hidden-csrf', privateKey: 'hidden-private', ciphertext: 'hidden-cipher', nested: { idToken: 'hidden-id' }, text: 'Visible note' }, version: '1', updated_at: book.updated_at }
    const editable = await getAdminEditableRecord('user_aux_data', key({ user_id: USER, namespace: 'notes' }))
    expect(editable.fields).toEqual({ data: { text: 'Visible note' } })
    await expect(mutateAdminRecord(ADMIN, { table: 'user_aux_data', key: key({ user_id: USER, namespace: 'notes' }), action: 'edit', version: editable.version, patch: { data: { cookie: 'new-cookie' } } })).rejects.toBeInstanceOf(AdminMutationError)
  })

  it('omits a legacy summary marker from editing and stores canonical JSON status and score', async () => {
    row = { ...book, data: { ...book.data, _summaryOnly: true, status: 'finished', bestScore: 95, customExtension: 'keep' } }
    const editable = await getAdminEditableRecord('user_books', key({ user_id: USER, book_id: 'b1' }))
    expect(editable.fields.data).not.toHaveProperty('_summaryOnly')
    await mutateAdminRecord(ADMIN, { table: 'user_books', key: key({ user_id: USER, book_id: 'b1' }), action: 'edit', version: editable.version, patch: editable.fields })
    const update = query.mock.calls.find(([sql]) => sql.startsWith('update public."user_books"'))!
    const json = update[1].find((value: unknown) => typeof value === 'string' && value.startsWith('{'))
    expect(JSON.parse(json)).toMatchObject({ status: 'reading', bestScore: 0, customExtension: 'keep' })
    expect(JSON.parse(json)).not.toHaveProperty('_summaryOnly')
  })

  it.each(['user_book_lists', 'user_book_relations'])('allows optional null descriptions and notes in %s', async table => {
    const normal = query.getMockImplementation()!
    query.mockImplementation(async (...args) => {
      if (String(args[0]).startsWith('select book_id')) return { rows: [{ book_id: 'b1' }, { book_id: 'b2' }] }
      return normal(...args)
    })
    const isList = table === 'user_book_lists'
    row = isList
      ? { user_id: USER, list_id: 'list1', name: 'List', description: null, book_ids: ['b1'], created_at: book.created_at, updated_at: book.updated_at }
      : { user_id: USER, relation_id: 'r1', from_book_id: 'b1', to_book_id: 'b2', relation_type: 'related', note: null, created_at: book.created_at }
    await expect(mutateAdminRecord(ADMIN, { table, key: key({ user_id: USER, [isList ? 'list_id' : 'relation_id']: isList ? 'list1' : 'r1' }), action: 'edit', version: adminRecordVersion(row), patch: isList ? { description: null } : { note: null } })).resolves.toHaveProperty('changeId')
  })

  it('handles large escaped JSON using authenticated encrypted chunks', async () => {
    row = { user_id: USER, namespace: 'notes', data: { text: '\u0000'.repeat(10000) }, version: '1', updated_at: book.updated_at }
    await mutateAdminRecord(ADMIN, { table: 'user_aux_data', key: key({ user_id: USER, namespace: 'notes' }), action: 'delete', version: adminRecordVersion(row) })
    expect((change!.snapshot as unknown[]).length).toBeGreaterThan(1)
    await restoreAdminChange(ADMIN, String(change!.id))
    const insert = query.mock.calls.find(([sql]) => sql.startsWith('insert into public."user_aux_data"'))!
    expect(JSON.parse(insert[1][2]).text).toHaveLength(10000)
  })

  it('refuses restoration over new user data', async () => {
    row = { user_id: USER, memory_id: 'm1', content: 'Learning goal', category: 'goal' }
    await mutateAdminRecord(ADMIN, { table: 'user_assistant_memories', key: key({ user_id: USER, memory_id: 'm1' }), action: 'delete', version: adminRecordVersion(row) })
    row = { user_id: USER, memory_id: 'm1', content: 'New content', category: 'goal' }
    await expect(restoreAdminChange(ADMIN, String(change!.id))).rejects.toThrow('数据已发生变化')
    expect(query.mock.calls.some(([sql]) => sql.startsWith('insert into public."user_assistant_memories"'))).toBe(false)
  })

  it('can restore a soft-deleted book after recycle-bin expiry without overwriting another book', async () => {
    await mutateAdminRecord(ADMIN, { table: 'user_books', key: key({ user_id: USER, book_id: 'b1' }), action: 'delete', version: adminRecordVersion(row) })
    row = null
    await restoreAdminChange(ADMIN, String(change!.id))
    const insert = query.mock.calls.find(([sql]) => sql.startsWith('insert into public."user_books"'))!
    expect(insert[1][0]).toBe(USER)
    expect(insert[1][1]).toBe('b1')
    expect(JSON.parse(insert[1][7]).responses.background).toBe('Analysis')
    expect(JSON.parse(insert[1][7]).updatedAt).toBeGreaterThan(book.data.updatedAt)
    expect(Date.parse(insert[1][9])).toBeGreaterThan(Date.parse(book.updated_at))
  })

  it('restoration advances versions and timestamps beyond the archived change', async () => {
    row = { user_id: USER, namespace: 'notes', data: { text: 'Earlier note' }, version: '9', updated_at: book.updated_at }
    await mutateAdminRecord(ADMIN, { table: 'user_aux_data', key: key({ user_id: USER, namespace: 'notes' }), action: 'edit', version: adminRecordVersion(row), patch: { data: { text: 'New note' } } })
    row = { ...row, version: '10', data: { text: 'New note' }, updated_at: new Date().toISOString() }
    change!.after_version = adminRecordVersion(row)
    await restoreAdminChange(ADMIN, String(change!.id))
    const updates = query.mock.calls.filter(([sql]) => sql.startsWith('update public."user_aux_data"'))
    const restoration = updates.at(-1)!
    expect(restoration[0]).toContain('"version"')
    expect(restoration[1]).toContain('11')
    expect(restoration[1].some((value: unknown) => typeof value === 'string' && /^20\d\d-/.test(value) && Date.parse(value) > Date.parse(book.updated_at))).toBe(true)
  })

  it('rejects cross-account book references before updating a list', async () => {
    row = { user_id: USER, list_id: 'list1', name: 'List', description: null, book_ids: ['b1'], created_at: book.created_at, updated_at: book.updated_at }
    await expect(mutateAdminRecord(ADMIN, { table: 'user_book_lists', key: key({ user_id: USER, list_id: 'list1' }), action: 'edit', version: adminRecordVersion(row), patch: { book_ids: ['another-user-book'] } })).rejects.toThrow('同一账号')
    expect(query.mock.calls.some(([sql]) => sql.startsWith('update public."user_book_lists"'))).toBe(false)
  })

  it('does not allow restoring revoked provider keys', async () => {
    row = { user_id: USER, provider: 'tokendance', secret: { ciphertext: 'private' } }
    const result = await mutateAdminRecord(ADMIN, { table: 'api_key_records', key: key({ user_id: USER, provider: 'tokendance' }), action: 'revoke', version: adminRecordVersion(row) })
    expect(result.restorable).toBe(false)
    await expect(restoreAdminChange(ADMIN, result.changeId)).rejects.toThrow('不可恢复')
  })

  it('history queries never select backup content or secrets', async () => {
    await listAdminChanges()
    const sql = query.mock.calls.map(call => String(call[0])).join('\n')
    expect(sql).not.toContain('snapshot')
    expect(sql).not.toContain('select *')
  })
})
