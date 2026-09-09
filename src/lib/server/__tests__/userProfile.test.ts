import { Pool } from 'pg'
import { PostgresPersistenceAdapter } from '../postgresPersistence'

jest.mock('pg', () => ({ Pool: jest.fn() }))

describe('Watcha account avatar persistence', () => {
  const query = jest.fn()
  let store: PostgresPersistenceAdapter

  beforeEach(() => {
    jest.clearAllMocks()
    query.mockResolvedValue({ rows: [], rowCount: 1 })
    ;(Pool as unknown as jest.Mock).mockImplementation(() => ({ query }))
    store = new PostgresPersistenceAdapter('postgres://localhost/test')
  })

  it.each([undefined, null, ''])('preserves a prior Watcha avatar when a login omits it (%s)', async avatarUrl => {
    await store.syncWatchaProfile('user-1', { nickname: 'Reader', avatarUrl })
    const write = query.mock.calls.find(([sql]) => sql.includes("jsonb_build_object('profile'"))!
    expect(write[1][0]).toBe('user-1')
    expect(JSON.parse(write[1][1])).toEqual({ watchaNickname: 'Reader' })
    expect(write[0]).toContain("coalesce(public.user_settings.data->'profile', '{}'::jsonb) || $2::jsonb")
  })

  it('updates the provider avatar while retaining custom avatar precedence', async () => {
    const avatarUrl = 'https://example.test/watcha.png'
    await store.syncWatchaProfile('user-1', { avatarUrl })
    const profileWrite = query.mock.calls.find(([sql]) => sql.includes("jsonb_build_object('profile'"))!
    expect(JSON.parse(profileWrite[1][1])).toEqual({ watchaAvatarUrl: avatarUrl })
    const userWrite = query.mock.calls.find(([sql]) => sql.includes('update public.app_users'))!
    expect(userWrite[0]).toContain("customAvatarUrl'")
    expect(userWrite[0]).toContain('$3, avatar_url')
    expect(userWrite[1]).toEqual(['user-1', '', avatarUrl])
  })

  it('returns the saved Watcha image to authenticated clients without a custom image', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: 'user-1', tokendance_subject: 'watcha-1', avatar_url: null,
      profile_data: { watchaAvatarUrl: 'https://example.test/watcha.png' },
      created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-09T00:00:00Z',
    }] })
    expect(await store.findUserById('user-1')).toMatchObject({
      id: 'user-1', avatarUrl: 'https://example.test/watcha.png', tokendanceSubject: 'watcha-1',
    })
  })

  it('keeps a chosen custom image ahead of the saved Watcha image', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: 'user-1', tokendance_subject: 'watcha-1', avatar_url: 'https://example.test/custom.png',
      profile_data: { watchaAvatarUrl: 'https://example.test/watcha.png', customAvatarUrl: 'https://example.test/custom.png' },
      created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-09T00:00:00Z',
    }] })
    expect(await store.findUserById('user-1')).toMatchObject({ avatarUrl: 'https://example.test/custom.png' })
  })
})
