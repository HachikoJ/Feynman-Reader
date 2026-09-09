import { Pool } from 'pg'
import { BookWriteConflictError, PostgresPersistenceAdapter } from '../postgresPersistence'

jest.mock('pg', () => ({ Pool: jest.fn() }))

const fullBook = {
  id: 'book-1', name: 'Test Book', status: 'reading', currentPhase: 1, bestScore: 0,
  responses: { background: 'Saved analysis' }, noteRecords: [], practiceRecords: [], qaPracticeRecords: [],
  createdAt: 1, updatedAt: 2,
}
const summary = { ...fullBook, _summaryOnly: true, responses: {}, updatedAt: 3 }

describe('cloud book summary write protection', () => {
  const query = jest.fn()
  const release = jest.fn()
  let store: PostgresPersistenceAdapter

  beforeEach(() => {
    jest.clearAllMocks()
    query.mockResolvedValue({ rows: [], rowCount: 1 })
    ;(Pool as unknown as jest.Mock).mockImplementation(() => ({
      query, connect: async () => ({ query, release }),
    }))
    store = new PostgresPersistenceAdapter('postgres://localhost/test')
  })

  it('does not upsert summary books when saving usage and organization snapshots', async () => {
    const result = await store.importUserData('user-1', {
      version: 5, exportDate: 3, settings: {}, books: [summary],
      aiUsageRecords: [{ id: 'usage-1', bookId: summary.id, task: 'analysis', model: 'test',
        promptTokens: 1, completionTokens: 2, totalTokens: 3, createdAt: 3 }],
      bookLists: [{ id: 'list-1', name: 'List', bookIds: [summary.id], createdAt: 1, updatedAt: 3 }],
    })
    expect(result.booksImported).toBe(0)
    expect(query.mock.calls.some(([sql]) => /insert into public.user_books\s/.test(sql))).toBe(false)
    expect(query.mock.calls.some(([sql]) => sql.includes('insert into public.user_ai_usage'))).toBe(true)
    const listWrite = query.mock.calls.find(([sql]) => sql.includes('insert into public.user_book_lists'))!
    expect(JSON.parse(listWrite[1][4])).toEqual([summary.id])
  })

  it('allows summary metadata edits without writing learning placeholders or the summary flag', async () => {
    await store.saveBook('user-1', { ...summary, tags: [{ name: 'New tag', category: 'Topic' }] })
    const [sql, args] = query.mock.calls[0]
    expect(sql).toContain('update public.user_books')
    expect(sql).not.toContain('insert into')
    expect(JSON.parse(args[4])).toEqual({
      name: summary.name, tags: [{ name: 'New tag', category: 'Topic' }], updatedAt: 3,
    })
    expect(sql).toContain("data - '_summaryOnly'")
  })

  it('saves full analysis and removes any previously persisted summary flag', async () => {
    await store.saveBook('user-1', fullBook)
    const [sql, args] = query.mock.calls[0]
    expect(JSON.parse(args[7]).responses).toEqual(fullBook.responses)
    expect(sql).toContain("public.user_books.data - '_summaryOnly'")
  })

  it.each([true, false])('preserves explicit replacement and clearing metadata in writes (summary=%s)', async summaryOnly => {
    const base = summaryOnly ? summary : fullBook
    for (const cover of ['https://example.test/replacement.jpg', '']) {
      await store.saveBook('user-1', { ...base, author: '', cover, description: '', tags: [] })
      const [sql, args] = query.mock.calls.at(-1)!
      const written = JSON.parse(args[summaryOnly ? 4 : 7])
      expect(written).toMatchObject({ author: '', cover, description: '', tags: [] })
      expect(args.slice(0, 2)).toEqual(['user-1', fullBook.id])
      expect(args[3]).toBeNull()
      expect(sql).toContain("- '_summaryOnly'")
      expect(sql).toContain('||')
      if (summaryOnly) {
        for (const field of ['responses', 'noteRecords', 'practiceRecords', 'qaPracticeRecords', 'documentContent', 'recommendations']) expect(written).not.toHaveProperty(field)
        expect(sql).toContain('where user_id = $1 and book_id = $2 and deleted_at is null')
      } else {
        expect(written.responses).toEqual(fullBook.responses)
        expect(sql).toContain('on conflict (user_id, book_id)')
      }
    }
  })

  it.each([true, false])('retains omitted author and optional metadata instead of implicitly clearing them (summary=%s)', async summaryOnly => {
    await store.saveBook('user-1', summaryOnly ? summary : fullBook)
    const [sql, args] = query.mock.calls[0]
    const written = JSON.parse(args[summaryOnly ? 4 : 7])
    for (const field of ['author', 'cover', 'description', 'tags']) expect(written).not.toHaveProperty(field)
    expect(sql).toContain(summaryOnly
      ? "author = case when $5::jsonb ? 'author' then $4 else author end"
      : "author = case when excluded.data ? 'author' then excluded.author else public.user_books.author end")
  })

  it.each([true, false])('reports a rejected timestamp or unavailable record instead of reporting a successful write (summary=%s)', async summaryOnly => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 })
    await expect(store.saveBook('user-1', summaryOnly ? summary : fullBook)).rejects.toBeInstanceOf(BookWriteConflictError)
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('does not restore a recycled book through a full-detail save, even with a newer client timestamp', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 })
    await expect(store.saveBook('user-1', { ...fullBook, updatedAt: Date.now() + 60_000 })).rejects.toBeInstanceOf(BookWriteConflictError)
    const [sql, args] = query.mock.calls[0]
    expect(sql).toContain('where public.user_books.deleted_at is null')
    expect(sql).toContain('and excluded.updated_at >= public.user_books.updated_at')
    expect(args.slice(0, 2)).toEqual(['user-1', fullBook.id])
  })

  it('reads detail JSON without treating a legacy persisted summary marker as authoritative', async () => {
    query.mockResolvedValueOnce({ rows: [{ data: fullBook }] })
    expect(await store.getBook('user-1', fullBook.id)).toEqual(fullBook)
    expect(query.mock.calls[0][0]).toContain("data - '_summaryOnly' as data")
  })

  it('appends AI usage idempotently without writing books, settings or organization data', async () => {
    const record = { id: 'usage-2', bookId: fullBook.id, sessionId: 'session-1', task: 'analysis', model: 'test', promptTokens: 10, completionTokens: 20, totalTokens: 30, createdAt: 5 }
    await store.saveAIUsageRecord('user-1', { ...record, user_id: 'other-account', secret: 'must-not-store' })
    expect(query).toHaveBeenCalledTimes(1)
    const [sql, args] = query.mock.calls[0]
    expect(sql).toContain('insert into public.user_ai_usage')
    expect(sql).toContain('on conflict (user_id, record_id) do nothing')
    expect(sql).not.toMatch(/user_books|user_settings|user_book_lists|user_book_relations/)
    expect(args.slice(0, 2)).toEqual(['user-1', record.id])
    expect(JSON.parse(args[9])).toEqual(record)
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 })
    await expect(store.saveAIUsageRecord('user-1', record)).resolves.toBeUndefined()
  })

  it.each([-1, 2_147_483_648])('rejects invalid token count %s before writing usage', async promptTokens => {
    await expect(store.saveAIUsageRecord('user-1', { id: 'usage-2', task: 'analysis', model: 'test', promptTokens, completionTokens: 0, totalTokens: 0, createdAt: 5 })).rejects.toThrow()
    expect(query).not.toHaveBeenCalled()
  })

  it.each(['importUserData', 'migrateUserData'] as const)('%s retains current profile while applying imported settings', async method => {
    await store[method]('user-1', {
      version: 5, exportDate: 5, books: [], settings: { theme: 'dark', profile: { customDisplayName: 'Stale snapshot name', customAvatarUrl: 'https://example.test/stale.png' } },
    })
    const [sql, args] = query.mock.calls.find(([text]) => text.includes('insert into public.user_settings'))!
    expect(sql).toContain("data = coalesce(public.user_settings.data, '{}'::jsonb) || (excluded.data - 'profile')")
    expect(JSON.parse(args[1])).toMatchObject({ theme: 'dark', apiKey: '' })
    expect(JSON.parse(args[1])).not.toHaveProperty('profile')
    expect(args[0]).toBe('user-1')
  })
})
