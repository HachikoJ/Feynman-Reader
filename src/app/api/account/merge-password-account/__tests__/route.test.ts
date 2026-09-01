const findUserById = jest.fn()
const findByUsername = jest.fn()
const findPasswordHashByUsername = jest.fn()
const mergePasswordAccountIntoWatchaAccount = jest.fn()

jest.mock('@/lib/server/sessionUser', () => ({ sessionUserId: jest.fn(async () => 'watcha-user') }))
jest.mock('@/lib/server/persistence', () => ({
  getPersistence: jest.fn(() => ({
    findUserById,
    findByUsername,
    findPasswordHashByUsername,
    mergePasswordAccountIntoWatchaAccount,
  })),
  isPersistenceUnavailable: jest.fn(() => false),
}))

import { hashPassword } from '@/lib/server/auth'
import { POST } from '../route'

describe('password account migration endpoint', () => {
  beforeEach(() => {
    process.env.FEYNMAN_WATCHA_OAUTH_ENABLED = 'true'
    findUserById.mockResolvedValue({ id: 'watcha-user', tokendanceSubject: 'watcha-1' })
    findByUsername.mockResolvedValue({ id: 'password-user', username: 'reader', hasPassword: true })
    findPasswordHashByUsername.mockResolvedValue(hashPassword('password123'))
    mergePasswordAccountIntoWatchaAccount.mockResolvedValue({ books: 1 })
  })

  afterEach(() => jest.clearAllMocks())

  it('rejects an incorrect old password without merging data', async () => {
    const response = await POST(new Request('https://reader.deline.top/api/account/merge-password-account', {
      method: 'POST',
      body: JSON.stringify({ username: 'reader', password: 'wrong-pass', confirm: true }),
    }))
    expect(response.status).toBe(401)
    expect(mergePasswordAccountIntoWatchaAccount).not.toHaveBeenCalled()
  })

  it('merges a verified password account into the current Watcha account', async () => {
    const response = await POST(new Request('https://reader.deline.top/api/account/merge-password-account', {
      method: 'POST',
      body: JSON.stringify({ username: 'reader', password: 'password123', confirm: true }),
    }))
    expect(response.status).toBe(200)
    expect(mergePasswordAccountIntoWatchaAccount).toHaveBeenCalledWith('password-user', 'watcha-user')
  })

  it('rejects a password session pretending to be a Watcha account', async () => {
    findUserById.mockResolvedValueOnce({ id: 'password-user', username: 'reader', hasPassword: true })
    const response = await POST(new Request('https://reader.deline.top/api/account/merge-password-account', {
      method: 'POST',
      body: JSON.stringify({ username: 'reader', password: 'password123', confirm: true }),
    }))
    expect(response.status).toBe(403)
    expect(mergePasswordAccountIntoWatchaAccount).not.toHaveBeenCalled()
  })
})
