const saveBook = jest.fn()

jest.mock('@/lib/server/sessionUser', () => ({ sessionUserId: jest.fn(async () => 'session-owner') }))
jest.mock('@/lib/server/persistence', () => ({
  getPersistence: jest.fn(() => ({ saveBook })),
  isPersistenceUnavailable: jest.fn(() => false),
}))

import { PUT } from '../route'
import { sessionUserId } from '@/lib/server/sessionUser'
import { BookWriteConflictError } from '@/lib/server/postgresPersistence'

const book = {
  id: 'book-1', name: '书籍元数据测试', status: 'reading', currentPhase: 1, bestScore: 0,
  responses: { background: '已有完整 AI 分析' }, noteRecords: [], practiceRecords: [], qaPracticeRecords: [],
  createdAt: 1, updatedAt: 2,
}
const request = (value: unknown) => new Request('https://reader.example.test/api/account/books/', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ book: value }),
})

describe('book save metadata contract', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    saveBook.mockResolvedValue(undefined)
    jest.mocked(sessionUserId).mockResolvedValue('session-owner')
  })

  it.each([true, false])('preserves explicit metadata clearing through validation (summary=%s)', async summaryOnly => {
    const response = await PUT(request({ ...book, ...(summaryOnly ? { _summaryOnly: true } : {}), author: '', cover: '', description: '', tags: [] }))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const [owner, saved] = saveBook.mock.calls[0]
    expect(owner).toBe('session-owner')
    expect(saved).toMatchObject({ author: '', cover: '', description: '', tags: [] })
    expect(saved.responses).toEqual(book.responses)
    if (summaryOnly) expect(saved._summaryOnly).toBe(true)
  })

  it('keeps omitted metadata absent instead of turning validation defaults into deletion', async () => {
    expect((await PUT(request(book))).status).toBe(200)
    const saved = saveBook.mock.calls[0][1]
    for (const field of ['author', 'cover', 'description', 'tags']) expect(saved).not.toHaveProperty(field)
    expect(saved.responses).toEqual(book.responses)
  })

  it('accepts a new cover while keeping the logged-in user as the only owner', async () => {
    const cover = 'data:image/png;base64,c3ludGhldGlj'
    expect((await PUT(request({ ...book, user_id: 'someone-else', cover }))).status).toBe(200)
    expect(saveBook).toHaveBeenCalledWith('session-owner', expect.objectContaining({ cover }))
    expect(saveBook.mock.calls[0][1]).not.toHaveProperty('user_id')
  })

  it('returns a conflict when the database rejects a stale or unavailable record', async () => {
    saveBook.mockRejectedValueOnce(new BookWriteConflictError())
    const response = await PUT(request(book))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: '书籍已更新或当前不可编辑，请重新读取后再保存。' })
  })

  it('rejects unauthenticated writes without reading the body or saving a book', async () => {
    jest.mocked(sessionUserId).mockResolvedValueOnce(null)
    expect((await PUT(request(book))).status).toBe(401)
    expect(saveBook).not.toHaveBeenCalled()
  })

  it('still rejects invalid metadata types', async () => {
    expect((await PUT(request({ ...book, cover: { url: 'invalid' } }))).status).toBe(400)
    expect(saveBook).not.toHaveBeenCalled()
  })
})
