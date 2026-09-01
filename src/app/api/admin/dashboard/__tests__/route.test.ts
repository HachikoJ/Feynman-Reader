import { GET } from '../route'

jest.mock('@/lib/server/sessionUser', () => ({ sessionUserId: jest.fn() }))
jest.mock('@/lib/server/persistence', () => ({ getPersistence: jest.fn(), isPersistenceUnavailable: () => false }))

const { sessionUserId } = jest.requireMock('@/lib/server/sessionUser') as { sessionUserId: jest.Mock }
const { getPersistence } = jest.requireMock('@/lib/server/persistence') as { getPersistence: jest.Mock }

describe('admin dashboard authorization', () => {
  beforeEach(() => {
    sessionUserId.mockReset()
    getPersistence.mockReset()
  })

  it('rejects requests without an ordinary account session', async () => {
    sessionUserId.mockResolvedValue(null)
    const response = await GET(new Request('https://reader.deline.top/api/admin/dashboard'))
    expect(response.status).toBe(401)
  })

  it('rejects ordinary users even when they request the dashboard', async () => {
    sessionUserId.mockResolvedValue('ordinary-user')
    getPersistence.mockReturnValue({
      findUserById: jest.fn().mockResolvedValue({ id: 'ordinary-user', displayName: 'Wilson' }),
      findAdminRole: jest.fn().mockResolvedValue(null),
      getAdminTotpCredential: jest.fn(),
      findAdminSession: jest.fn(),
    })
    const response = await GET(new Request('https://reader.deline.top/api/admin/dashboard', { headers: { cookie: 'feynman_session=ordinary' } }))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: '无权访问该页面。' })
  })
})
