import { Pool } from 'pg'
import { PostgresPersistenceAdapter } from '../postgresPersistence'
import type { BookList, BookRelation } from '@/lib/bookRelations'

jest.mock('pg', () => ({ Pool: jest.fn() }))

const list: BookList = { id: 'list-1', name: 'Reading', bookIds: ['book-1', 'book-2'], createdAt: 1, updatedAt: 2 }
const relation: BookRelation = { id: 'relation-1', fromBookId: 'book-1', toBookId: 'book-2', type: 'related', createdAt: 1, updatedAt: 2 }

describe('account-scoped book organization persistence', () => {
  const query = jest.fn()
  const release = jest.fn()
  let store: PostgresPersistenceAdapter

  beforeEach(() => {
    jest.clearAllMocks()
    query.mockImplementation(async (sql: string) => ({
      rows: sql.startsWith('select book_id') ? [{ book_id: 'book-1' }, { book_id: 'book-2' }] : [], rowCount: 1,
    }))
    ;(Pool as unknown as jest.Mock).mockImplementation(() => ({ query, connect: async () => ({ query, release }) }))
    store = new PostgresPersistenceAdapter('postgres://localhost/test')
  })

  it.each(['list', 'relation'] as const)('deletes only the requested %s in the session account, including repeated deletes', async kind => {
    query.mockResolvedValue({ rows: [], rowCount: 0 })
    if (kind === 'list') await store.deleteBookList('user-1', list.id)
    else await store.deleteBookRelation('user-1', relation.id)
    expect(query).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledWith(
      `delete from public.user_book_${kind === 'list' ? 'lists' : 'relations'} where user_id = $1 and ${kind}_id = $2`,
      ['user-1', kind === 'list' ? list.id : relation.id],
    )
  })

  it('saves one list, preserving other lists and supporting an explicit description clear', async () => {
    await store.saveBookList('user-1', { ...list, description: '' })
    const ownership = query.mock.calls.find(([sql]) => sql.startsWith('select book_id'))!
    expect(ownership[0]).toContain('user_id = $1')
    expect(ownership[0]).toContain('deleted_at is null for share')
    expect(ownership[1]).toEqual(['user-1', list.bookIds])
    const write = query.mock.calls.find(([sql]) => sql.startsWith('insert into public.user_book_lists'))!
    expect(write[0]).toContain('on conflict (user_id, list_id)')
    expect(write[1]).toEqual(['user-1', list.id, list.name, null, JSON.stringify(list.bookIds), 1, 2])
    expect(query.mock.calls.some(([sql]) => sql.startsWith('delete'))).toBe(false)
    expect(query).toHaveBeenLastCalledWith('commit')
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('allows an empty list after removing its final book', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 1 })
    await store.saveBookList('user-1', { ...list, bookIds: [] })
    const write = query.mock.calls.find(([sql]) => sql.startsWith('insert into public.user_book_lists'))!
    expect(write[1][4]).toBe('[]')
  })

  it('saves one relation and clears an omitted optional note', async () => {
    await store.saveBookRelation('user-1', relation)
    const write = query.mock.calls.find(([sql]) => sql.startsWith('insert into public.user_book_relations'))!
    expect(write[0]).toContain('on conflict (user_id, relation_id)')
    expect(write[1]).toEqual(['user-1', relation.id, 'book-1', 'book-2', 'related', null, 1, 2])
    expect(query.mock.calls.some(([sql]) => sql.startsWith('delete'))).toBe(false)
    expect(query).toHaveBeenLastCalledWith('commit')
  })

  it.each(['list', 'relation'] as const)('rejects a %s referencing a book outside the account or in the recycle bin', async kind => {
    query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith('select book_id') ? [{ book_id: 'book-1' }] : [], rowCount: 1 }))
    await expect(kind === 'list' ? store.saveBookList('user-1', list) : store.saveBookRelation('user-1', relation)).rejects.toThrow('当前账号')
    expect(query.mock.calls.some(([sql]) => sql.startsWith('insert'))).toBe(false)
    expect(query).toHaveBeenLastCalledWith('rollback')
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('rejects a self relation before accessing the database', async () => {
    await expect(store.saveBookRelation('user-1', { ...relation, toBookId: relation.fromBookId })).rejects.toThrow('自身')
    expect(query).not.toHaveBeenCalled()
  })

  it('rolls back a failed save and propagates the error to the caller', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('insert')) throw new Error('write failed')
      return { rows: sql.startsWith('select book_id') ? [{ book_id: 'book-1' }, { book_id: 'book-2' }] : [], rowCount: 1 }
    })
    await expect(store.saveBookList('user-1', list)).rejects.toThrow('write failed')
    expect(query).toHaveBeenLastCalledWith('rollback')
    expect(release).toHaveBeenCalledTimes(1)
  })
})
