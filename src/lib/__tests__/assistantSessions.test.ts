/** @jest-environment node */

jest.mock('../db', () => ({
  initDB: jest.fn().mockResolvedValue(undefined),
  indexedDB: {
    get: jest.fn(),
    put: jest.fn().mockResolvedValue(true)
  }
}))

import { initDB, indexedDB } from '../db'
import {
  appendAssistantMessage,
  clearAssistantSessions,
  compactAssistantHistory,
  createAssistantSession,
  deleteAssistantSession,
  getAssistantSessions,
  updateAssistantSession,
  type AssistantMessage
} from '../assistantSessions'

const mockGet = indexedDB.get as jest.MockedFunction<typeof indexedDB.get>
const mockPut = indexedDB.put as jest.MockedFunction<typeof indexedDB.put>

describe('assistant session persistence', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    mockGet.mockResolvedValue(null)
    mockPut.mockResolvedValue(true)
    await clearAssistantSessions()
    jest.clearAllMocks()
    mockGet.mockResolvedValue(null)
    mockPut.mockResolvedValue(true)
  })

  it('creates, appends, updates and deletes independent sessions', async () => {
    const first = await createAssistantSession({ title: '  追风筝的人  ', bookId: 'book-1' })
    expect(first.title).toBe('追风筝的人')
    expect(first.bookId).toBe('book-1')

    mockGet.mockResolvedValueOnce({ key: 'assistant-sessions', sessions: [first] })
    const withMessage = await appendAssistantMessage(first.id, { role: 'user', content: '  这本书的核心冲突是什么？ ' })
    expect(withMessage.messages).toHaveLength(1)
    expect(withMessage.messages[0].content).toBe('这本书的核心冲突是什么？')

    mockGet.mockResolvedValueOnce({ key: 'assistant-sessions', sessions: [withMessage] })
    const renamed = await updateAssistantSession(first.id, { title: '核心冲突', summary: '围绕背叛与救赎展开。' })
    expect(renamed.title).toBe('核心冲突')
    expect(renamed.summary).toContain('背叛')

    mockGet.mockResolvedValueOnce({ key: 'assistant-sessions', sessions: [renamed] })
    await deleteAssistantSession(first.id)
    expect(mockPut).toHaveBeenLastCalledWith('metadata', { key: 'assistant-sessions', sessions: [] })
    expect(initDB).toHaveBeenCalled()
  })

  it('serializes concurrent writes so messages are not lost', async () => {
    const session = await createAssistantSession()
    mockGet
      .mockResolvedValueOnce({ key: 'assistant-sessions', sessions: [session] })
      .mockResolvedValueOnce({ key: 'assistant-sessions', sessions: [{ ...session, messages: [{ id: 'old', role: 'user', content: '旧消息', createdAt: 1 }] }] })

    const [first, second] = await Promise.all([
      appendAssistantMessage(session.id, { role: 'user', content: '第一条' }),
      appendAssistantMessage(session.id, { role: 'assistant', content: '第二条' })
    ])
    expect(first.messages).toHaveLength(1)
    expect(second.messages).toHaveLength(2)
    expect(second.messages.at(-1)?.content).toBe('第二条')
  })

  it('compacts only the outgoing history and keeps complete persisted messages intact', () => {
    const messages: AssistantMessage[] = Array.from({ length: 4 }, (_, index) => ({
      id: String(index),
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `${index}`.repeat(5),
      createdAt: index
    }))
    expect(compactAssistantHistory(messages, 11).map(message => message.id)).toEqual(['2', '3'])
    expect(compactAssistantHistory(messages, 3)[0].content).toBe('333')
    expect(messages[3].content).toBe('33333')
  })

  it('returns sessions sorted by most recent activity and ignores malformed records', async () => {
    mockGet.mockResolvedValue({
      key: 'assistant-sessions',
      sessions: [
        { id: 'old', title: '旧', messages: [], createdAt: 1, updatedAt: 1 },
        { id: 'new', title: '新', messages: [], createdAt: 2, updatedAt: 5 },
        { id: 'invalid', title: 1 }
      ]
    })
    const sessions = await getAssistantSessions()
    expect(sessions.map(session => session.id)).toEqual(['new', 'old'])
  })
})
