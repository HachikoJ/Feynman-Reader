const saveAIUsageRecord = jest.fn()

jest.mock('@/lib/server/sessionUser', () => ({ sessionUserId: jest.fn(async () => 'session-owner') }))
jest.mock('@/lib/server/persistence', () => ({
  getPersistence: jest.fn(() => ({ saveAIUsageRecord })),
  isPersistenceUnavailable: jest.fn(() => false),
}))

import { POST } from '../route'
import { sessionUserId } from '@/lib/server/sessionUser'

const record = { id: 'usage-1', bookId: 'book-1', task: 'analysis', model: 'test', promptTokens: 1, completionTokens: 2, totalTokens: 3, createdAt: 5 }
const request = (payload: unknown) => new Request('https://reader.example.test/api/account/ai-usage/', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
})

describe('append-only AI usage endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    saveAIUsageRecord.mockResolvedValue(undefined)
    jest.mocked(sessionUserId).mockResolvedValue('session-owner')
  })

  it('writes only the validated usage record for the authenticated account', async () => {
    const response = await POST(request({ record: { ...record, userId: 'other-account', secret: 'ignored' }, books: [{ name: 'Stale snapshot' }], settings: { profile: 'stale' } }))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ ok: true })
    expect(saveAIUsageRecord).toHaveBeenCalledTimes(1)
    expect(saveAIUsageRecord).toHaveBeenCalledWith('session-owner', record)
  })

  it('requires a signed-in account before saving', async () => {
    jest.mocked(sessionUserId).mockResolvedValueOnce(null)
    expect((await POST(request({ record }))).status).toBe(401)
    expect(saveAIUsageRecord).not.toHaveBeenCalled()
  })

  it.each([{}, { record: { ...record, promptTokens: -1 } }, { record: { ...record, totalTokens: 2_147_483_648 } }, { record: { ...record, task: '' } }])('rejects invalid input without saving: %o', async payload => {
    expect((await POST(request(payload))).status).toBe(400)
    expect(saveAIUsageRecord).not.toHaveBeenCalled()
  })

  it('rejects malformed and oversized JSON bodies', async () => {
    expect((await POST(new Request('https://reader.example.test/api/account/ai-usage/', { method: 'POST', body: '{' }))).status).toBe(400)
    expect((await POST(request({ record, extra: 'x'.repeat(16 * 1024) }))).status).toBe(413)
    expect(saveAIUsageRecord).not.toHaveBeenCalled()
  })

  it('reports persistence failures without exposing database details', async () => {
    saveAIUsageRecord.mockRejectedValueOnce(new Error('private database connection details'))
    const response = await POST(request({ record }))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: '保存 AI 用量记录失败，请重试。' })
  })
})
