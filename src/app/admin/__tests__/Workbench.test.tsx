import { renderToStaticMarkup } from 'react-dom/server'
import Workbench from '../Workbench'

jest.mock('@/lib/server/adminData', () => ({
  ...jest.requireActual('@/lib/server/adminData'),
  getAdminDataPage: jest.fn(), getAdminDataRecord: jest.fn(), getAdminUserProfiles: jest.fn(),
}))
jest.mock('@/lib/server/adminMutations', () => ({
  AdminMutationError: class extends Error {},
  getAdminMutationCapabilities: jest.fn(), getAdminEditableRecord: jest.fn(), getAdminMutationVersion: jest.fn(), listAdminChanges: jest.fn(),
}))
jest.mock('@/lib/server/persistence', () => ({ getPersistence: jest.fn() }))

const { JSDOM } = jest.requireActual('jsdom') as { JSDOM: new (html: string, options?: { url: string }) => { window: { document: Document; close(): void } } }
const { getAdminDataPage, getAdminDataRecord, getAdminUserProfiles } = jest.requireMock('@/lib/server/adminData') as Record<string, jest.Mock>
const { getAdminMutationCapabilities, getAdminEditableRecord, getAdminMutationVersion, listAdminChanges } = jest.requireMock('@/lib/server/adminMutations') as Record<string, jest.Mock>
const ids = Array.from({ length: 6 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`)
const adminId = ids[5]
const profiles: Record<string, { id: string; displayName: string | null; username: string | null; avatarUrl: string | null }> = {
  [ids[0]]: { id: ids[0], displayName: '同名读者', username: 'reader_one', avatarUrl: 'https://avatars.example.test/one.png' },
  [ids[1]]: { id: ids[1], displayName: '同名读者', username: 'reader_two', avatarUrl: null },
  [ids[2]]: { id: ids[2], displayName: null, username: null, avatarUrl: null },
  [ids[3]]: { id: ids[3], displayName: '很长的用户昵称'.repeat(20), username: null, avatarUrl: 'javascript:alert(1)' },
  [adminId]: { id: adminId, displayName: 'Wilson', username: null, avatarUrl: 'https://avatars.example.test/admin.png' },
}
const stamp = '2026-09-09T00:00:00Z'
const userRows = ids.slice(0, 5).map(id => ({ key: Buffer.from(JSON.stringify({ id })).toString('base64url'), fields: { id, display_name: profiles[id]?.displayName, username: profiles[id]?.username, created_at: stamp, login_disabled_at: null } }))
const bookRows = ids.slice(0, 5).map((id, i) => ({ key: `book-${i}`, fields: { user_id: id, book_id: `book-${i}`, name: '用户的书籍', status: 'reading' } }))

function linkedUserIds(element: ParentNode): string[] {
  return Array.from(element.querySelectorAll('a')).flatMap(anchor => {
    const url = new URL(anchor.href, 'https://reader.deline.top')
    if (url.searchParams.get('table') !== 'app_users' || !url.searchParams.get('record')) return []
    return [JSON.parse(Buffer.from(url.searchParams.get('record')!, 'base64url').toString('utf8')).id as string]
  })
}

describe('administrator user identity presentation', () => {
  let dom: InstanceType<typeof JSDOM> | undefined
  async function render(query: Record<string, string>): Promise<Document> {
    dom = new JSDOM(renderToStaticMarkup(await Workbench({ query, adminUserId: adminId })), { url: 'https://reader.deline.top' })
    return dom.window.document
  }
  beforeEach(() => {
    jest.clearAllMocks()
    getAdminUserProfiles.mockImplementation(async (requested: string[]) => Object.fromEntries(requested.filter(id => profiles[id.toLowerCase()]).map(id => [id.toLowerCase(), profiles[id.toLowerCase()]])))
    getAdminDataPage.mockImplementation(async ({ table }: { table: string }) => ({ table, rows: table === 'app_users' ? userRows : bookRows, total: 5, page: 1, pageSize: 25 }))
    getAdminDataRecord.mockResolvedValue(userRows[0])
    getAdminMutationCapabilities.mockImplementation(() => ({ editableFields: ['display_name'], actions: ['edit', 'disable', 'enable'] }))
    getAdminEditableRecord.mockResolvedValue({ version: 'record-version', fields: { display_name: '同名读者' } })
    getAdminMutationVersion.mockResolvedValue('record-version')
    listAdminChanges.mockResolvedValue({ rows: [{ id: 'change-one', table: 'user_books', action: 'edit', targetUserId: ids[1], createdAt: stamp, restorable: true, restoredAt: null }], total: 1, page: 1, pageSize: 25 })
  })
  afterEach(() => dom?.window.close())

  it('distinguishes duplicate nicknames by username and UUID-backed account links', async () => {
    const document = await render({ view: 'users' })
    const rows = Array.from(document.querySelectorAll('tbody tr'))
    expect(rows).toHaveLength(5)
    expect(rows[0].textContent).toContain('同名读者')
    expect(rows[0].textContent).toContain('@reader_one')
    expect(rows[1].textContent).toContain('同名读者')
    expect(rows[1].textContent).toContain('@reader_two')
    rows.forEach((row, i) => expect(linkedUserIds(row)).toEqual([ids[i], ids[i]]))
    expect(linkedUserIds(document.querySelector('aside')!)).toEqual([adminId])
    expect(document.querySelector('aside')!.textContent).toContain('Wilson')
  })

  it('keeps avatar fallbacks, missing names and unknown users visible without unsafe image URLs', async () => {
    const document = await render({ view: 'users' })
    const rows = Array.from(document.querySelectorAll('tbody tr'))
    expect(rows[0].querySelector('[style*="background-image"]')?.getAttribute('style')).toContain('https://avatars.example.test/one.png')
    expect(rows[1].querySelector('[role="img"]')?.textContent).toBe('同')
    expect(rows[1].querySelector('[style*="background-image"]')).toBeNull()
    expect(rows[2].textContent).toContain('未设置用户名')
    expect(rows[2].querySelector('[role="img"] svg')).not.toBeNull()
    expect(rows[3].textContent).toContain(profiles[ids[3]].displayName)
    expect(rows[3].innerHTML).not.toContain('javascript:')
    expect(rows[4].textContent).toContain('未知用户')
    expect(rows[4].textContent).toContain(ids[4])
  })

  it('renders book ownership and selected-user context using the actual user UUID', async () => {
    const document = await render({ view: 'tables', table: 'user_books', userId: ids[1] })
    const rows = Array.from(document.querySelectorAll('tbody tr'))
    rows.forEach((row, i) => expect(linkedUserIds(row)).toEqual([ids[i]]))
    expect(Array.from(document.querySelectorAll('th')).map(cell => cell.textContent)).toContain('所属用户')
    expect(getAdminUserProfiles).toHaveBeenCalledWith(expect.arrayContaining(ids.slice(0, 5)))
    expect(document.querySelector('input[name="userId"]')?.getAttribute('value')).toBe(ids[1])
  })

  it.each(['', 'edit'])('keeps the target identity and immutable record key on user details (%s)', async mode => {
    const document = await render({ view: 'users', table: 'app_users', record: userRows[0].key, ...(mode ? { mode } : {}) })
    expect(document.querySelector('h2')?.textContent).toBe('同名读者')
    expect(document.body.textContent).toContain('@reader_one')
    expect(linkedUserIds(document).filter(id => id === ids[0]).length).toBeGreaterThanOrEqual(2)
    const userSectionLinks = Array.from(document.querySelectorAll('a')).filter(anchor => new URL(anchor.href).searchParams.has('userId'))
    expect(userSectionLinks.length).toBeGreaterThan(0)
    userSectionLinks.forEach(anchor => expect(new URL(anchor.href).searchParams.get('userId')).toBe(ids[0]))
    if (mode === 'edit') {
      expect(document.querySelector('input[name="key"]')?.getAttribute('value')).toBe(userRows[0].key)
      expect(document.querySelector('input[name="version"]')?.getAttribute('value')).toBe('record-version')
      expect(document.querySelector('textarea')?.textContent).toContain('同名读者')
    }
  })

  it('renders both the acting administrator and target identity on audit rows', async () => {
    getAdminDataPage.mockResolvedValue({ table: 'admin_audit_logs', rows: [{ key: 'event-one', fields: { event_id: 'event-one', admin_user_id: adminId, target_user_id: ids[1], action: 'data.edit', occurred_at: stamp } }], total: 1, page: 1, pageSize: 25 })
    const document = await render({ view: 'logs' })
    const row = document.querySelector('tbody tr')!
    expect(row.textContent).toContain('Wilson')
    expect(row.textContent).toContain('@reader_two')
    expect(linkedUserIds(row)).toEqual([adminId, ids[1]])
    expect(getAdminUserProfiles).toHaveBeenCalledWith(expect.arrayContaining([adminId, ids[1]]))
  })

  it('shows the target account and a separate administrator identity in recovery history', async () => {
    const document = await render({ view: 'changes' })
    const row = document.querySelector('tbody tr')!
    expect(linkedUserIds(row)).toEqual([ids[1]])
    expect(row.textContent).toContain('@reader_two')
    expect(linkedUserIds(document.querySelector('aside')!)).toEqual([adminId])
  })
})
