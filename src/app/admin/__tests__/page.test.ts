import { renderToStaticMarkup } from 'react-dom/server'
import AdminPage from '../page'
import AdminWorkbench from '../Workbench'

jest.mock('next/headers', () => ({ headers: jest.fn().mockResolvedValue(new Headers({ cookie: 'feynman_session=ordinary-session' })) }))
jest.mock('next/navigation', () => ({ notFound: jest.fn(() => { throw new Error('NEXT_NOT_FOUND') }) }))
jest.mock('@/lib/server/adminAuth', () => ({ requireAdminIdentity: jest.fn(), requireAdminSession: jest.fn() }))
jest.mock('@/lib/server/persistence', () => ({ getPersistence: jest.fn() }))
jest.mock('../Workbench', () => ({ __esModule: true, default: jest.fn(() => null) }))

const { requireAdminIdentity, requireAdminSession } = jest.requireMock('@/lib/server/adminAuth') as { requireAdminIdentity: jest.Mock; requireAdminSession: jest.Mock }
const { getPersistence } = jest.requireMock('@/lib/server/persistence') as { getPersistence: jest.Mock }
const { notFound } = jest.requireMock('next/navigation') as { notFound: jest.Mock }
const adminId = '00000000-0000-4000-8000-000000000001'

describe('server-rendered administrator page isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    requireAdminIdentity.mockResolvedValue({ ok: true, userId: adminId })
    requireAdminSession.mockResolvedValue({ ok: false, status: 403, error: '请先完成管理员二次认证。' })
    getPersistence.mockReturnValue({ writeAdminAuditLog: jest.fn() })
  })

  it.each([401, 403])('returns notFound for a non-administrator (%i) before reading data', async status => {
    requireAdminIdentity.mockResolvedValue({ ok: false, status, error: '无权访问' })
    await expect(AdminPage({ searchParams: Promise.resolve({ table: 'app_users' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
    expect(requireAdminSession).not.toHaveBeenCalled()
    expect(getPersistence).not.toHaveBeenCalled()
    expect(AdminWorkbench).not.toHaveBeenCalled()
  })

  it('shows only the MFA form to Wilson until second-factor verification', async () => {
    const page = await AdminPage({ searchParams: Promise.resolve({ view: 'tables', table: 'app_users' }) })
    const html = renderToStaticMarkup(page)
    expect(html).toContain('系统管理员认证')
    expect(html).toContain('action="/api/admin/session/"')
    expect(html).toContain('name="code"')
    expect(html).not.toContain('app_users')
    expect(getPersistence).not.toHaveBeenCalled()
    expect(AdminWorkbench).not.toHaveBeenCalled()
    expect(requireAdminIdentity.mock.calls[0][0].headers.get('cookie')).toBe('feynman_session=ordinary-session')
  })

  it('maps known MFA errors and never renders arbitrary query text', async () => {
    const known = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({ authError: 'invalid_code' }) }))
    expect(known).toContain('验证码无效，请使用认证器中的当前验证码。')
    const unknown = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({ authError: '<script>private-error</script>' }) }))
    expect(unknown).not.toContain('private-error')
    expect(unknown).not.toContain('<script>')
  })

  it('returns the workbench only after identity and MFA checks and records the view', async () => {
    requireAdminSession.mockResolvedValue({ ok: true, userId: adminId, session: { idHash: 'session-hash' } })
    const query = { view: 'tables', table: 'user_books', record: 'record-key' }
    const page = await AdminPage({ searchParams: Promise.resolve(query) })
    expect(page.type).toBe(AdminWorkbench)
    expect(page.props).toEqual({ query, adminUserId: adminId })
    expect(getPersistence.mock.results[0].value.writeAdminAuditLog).toHaveBeenCalledWith({
      adminUserId: adminId, action: 'admin_data_page_viewed', metadata: { table: 'user_books', view: 'tables', record: 'record-key' },
    })
    expect(notFound).not.toHaveBeenCalled()
  })
})
