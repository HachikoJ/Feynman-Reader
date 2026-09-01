const findByUsername = jest.fn()
const findPasswordHashByUsername = jest.fn()
const createSession = jest.fn()

jest.mock('@/lib/server/persistence', () => ({
  getPersistence: jest.fn(() => ({ findByUsername, findPasswordHashByUsername, createSession })),
  isPersistenceUnavailable: jest.fn(() => false),
}))

import { hashPassword } from '@/lib/server/auth'
import { POST } from '../route'

describe('password login transition', () => {
  const previous = process.env.FEYNMAN_WATCHA_OAUTH_ENABLED

  afterEach(() => {
    jest.clearAllMocks()
    if (previous === undefined) delete process.env.FEYNMAN_WATCHA_OAUTH_ENABLED
    else process.env.FEYNMAN_WATCHA_OAUTH_ENABLED = previous
  })

  it('rejects password login after Watcha becomes the only provider', async () => {
    process.env.FEYNMAN_WATCHA_OAUTH_ENABLED = 'true'
    const response = await POST(new Request('https://reader.deline.top/api/auth/password/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'reader', password: 'password123' }),
    }))
    expect(response.status).toBe(403)
    expect(findByUsername).not.toHaveBeenCalled()
  })

  it('keeps password login available while Watcha is disabled', async () => {
    process.env.FEYNMAN_WATCHA_OAUTH_ENABLED = 'false'
    findByUsername.mockResolvedValue({ id: 'user-1', username: 'reader' })
    findPasswordHashByUsername.mockResolvedValue(hashPassword('password123'))
    createSession.mockResolvedValue({ id: 'session', expiresAt: new Date(Date.now() + 60_000).toISOString() })
    const response = await POST(new Request('https://reader.deline.top/api/auth/password/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'reader', password: 'password123' }),
    }))
    expect(response.status).toBe(200)
  })
})
