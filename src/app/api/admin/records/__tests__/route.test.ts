import { POST } from '../route'

jest.mock('@/lib/server/adminAuth', () => ({
  ...jest.requireActual('@/lib/server/adminAuth'),
  requireAdminSession: jest.fn(),
}))
jest.mock('@/lib/server/adminMutations', () => ({
  AdminMutationError: class AdminMutationError extends Error {},
  mutateAdminRecord: jest.fn(), restoreAdminChange: jest.fn(),
}))
jest.mock('@/lib/server/persistence', () => ({ getPersistence: jest.fn() }))

const { requireAdminSession } = jest.requireMock('@/lib/server/adminAuth') as { requireAdminSession: jest.Mock }
const { mutateAdminRecord, restoreAdminChange } = jest.requireMock('@/lib/server/adminMutations') as { mutateAdminRecord: jest.Mock; restoreAdminChange: jest.Mock }
const { getPersistence } = jest.requireMock('@/lib/server/persistence') as { getPersistence: jest.Mock }
const adminId = '00000000-0000-4000-8000-000000000001'

function request(fields: Record<string, string> = {}, origin = 'https://reader.deline.top'): Request {
  return new Request('https://reader.deline.top/api/admin/records/', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ table: 'user_books', key: 'record-key', version: 'version-hash', action: 'edit', confirmation: '确认', patch: '{"data":{"name":"书籍"}}', ...fields }),
  })
}

describe('administrator record mutation boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    requireAdminSession.mockResolvedValue({ ok: true, userId: adminId, session: { idHash: 'session-hash' } })
    mutateAdminRecord.mockReset().mockResolvedValue({ changeId: 'change-1', restorable: true })
    restoreAdminChange.mockReset().mockResolvedValue(undefined)
    getPersistence.mockReturnValue({ revokeAdminSession: jest.fn(), writeAdminAuditLog: jest.fn() })
  })

  it('rejects cross-origin submissions before authentication or persistence', async () => {
    const response = await POST(request({}, 'https://example.com'))
    expect(response.status).toBe(403)
    expect(requireAdminSession).not.toHaveBeenCalled()
    expect(mutateAdminRecord).not.toHaveBeenCalled()
    expect(restoreAdminChange).not.toHaveBeenCalled()
  })

  it.each([401, 403])('denies unauthorized requests with status %i and no data writes', async status => {
    requireAdminSession.mockResolvedValue({ ok: false, status, error: 'private authorization detail' })
    const response = await POST(request())
    expect(response.status).toBe(status)
    expect(await response.text()).toBe('')
    expect(mutateAdminRecord).not.toHaveBeenCalled()
    expect(restoreAdminChange).not.toHaveBeenCalled()
    expect(getPersistence).not.toHaveBeenCalled()
  })

  it.each(['', 'yes'])('requires the explicit confirmation before any mutation (%s)', async confirmation => {
    const response = await POST(request({ confirmation }))
    expect(response.status).toBe(400)
    expect(await response.text()).toContain('请确认当前记录及本次操作。')
    expect(mutateAdminRecord).not.toHaveBeenCalled()
  })

  it('retains invalid JSON and record fields as escaped text for correction', async () => {
    const patch = '</textarea><script>alert("secret")</script>&broken-json'
    const response = await POST(request({ patch, key: '\"><img src=x onerror=alert(1)>' }))
    const html = await response.text()
    expect(response.status).toBe(400)
    expect(html).toContain('JSON 格式无效')
    expect(html).toContain('&lt;/textarea&gt;&lt;script&gt;alert(&quot;secret&quot;)&lt;/script&gt;&amp;broken-json')
    expect(html).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('name="version" value="version-hash"')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(mutateAdminRecord).not.toHaveBeenCalled()
  })

  it('passes the authenticated actor and explicit record version then redirects on success', async () => {
    const response = await POST(request())
    expect(mutateAdminRecord).toHaveBeenCalledWith(adminId, {
      table: 'user_books', key: 'record-key', version: 'version-hash', action: 'edit', patch: { data: { name: '书籍' } },
    })
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://reader.deline.top/admin/?view=changes&success=1')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('routes confirmed recovery through the authenticated actor', async () => {
    const response = await POST(request({ action: 'restore', changeId: 'change-1' }))
    expect(restoreAdminChange).toHaveBeenCalledWith(adminId, 'change-1')
    expect(mutateAdminRecord).not.toHaveBeenCalled()
    expect(response.status).toBe(303)
  })

  it.each([
    Object.assign(new Error('数据库约束失败：private-row-secret'), { code: '23505', detail: 'private row data' }),
    new Error('connection failed: private-server-credential'),
    new Error('数据库请求失败：private-server-credential'),
  ])('does not disclose persistence exception details', async error => {
    mutateAdminRecord.mockRejectedValue(error)
    const response = await POST(request())
    const html = await response.text()
    expect(response.status).toBe(400)
    expect(html).toContain('操作失败，数据未被修改。请稍后重试。')
    expect(html).not.toContain('private-')
    expect(html).toContain('尚未保存的修改')
  })

  it('shows and escapes only a typed application validation message', async () => {
    const { AdminMutationError } = jest.requireMock('@/lib/server/adminMutations') as { AdminMutationError: new (message: string) => Error }
    mutateAdminRecord.mockRejectedValue(new AdminMutationError('数据已变化，请刷新。<script>'))
    const response = await POST(request())
    const html = await response.text()
    expect(response.status).toBe(400)
    expect(html).toContain('数据已变化，请刷新。&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('rejects unsupported actions before writing', async () => {
    const response = await POST(request({ action: 'grant-super-admin' }))
    expect(response.status).toBe(400)
    expect(mutateAdminRecord).not.toHaveBeenCalled()
    expect(restoreAdminChange).not.toHaveBeenCalled()
  })

  it('revokes only the authenticated MFA session and clears both cookie paths on logout', async () => {
    const response = await POST(request({ action: 'logout', confirmation: '' }))
    const store = getPersistence.mock.results[0].value
    expect(store.revokeAdminSession).toHaveBeenCalledWith('session-hash')
    expect(store.writeAdminAuditLog).toHaveBeenCalledWith({ adminUserId: adminId, action: 'admin_session_revoked' })
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://reader.deline.top/account/')
    expect(response.headers.get('set-cookie')).toContain('Path=/;')
    expect(response.headers.get('set-cookie')).toContain('Path=/api/admin;')
    expect(mutateAdminRecord).not.toHaveBeenCalled()
  })
})
