import { DELETE, POST } from '../route'

jest.mock('@/lib/server/sessionUser', () => ({ sessionUserId: jest.fn() }))
jest.mock('@/lib/server/persistence', () => ({ getPersistence: jest.fn(), isPersistenceUnavailable: () => false }))
jest.mock('@/lib/server/apiKeyVault', () => ({ decryptApiKey: jest.fn().mockReturnValue('test-secret') }))
jest.mock('@/lib/server/adminTotp', () => ({ verifyTotpCode: jest.fn() }))

const { sessionUserId } = jest.requireMock('@/lib/server/sessionUser') as { sessionUserId: jest.Mock }
const { getPersistence } = jest.requireMock('@/lib/server/persistence') as { getPersistence: jest.Mock }
const { verifyTotpCode } = jest.requireMock('@/lib/server/adminTotp') as { verifyTotpCode: jest.Mock }
const adminId = '00000000-0000-4000-8000-000000000001'
const subject = 'fixture-watcha-admin'
const originalAdminUserId = process.env.FEYNMAN_ADMIN_USER_ID
const originalAdminSubject = process.env.FEYNMAN_ADMIN_PROVIDER_SUBJECT

afterAll(() => {
  if (originalAdminUserId === undefined) delete process.env.FEYNMAN_ADMIN_USER_ID
  else process.env.FEYNMAN_ADMIN_USER_ID = originalAdminUserId
  if (originalAdminSubject === undefined) delete process.env.FEYNMAN_ADMIN_PROVIDER_SUBJECT
  else process.env.FEYNMAN_ADMIN_PROVIDER_SUBJECT = originalAdminSubject
})

function request(body = 'code=123456', form = true, origin = 'https://reader.deline.top'): Request {
  return new Request('https://reader.deline.top/api/admin/session/', {
    method: 'POST',
    headers: { origin, 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json' },
    body,
  })
}

describe('administrator MFA submission', () => {
  let store: Record<string, jest.Mock>
  beforeEach(() => {
    process.env.FEYNMAN_ADMIN_USER_ID = adminId
    process.env.FEYNMAN_ADMIN_PROVIDER_SUBJECT = subject
    sessionUserId.mockResolvedValue(adminId)
    verifyTotpCode.mockReturnValue(true)
    store = {
      findUserById: jest.fn().mockResolvedValue({ id: adminId, tokendanceSubject: subject }),
      findAdminRole: jest.fn().mockResolvedValue({ userId: adminId, tokendanceSubject: subject, role: 'super_admin' }),
      getAdminTotpCredential: jest.fn().mockResolvedValue({ enabled: true, secret: 'encrypted', failedAttempts: 0 }),
      createAdminSession: jest.fn(),
      recordAdminTotpFailure: jest.fn(),
      writeAdminAuditLog: jest.fn(),
      revokeAdminSession: jest.fn(),
    }
    getPersistence.mockReturnValue(store)
  })

  it('accepts an HTML form and migrates the cookie to the server-rendered page path', async () => {
    const response = await POST(request())
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/admin/')
    const cookie = response.headers.get('set-cookie') || ''
    expect(cookie).toContain('Path=/api/admin;')
    expect(cookie).toContain('Max-Age=0')
    expect(cookie).toContain('Path=/;')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(store.createAdminSession).toHaveBeenCalledWith(expect.objectContaining({ userId: adminId }))
  })

  it('keeps JSON clients compatible', async () => {
    const response = await POST(request(JSON.stringify({ code: '123456' }), false))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true })
  })

  it('redirects invalid codes without disclosing submitted credentials', async () => {
    verifyTotpCode.mockReturnValue(false)
    const response = await POST(request())
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/admin/?authError=invalid_code')
    expect(store.recordAdminTotpFailure).toHaveBeenCalledWith(adminId, null)
    expect(store.createAdminSession).not.toHaveBeenCalled()
  })

  it('rejects a forged administrator role belonging to another identity before checking MFA', async () => {
    sessionUserId.mockResolvedValue('other')
    store.findUserById.mockResolvedValue({ id: 'other', tokendanceSubject: 'other' })
    store.findAdminRole.mockResolvedValue({ userId: 'other', tokendanceSubject: 'other', role: 'super_admin' })
    const response = await POST(request(JSON.stringify({ code: '123456' }), false))
    expect(response.status).toBe(403)
    expect(store.getAdminTotpCredential).not.toHaveBeenCalled()
    expect(store.createAdminSession).not.toHaveBeenCalled()
  })

  it('preserves origin and lockout protections for HTML submissions', async () => {
    const crossOrigin = await POST(request('code=123456', true, 'https://example.com'))
    expect(crossOrigin.headers.get('location')).toBe('/admin/?authError=origin')
    store.getAdminTotpCredential.mockResolvedValue({ enabled: true, lockedUntil: new Date(Date.now() + 60_000).toISOString() })
    const locked = await POST(request())
    expect(locked.headers.get('location')).toBe('/admin/?authError=locked')
    expect(store.createAdminSession).not.toHaveBeenCalled()
  })

  it('clears both cookie paths when ending the administrator session', async () => {
    const response = await DELETE(new Request('https://reader.deline.top/api/admin/session/', {
      method: 'DELETE', headers: { origin: 'https://reader.deline.top', cookie: 'feynman_admin_session=opaque' },
    }))
    expect(response.status).toBe(204)
    const cookie = response.headers.get('set-cookie') || ''
    expect(cookie).toContain('Path=/api/admin;')
    expect(cookie).toContain('Path=/;')
    expect(store.revokeAdminSession).toHaveBeenCalled()
  })
})
