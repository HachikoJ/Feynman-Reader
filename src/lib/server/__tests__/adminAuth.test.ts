import { adminIdentityMatches, adminSessionHashMatches, createAdminSessionToken, hasSameAdminOrigin } from '../adminAuth'

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
    const role = { userId: 'user-1', tokendanceSubject: 'watcha-1' as string }
    expect(adminIdentityMatches(role, { id: 'user-1', tokendanceSubject: 'watcha-1' })).toBe(true)
    expect(adminIdentityMatches(role, { id: 'user-2', tokendanceSubject: 'watcha-1' })).toBe(false)
    expect(adminIdentityMatches(role, { id: 'user-1', tokendanceSubject: 'watcha-2' })).toBe(false)
    expect(adminIdentityMatches(role, { id: 'user-1', tokendanceSubject: undefined })).toBe(false)
  })
})
