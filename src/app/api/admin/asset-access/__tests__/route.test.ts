import { GET } from '../route'

jest.mock('@/lib/server/adminAuth', () => ({ requireAdminIdentity: jest.fn() }))
const { requireAdminIdentity } = jest.requireMock('@/lib/server/adminAuth') as { requireAdminIdentity: jest.Mock }

describe('administrator static resource authorization', () => {
  it.each([401, 403])('denies inaccessible identities (%i) without exposing response content', async status => {
    requireAdminIdentity.mockResolvedValue({ ok: false, status, error: 'private authorization data' })
    const response = await GET(new Request('https://reader.deline.top/api/admin/asset-access/'))
    expect(response.status).toBe(status)
    expect(await response.text()).toBe('')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('authorizes only a successful administrator identity result', async () => {
    requireAdminIdentity.mockResolvedValue({ ok: true, userId: 'administrator' })
    const response = await GET(new Request('https://reader.deline.top/api/admin/asset-access/'))
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
  })

  it('fails closed if the identity service throws', async () => {
    requireAdminIdentity.mockRejectedValue(new Error('private database details'))
    const response = await GET(new Request('https://reader.deline.top/api/admin/asset-access/'))
    expect(response.status).toBe(403)
    expect(await response.text()).toBe('')
  })
})
