import { Pool } from 'pg'
import { PostgresPersistenceAdapter } from '../postgresPersistence'

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

  it('reads detail JSON without treating a legacy persisted summary marker as authoritative', async () => {
    query.mockResolvedValueOnce({ rows: [{ data: fullBook }] })
    expect(await store.getBook('user-1', fullBook.id)).toEqual(fullBook)
    expect(query.mock.calls[0][0]).toContain("data - '_summaryOnly' as data")
  })
})
