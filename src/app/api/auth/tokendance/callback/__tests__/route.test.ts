const findByTokendanceSubject = jest.fn()
const updateUser = jest.fn()
const syncWatchaProfile = jest.fn()
const createSession = jest.fn()
const callback = 'https://reader.deline.top/api/auth/tokendance/callback'

jest.mock('@/lib/server/persistence', () => ({
  getPersistence: jest.fn(() => ({ findByTokendanceSubject, updateUser, syncWatchaProfile, createSession })),
  isPersistenceUnavailable: jest.fn(() => false),
}))
jest.mock('@/lib/server/auth', () => ({
  ...jest.requireActual('@/lib/server/auth'),
  readOAuthState: jest.fn(() => ({ nonce: 'test-nonce', callback, returnTo: '/' })),
}))

import { GET } from '../route'

describe('Watcha login avatar synchronization', () => {
  const previous = {
    enabled: process.env.FEYNMAN_WATCHA_OAUTH_ENABLED,
    clientId: process.env.TOKENDANCE_OAUTH_CLIENT_ID,
    clientSecret: process.env.TOKENDANCE_OAUTH_CLIENT_SECRET,
    callback: process.env.TOKENDANCE_OAUTH_REDIRECT_URI,
  }

  beforeEach(() => {
    process.env.FEYNMAN_WATCHA_OAUTH_ENABLED = 'true'
    process.env.TOKENDANCE_OAUTH_CLIENT_ID = 'test-client'
    process.env.TOKENDANCE_OAUTH_CLIENT_SECRET = 'test-secret'
    process.env.TOKENDANCE_OAUTH_REDIRECT_URI = callback
    findByTokendanceSubject.mockResolvedValue({ id: 'user-1' })
    updateUser.mockResolvedValue({ id: 'user-1' })
    syncWatchaProfile.mockResolvedValue(undefined)
    createSession.mockResolvedValue({ id: 'session', expiresAt: new Date(Date.now() + 60_000).toISOString() })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
    for (const [name, value] of Object.entries({
      FEYNMAN_WATCHA_OAUTH_ENABLED: previous.enabled,
      TOKENDANCE_OAUTH_CLIENT_ID: previous.clientId,
      TOKENDANCE_OAUTH_CLIENT_SECRET: previous.clientSecret,
      TOKENDANCE_OAUTH_REDIRECT_URI: previous.callback,
    })) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  async function login(profile: Record<string, unknown>) {
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'test-token' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { user_id: 'watcha-1', nickname: 'Reader', ...profile } })))
    return GET(new Request(`${callback}?code=test-code&state=test-state`, {
      headers: { cookie: 'feynman_watcha_pkce=test-nonce.test-verifier' },
    }))
  }

  it('redirects a cancelled login to a readable login page', async () => {
    const response = await GET(new Request(`${callback}?error=access_denied&state=test-state`, {
      headers: { cookie: 'feynman_watcha_pkce=test-nonce.test-verifier' },
    }))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://reader.deline.top/login?returnTo=%2F&auth=cancelled')
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('does not expose JSON when the provider omits OAuth state on cancellation', async () => {
    const response = await GET(new Request(`${callback}?error=access_denied`))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://reader.deline.top/login?auth=cancelled')
  })

  it.each(['avatar_url', 'avatarUrl', 'avatar'])('synchronizes the provided %s image before creating the login session', async field => {
    const response = await login({ [field]: 'https://example.test/watcha-user.png' })
    expect(response.status).toBe(307)
    expect(syncWatchaProfile).toHaveBeenCalledWith('user-1', { nickname: 'Reader', avatarUrl: 'https://example.test/watcha-user.png' })
    expect(syncWatchaProfile.mock.invocationCallOrder[0]).toBeLessThan(createSession.mock.invocationCallOrder[0])
    expect(updateUser).toHaveBeenCalledWith('user-1', { tokendanceSubject: 'watcha-1' })
  })

  it('allows login without replacing an absent provider image with a placeholder asset', async () => {
    const response = await login({})
    expect(response.status).toBe(307)
    expect(syncWatchaProfile).toHaveBeenCalledWith('user-1', { nickname: 'Reader', avatarUrl: null })
    expect(updateUser).toHaveBeenCalledWith('user-1', { tokendanceSubject: 'watcha-1' })
  })
})
