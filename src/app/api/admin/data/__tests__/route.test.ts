import { GET } from '../route'

jest.mock('@/lib/server/adminAuth', () => ({ requireAdminSession: jest.fn() }))
jest.mock('@/lib/server/persistence', () => ({ getPersistence: jest.fn() }))
jest.mock('@/lib/server/adminData', () => {
  const catalogReads = jest.fn()
  return {
    get ADMIN_DATA_TABLES() { catalogReads(); return [{ id: 'user_books', label: '书籍与完整学习数据' }] },
    catalogReads,
    getAdminDataPage: jest.fn(),
    getAdminDataRecord: jest.fn(),
    AdminDataError: class AdminDataError extends Error {
      constructor(message: string, public readonly status = 400) { super(message) }
    },
  }
})

const { requireAdminSession } = jest.requireMock('@/lib/server/adminAuth') as { requireAdminSession: jest.Mock }
const { getPersistence } = jest.requireMock('@/lib/server/persistence') as { getPersistence: jest.Mock }
const { catalogReads, getAdminDataPage, getAdminDataRecord, AdminDataError } = jest.requireMock('@/lib/server/adminData') as {
  catalogReads: jest.Mock
  getAdminDataPage: jest.Mock
  getAdminDataRecord: jest.Mock
  AdminDataError: new (message: string, status?: number) => Error
}
const adminId = '00000000-0000-4000-8000-000000000001'
const targetUserId = 'e8be1a3a-c728-4911-9dd1-ec2fb90740ba'
const request = (params: Record<string, string> = {}) => new Request(`https://reader.deline.top/api/admin/data/?${new URLSearchParams(params)}`)

describe('administrator detailed data read boundary', () => {
  let writeAdminAuditLog: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    requireAdminSession.mockReset().mockResolvedValue({ ok: true, userId: adminId, session: { idHash: 'mfa-session' } })
    getAdminDataPage.mockReset().mockResolvedValue({ table: 'user_books', rows: [], total: 0, page: 1, pageSize: 25 })
    getAdminDataRecord.mockReset().mockResolvedValue({ key: 'record-key', fields: { user_id: targetUserId, name: '书籍正文' } })
    writeAdminAuditLog = jest.fn().mockResolvedValue(undefined)
    getPersistence.mockReturnValue({ writeAdminAuditLog })
  })

  it.each([
    { status: 401, error: '请先登录账号。' },
    { status: 403, error: '无权访问该页面。' },
    { status: 403, error: '管理员会话已失效，请重新认证。' },
  ])('blocks catalog, list and record reads before authorization: $error', async denied => {
    requireAdminSession.mockResolvedValue({ ok: false, ...denied })
    const queries: Record<string, string>[] = [{}, { table: 'user_books' }, { table: 'user_books', record: 'record-key' }]
    for (const params of queries) {
      const response = await GET(request(params))
      expect(response.status).toBe(denied.status)
      expect(await response.json()).toEqual({ error: denied.error })
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
    expect(catalogReads).not.toHaveBeenCalled()
    expect(getAdminDataPage).not.toHaveBeenCalled()
    expect(getAdminDataRecord).not.toHaveBeenCalled()
    expect(getPersistence).not.toHaveBeenCalled()
  })

  it('returns the table catalog only after MFA and records the access', async () => {
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ tables: [{ id: 'user_books', label: '书籍与完整学习数据' }] })
    expect(catalogReads).toHaveBeenCalledTimes(1)
    expect(getAdminDataPage).not.toHaveBeenCalled()
    expect(getAdminDataRecord).not.toHaveBeenCalled()
    expect(writeAdminAuditLog).toHaveBeenCalledWith({ adminUserId: adminId, action: 'admin_table_viewed', metadata: { table: '', record: '' } })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('forwards the user filter and complete list query without changing its scope', async () => {
    const response = await GET(request({ table: 'user_books', userId: targetUserId, search: '书籍', page: '3', pageSize: '50', from: '2026-09-01', to: '2026-09-08', sort: 'oldest' }))
    expect(response.status).toBe(200)
    expect(getAdminDataPage).toHaveBeenCalledWith({
      table: 'user_books', userId: targetUserId, search: '书籍', page: 3, pageSize: 50, from: '2026-09-01', to: '2026-09-08', sort: 'oldest',
    })
    expect(getAdminDataRecord).not.toHaveBeenCalled()
    expect(writeAdminAuditLog).toHaveBeenCalledWith({ adminUserId: adminId, action: 'admin_table_viewed', metadata: { table: 'user_books', record: '' } })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('applies bounded query defaults through the data layer', async () => {
    const response = await GET(request({ table: 'user_books' }))
    expect(response.status).toBe(200)
    expect(getAdminDataPage).toHaveBeenCalledWith({
      table: 'user_books', userId: undefined, search: undefined, page: 1, pageSize: 25, from: undefined, to: undefined, sort: 'newest',
    })
  })

  it('forwards the complete encoded record key and audits successful detail reads', async () => {
    const response = await GET(request({ table: 'user_books', record: 'record-key' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ key: 'record-key', fields: { user_id: targetUserId, name: '书籍正文' } })
    expect(getAdminDataRecord).toHaveBeenCalledWith('user_books', 'record-key')
    expect(getAdminDataPage).not.toHaveBeenCalled()
    expect(writeAdminAuditLog).toHaveBeenCalledWith({ adminUserId: adminId, action: 'admin_record_viewed', metadata: { table: 'user_books', record: 'record-key' } })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('returns a no-store 404 for missing records and records the lookup', async () => {
    getAdminDataRecord.mockResolvedValue(null)
    const response = await GET(request({ table: 'user_books', record: 'missing-key' }))
    expect(response.status).toBe(404)
    expect(await response.json()).toBeNull()
    expect(writeAdminAuditLog).toHaveBeenCalledWith({ adminUserId: adminId, action: 'admin_record_viewed', metadata: { table: 'user_books', record: 'missing-key' } })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('exposes a typed safe validation error with its status', async () => {
    getAdminDataPage.mockRejectedValue(new AdminDataError('分页参数无效。', 400))
    const response = await GET(request({ table: 'user_books', page: '-1' }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '分页参数无效。' })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(writeAdminAuditLog).not.toHaveBeenCalled()
  })

  it.each([
    new Error('数据库执行失败 private-row-secret'),
    Object.assign(new Error('database failed: private-password'), { code: '23505', detail: 'private-record' }),
    { name: 'AdminDataError', message: 'private-spoofed-error', status: 400 },
  ])('hides unknown error details, including errors impersonating the safe class', async error => {
    getAdminDataRecord.mockRejectedValue(error)
    const response = await GET(request({ table: 'user_books', record: 'record-key' }))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: '读取管理数据失败，请重试。' })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(writeAdminAuditLog).not.toHaveBeenCalled()
  })

  it('withholds loaded detail data when the access audit fails', async () => {
    writeAdminAuditLog.mockRejectedValue(new Error('private audit database details'))
    const response = await GET(request({ table: 'user_books', record: 'record-key' }))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: '读取管理数据失败，请重试。' })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})
