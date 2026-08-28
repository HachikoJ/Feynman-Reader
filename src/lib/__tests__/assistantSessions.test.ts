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
  addAssistantAttachment,
  appendAssistantMessage,
  clearAssistantSessions,
  compactAssistantHistory,
  compactAssistantContext,
  createAssistantBranchSession,
  createAssistantSession,
  deleteAssistantSession,
  getAssistantSessions,
  MAX_ASSISTANT_ATTACHMENT_CHARS,
  removeAssistantAttachment,
  truncateAssistantMessages,
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
    expect(first.attachments).toEqual([])

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

  it('adds and removes a session attachment', async () => {
    const session = await createAssistantSession()
    mockGet.mockResolvedValueOnce({ key: 'assistant-sessions', sessions: [session] })
    const attached = await addAssistantAttachment(session.id, {
      fileName: ' notes.txt ',
      fileType: ' text/plain ',
      content: ' attachment content '
    })
    expect(attached.attachments[0]).toMatchObject({
      fileName: 'notes.txt',
      fileType: 'text/plain',
      content: 'attachment content'
    })

    mockGet.mockResolvedValueOnce({ key: 'assistant-sessions', sessions: [attached] })
    const removed = await removeAssistantAttachment(session.id, attached.attachments[0].id)
    expect(removed.attachments).toEqual([])
  })

  it('supports replacing attachments through the general session update', async () => {
    const session = await createAssistantSession()
    mockGet.mockResolvedValueOnce({ key: 'assistant-sessions', sessions: [session] })
    const updated = await updateAssistantSession(session.id, {
      attachments: [{
        id: 'attachment',
        fileName: 'book-notes.txt',
        fileType: 'text/plain',
        content: 'notes',
        createdAt: 1
      }]
    })
    expect(updated.attachments).toHaveLength(1)
  })

  it('enforces attachment count, single-content and total-content limits', async () => {
    const session = await createAssistantSession()
    await expect(addAssistantAttachment(session.id, {
      fileName: 'too-long.txt',
      fileType: 'text/plain',
      content: 'x'.repeat(MAX_ASSISTANT_ATTACHMENT_CHARS + 1)
    })).rejects.toThrow('ASSISTANT_ATTACHMENT_TOO_LARGE')

    const fiveAttachments = Array.from({ length: 5 }, (_, index) => ({
      id: `attachment-${index}`,
      fileName: `${index}.txt`,
      fileType: 'text/plain',
      content: 'x',
      createdAt: index
    }))
    mockGet.mockResolvedValueOnce({
      key: 'assistant-sessions',
      sessions: [{ ...session, attachments: fiveAttachments }]
    })
    await expect(addAssistantAttachment(session.id, {
      fileName: 'sixth.txt', fileType: 'text/plain', content: 'x'
    })).rejects.toThrow('ASSISTANT_ATTACHMENT_LIMIT_REACHED')

    mockGet.mockResolvedValueOnce({
      key: 'assistant-sessions',
      sessions: [{ ...session, attachments: [
        { id: 'one', fileName: 'one.txt', fileType: 'text/plain', content: 'x'.repeat(12000), createdAt: 1 },
        { id: 'two', fileName: 'two.txt', fileType: 'text/plain', content: 'x'.repeat(12000), createdAt: 2 },
        { id: 'three', fileName: 'three.txt', fileType: 'text/plain', content: 'x'.repeat(6000), createdAt: 3 }
      ] }]
    })
    await expect(addAssistantAttachment(session.id, {
      fileName: 'over-total.txt', fileType: 'text/plain', content: 'x'
    })).rejects.toThrow('ASSISTANT_ATTACHMENT_TOTAL_TOO_LARGE')
  })

  it('normalizes malformed attachments and clips legacy data to safe limits', async () => {
    mockGet.mockResolvedValue({
      key: 'assistant-sessions',
      sessions: [{
        id: 'session',
        title: '附件',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
        attachments: [
          { id: 'one', fileName: ' one.txt ', fileType: ' text/plain ', content: 'x'.repeat(15000), createdAt: 1 },
          { id: 'bad', fileName: '', fileType: 'text/plain', content: 'bad', createdAt: 2 },
          { id: 'two', fileName: 'two.txt', fileType: 'text/plain', content: 'y'.repeat(12000), createdAt: 3 },
          { id: 'three', fileName: 'three.txt', fileType: 'text/plain', content: 'z'.repeat(12000), createdAt: 4 }
        ]
      }]
    })
    const [session] = await getAssistantSessions()
    expect(session.attachments).toHaveLength(3)
    expect(session.attachments[0]).toMatchObject({ fileName: 'one.txt', fileType: 'text/plain' })
    expect(session.attachments[0].content).toHaveLength(12000)
    expect(session.attachments.reduce((sum, attachment) => sum + attachment.content.length, 0)).toBe(30000)
  })

  it('truncates a conversation at an edited user message', async () => {
    const session = await createAssistantSession()
    mockGet.mockResolvedValueOnce({ key: 'assistant-sessions', sessions: [{
      ...session,
      messages: [
        { id: 'u1', role: 'user', content: 'first', createdAt: 1 },
        { id: 'a1', role: 'assistant', content: 'answer', createdAt: 2 },
        { id: 'u2', role: 'user', content: 'edit me', createdAt: 3 }
      ]
    }] })
    const truncated = await truncateAssistantMessages(session.id, 'u2')
    expect(truncated.messages.map(message => message.id)).toEqual(['u1', 'a1'])
  })

  it('creates an independent branch through the selected assistant reply', async () => {
    const session = await createAssistantSession({ title: '原会话' })
    mockGet.mockResolvedValueOnce({ key: 'assistant-sessions', sessions: [{
      ...session,
      messages: [
        { id: 'u1', role: 'user', content: 'first', createdAt: 1 },
        { id: 'a1', role: 'assistant', content: 'answer', createdAt: 2 },
        { id: 'u2', role: 'user', content: 'later', createdAt: 3 }
      ]
    }] })
    const branch = await createAssistantBranchSession(session.id, 'a1')
    expect(branch.id).not.toBe(session.id)
    expect(branch.title).toBe('原会话 · 分支')
    expect(branch.messages.map(message => message.id)).toEqual(['u1', 'a1'])
  })

  it('summarizes older turns while preserving recent message boundaries', () => {
    const messages: AssistantMessage[] = Array.from({ length: 8 }, (_, index) => ({
      id: String(index),
      role: index % 2 ? 'assistant' : 'user',
      content: `${index}`.repeat(12),
      createdAt: index
    }))
    const compacted = compactAssistantContext(messages, 80)
    expect(compacted.omittedCount).toBeGreaterThan(0)
    expect(compacted.summary).toContain('用户')
    expect(compacted.messages.at(-1)?.id).toBe('7')
  })
})
