const exportUserData = jest.fn()

jest.mock('@/lib/server/sessionUser', () => ({
  sessionUserId: jest.fn(async () => 'session-owner')
}))
jest.mock('@/lib/server/persistence', () => ({
  getPersistence: jest.fn(() => ({ exportUserData })),
  isPersistenceUnavailable: jest.fn(() => false)
}))
jest.mock('@/lib/backupValidation', () => ({
  normalizeImportData: jest.fn()
}))

import { POST } from '../route'
import { normalizeImportData } from '@/lib/backupValidation'
import { getPersistence } from '@/lib/server/persistence'
import { sessionUserId } from '@/lib/server/sessionUser'

const book = {
  id: 'book-1',
  name: '测试书籍',
  author: '测试作者',
  description: '测试简介',
  status: 'reading',
  currentPhase: 1,
  noteRecords: [{
    id: 'note-1',
    type: 'note',
    content: '这是一条关于创伤记忆的读书笔记',
    createdAt: 3
  }],
  responses: {
    background: '背景阶段内容',
    'legacy-unknown': '旧版未知阶段内容'
  },
  practiceRecords: [],
  qaPracticeRecords: [],
  bestScore: 0,
  createdAt: 1,
  updatedAt: 4
}

const request = (body: unknown) => new Request('https://reader.example.test/api/account/context/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
})

describe('assistant account context sources', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(sessionUserId).mockResolvedValue('session-owner')
    jest.mocked(getPersistence).mockReturnValue({ exportUserData } as never)
    exportUserData.mockResolvedValue({
      settings: { quotes: [] },
      assistantSessions: []
    })
    jest.mocked(normalizeImportData).mockReturnValue({
      valid: true,
      data: {
        version: 5,
        exportDate: 1,
        settings: { quotes: [] },
        books: [book],
        aiUsageRecords: [],
        bookLists: [],
        bookRelations: [],
        assistantSessions: [],
        assistantMemories: []
      }
    } as never)
  })

  it('rejects unauthenticated requests', async () => {
    jest.mocked(sessionUserId).mockResolvedValueOnce(null)

    const response = await POST(request({ query: '创伤记忆' }))

    expect(response.status).toBe(401)
    expect(exportUserData).not.toHaveBeenCalled()
  })

  it('rejects an invalid query before reading account data', async () => {
    const response = await POST(request({ query: '   ' }))

    expect(response.status).toBe(400)
    expect(exportUserData).not.toHaveBeenCalled()
  })

  it('returns matched learning records as safe clickable sources', async () => {
    const response = await POST(request({ query: '创伤记忆', bookId: 'book-1' }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(payload.context).toContain('这是一条关于创伤记忆的读书笔记')
    expect(payload.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'note',
        bookId: 'book-1',
        recordId: 'note-1',
        title: '测试书籍 · 读书笔记'
      }),
      expect.objectContaining({
        kind: 'book',
        bookId: 'book-1',
        title: '测试书籍'
      })
    ]))
  })

  it('does not use recent books when no book is explicitly referenced', async () => {
    const response = await POST(request({ query: 'unmatched-zebra' }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ context: '', sources: [] })
  })

  it('returns no context for an unknown explicit book', async () => {
    const response = await POST(request({ query: '创伤记忆', bookId: 'missing-book' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ context: '', sources: [] })
  })

  it('does not mix global quotes or prior sessions into a referenced book', async () => {
    exportUserData.mockResolvedValueOnce({
      settings: { quotes: [{ text: '不应发送的金句', author: '测试' }] },
      assistantSessions: [{
        title: '旧会话',
        data: { messages: [{ content: '不应发送的历史会话' }] }
      }]
    })

    const response = await POST(request({ query: '不应发送', bookId: 'book-1' }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.context).not.toContain('不应发送的金句')
    expect(payload.context).not.toContain('不应发送的历史会话')
  })

  it.each([
    ['persistence without export support', () => {
      jest.mocked(getPersistence).mockReturnValue({} as never)
    }],
    ['invalid exported data', () => {
      jest.mocked(normalizeImportData).mockReturnValue({ valid: false, error: 'invalid' } as never)
    }]
  ])('returns an empty source contract for %s', async (_name, setup) => {
    setup()

    const response = await POST(request({ query: '任何问题' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ context: '', sources: [] })
  })
})
