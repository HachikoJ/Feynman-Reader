import { adminIdentityMatches, adminSessionHashMatches, createAdminSessionToken, hasSameAdminOrigin, requireAdminIdentity, requireAdminSession } from '../adminAuth'

jest.mock('../sessionUser', () => ({ sessionUserId: jest.fn() }))
jest.mock('../persistence', () => ({ getPersistence: jest.fn() }))

const { sessionUserId } = jest.requireMock('../sessionUser') as { sessionUserId: jest.Mock }
const { getPersistence } = jest.requireMock('../persistence') as { getPersistence: jest.Mock }
const adminId = '00000000-0000-4000-8000-000000000001'
const subject = 'fixture-watcha-admin'
const originalAdminUserId = process.env.FEYNMAN_ADMIN_USER_ID
const originalAdminSubject = process.env.FEYNMAN_ADMIN_PROVIDER_SUBJECT

beforeEach(() => {
  process.env.FEYNMAN_ADMIN_USER_ID = adminId
  process.env.FEYNMAN_ADMIN_PROVIDER_SUBJECT = subject
})
afterAll(() => {
  if (originalAdminUserId === undefined) delete process.env.FEYNMAN_ADMIN_USER_ID
  else process.env.FEYNMAN_ADMIN_USER_ID = originalAdminUserId
  if (originalAdminSubject === undefined) delete process.env.FEYNMAN_ADMIN_PROVIDER_SUBJECT
  else process.env.FEYNMAN_ADMIN_PROVIDER_SUBJECT = originalAdminSubject
})

describe('administrator session transport', () => {
  it('stores only a hash and compares it in constant-time compatible form', () => {
    const issued = createAdminSessionToken(1_700_000_000_000)
    expect(issued.token).not.toBe(issued.tokenHash)
    expect(adminSessionHashMatches(issued.token, issued.tokenHash)).toBe(true)
    expect(adminSessionHashMatches('wrong', issued.tokenHash)).toBe(false)
  })

  it('requires a same-origin header for administrator writes', () => {
    const request = new Request('https://reader.deline.top/api/admin/session', { headers: { origin: 'https://reader.deline.top' } })
    const crossOrigin = new Request('https://reader.deline.top/api/admin/session', { headers: { origin: 'https://example.com' } })
    expect(hasSameAdminOrigin(request, 'https://reader.deline.top')).toBe(true)
    expect(hasSameAdminOrigin(crossOrigin, 'https://reader.deline.top')).toBe(false)
  })

  it('fails closed in production when the canonical origin is missing', () => {
    const previous = process.env.NODE_ENV
    Object.assign(process.env, { NODE_ENV: 'production' })
    try {
      const request = new Request('https://reader.deline.top/api/admin/session', { headers: { origin: 'https://reader.deline.top' } })
      expect(hasSameAdminOrigin(request, '')).toBe(false)
    } finally {
      Object.assign(process.env, { NODE_ENV: previous || 'test' })
    }
  })

  it('binds administrator access to the provider subject, not a display name', () => {
    const role = { userId: adminId, tokendanceSubject: subject }
    expect(adminIdentityMatches(role, { id: adminId, tokendanceSubject: subject })).toBe(true)
    expect(adminIdentityMatches(role, { id: 'user-2', tokendanceSubject: subject })).toBe(false)
    expect(adminIdentityMatches(role, { id: adminId, tokendanceSubject: 'watcha-2' })).toBe(false)
    expect(adminIdentityMatches(role, { id: adminId, tokendanceSubject: undefined })).toBe(false)
    expect(adminIdentityMatches({ userId: 'other', tokendanceSubject: 'other' }, { id: 'other', tokendanceSubject: 'other' })).toBe(false)
  })
})

describe('administrator identity and MFA isolation', () => {
  const request = new Request('https://reader.deline.top/admin/')
  let store: Record<string, jest.Mock>

  beforeEach(() => {
    sessionUserId.mockResolvedValue(adminId)
    store = {
      findUserById: jest.fn().mockResolvedValue({ id: adminId, tokendanceSubject: subject }),
      findAdminRole: jest.fn().mockResolvedValue({ userId: adminId, tokendanceSubject: subject, role: 'super_admin', revokedAt: null }),
      getAdminTotpCredential: jest.fn().mockResolvedValue({ enabled: true }),
      findAdminSession: jest.fn(),
    }
    getPersistence.mockReturnValue(store)
  })

  it('permits only the bound identity to reach the MFA entry without granting a session', async () => {
    expect(await requireAdminIdentity(request)).toEqual({ ok: true, userId: adminId })
    expect(await requireAdminSession(request)).toMatchObject({ ok: false, status: 403 })
    expect(store.findAdminSession).not.toHaveBeenCalled()
  })

  it('rejects another account even if given a matching administrator role', async () => {
    sessionUserId.mockResolvedValue('other')
    store.findUserById.mockResolvedValue({ id: 'other', tokendanceSubject: 'other', displayName: 'Wilson' })
    store.findAdminRole.mockResolvedValue({ userId: 'other', tokendanceSubject: 'other', role: 'super_admin' })
    expect(await requireAdminIdentity(request)).toMatchObject({ ok: false, status: 403 })
    expect(store.getAdminTotpCredential).not.toHaveBeenCalled()
  })

  it.each([
    [undefined, undefined],
    [adminId, undefined],
    [undefined, subject],
    [' ', subject],
    [adminId, ' '],
  ])('denies identity and MFA when either server binding is absent (%s, %s)', async (configuredId, configuredSubject) => {
    if (configuredId === undefined) delete process.env.FEYNMAN_ADMIN_USER_ID
    else process.env.FEYNMAN_ADMIN_USER_ID = configuredId
    if (configuredSubject === undefined) delete process.env.FEYNMAN_ADMIN_PROVIDER_SUBJECT
    else process.env.FEYNMAN_ADMIN_PROVIDER_SUBJECT = configuredSubject
    expect(adminIdentityMatches({ userId: adminId, tokendanceSubject: subject }, { id: adminId, tokendanceSubject: subject })).toBe(false)
    expect(await requireAdminIdentity(request)).toMatchObject({ ok: false, status: 403 })
    expect(await requireAdminSession(request)).toMatchObject({ ok: false, status: 403 })
    expect(store.getAdminTotpCredential).not.toHaveBeenCalled()
    expect(store.findAdminSession).not.toHaveBeenCalled()
  })

  it('rejects revoked roles and a missing ordinary login independently of MFA', async () => {
    store.findAdminRole.mockResolvedValue({ userId: adminId, tokendanceSubject: subject, role: 'super_admin', revokedAt: new Date().toISOString() })
    expect(await requireAdminIdentity(request)).toMatchObject({ ok: false, status: 403 })
    sessionUserId.mockResolvedValue(null)
    expect(await requireAdminSession(request)).toMatchObject({ ok: false, status: 401 })
  })

  it('rejects expired and cross-account MFA sessions', async () => {
    const authenticated = new Request(request.url, { headers: { cookie: 'feynman_admin_session=opaque' } })
    store.findAdminSession.mockResolvedValue({ userId: 'other', expiresAt: new Date(Date.now() + 60_000).toISOString() })
    expect(await requireAdminSession(authenticated)).toMatchObject({ ok: false, status: 403 })
    store.findAdminSession.mockResolvedValue({ userId: adminId, expiresAt: new Date(Date.now() - 60_000).toISOString() })
    expect(await requireAdminSession(authenticated)).toMatchObject({ ok: false, status: 403 })
    store.findAdminSession.mockResolvedValue({ userId: adminId, expiresAt: 'invalid' })
    expect(await requireAdminSession(authenticated)).toMatchObject({ ok: false, status: 403 })
    store.findAdminSession.mockResolvedValue({ userId: adminId, expiresAt: new Date(Date.now() + 60_000).toISOString() })
    expect(await requireAdminSession(authenticated)).toMatchObject({ ok: true, userId: adminId })
  })
})
