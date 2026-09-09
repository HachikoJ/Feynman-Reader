const saveBookList = jest.fn()
const deleteBookList = jest.fn()
const saveBookRelation = jest.fn()
const deleteBookRelation = jest.fn()

jest.mock('@/lib/server/sessionUser', () => ({ sessionUserId: jest.fn(async () => 'user-1') }))
jest.mock('@/lib/server/persistence', () => ({
  getPersistence: jest.fn(() => ({ saveBookList, deleteBookList, saveBookRelation, deleteBookRelation })),
  isPersistenceUnavailable: jest.fn(() => false),
}))

import { sessionUserId } from '@/lib/server/sessionUser'
import { PUT, DELETE } from '../route'

const list = { id: 'list-1', name: 'Reading', bookIds: ['book-1'], createdAt: 1, updatedAt: 2 }
const relation = { id: 'relation-1', fromBookId: 'book-1', toBookId: 'book-2', type: 'related', createdAt: 1 }
const request = (method: string, body: unknown) => new Request('https://www.deline.top/api/account/book-organization/', { method, body: JSON.stringify(body) })

describe('book organization routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    for (const mutation of [saveBookList, deleteBookList, saveBookRelation, deleteBookRelation]) mutation.mockReset()
    ;(sessionUserId as jest.Mock).mockResolvedValue('user-1')
  })

  it.each(['list', 'relation'] as const)('saves one %s with session identity, ignoring any supplied owner', async kind => {
    const record = kind === 'list' ? list : relation
    const response = await PUT(request('PUT', { kind, record: { ...record, userId: 'victim' }, userId: 'victim' }))
    expect(response.status).toBe(200)
    expect(kind === 'list' ? saveBookList : saveBookRelation).toHaveBeenCalledWith('user-1', record)
    expect(deleteBookList).not.toHaveBeenCalled()
    expect(deleteBookRelation).not.toHaveBeenCalled()
  })

  it.each(['list', 'relation'] as const)('deletes a %s only in the current account', async kind => {
    const response = await DELETE(request('DELETE', { kind, id: 'record-1', userId: 'victim' }))
    expect(response.status).toBe(200)
    expect(kind === 'list' ? deleteBookList : deleteBookRelation).toHaveBeenCalledWith('user-1', 'record-1')
  })

  it.each(['PUT', 'DELETE'])('denies an unauthenticated %s before mutation', async method => {
    ;(sessionUserId as jest.Mock).mockResolvedValue(null)
    const response = await (method === 'PUT' ? PUT : DELETE)(request(method, { kind: 'list', record: list, id: list.id }))
    expect(response.status).toBe(401)
    expect(saveBookList).not.toHaveBeenCalled()
    expect(deleteBookList).not.toHaveBeenCalled()
  })

  it('rejects invalid records and delete IDs without persistence calls', async () => {
    expect((await PUT(request('PUT', { kind: 'relation', record: { ...relation, toBookId: 'book-1' } }))).status).toBe(400)
    expect((await DELETE(request('DELETE', { kind: 'list', id: '' }))).status).toBe(400)
    expect((await DELETE(request('DELETE', { kind: 'users', id: 'user-1' }))).status).toBe(400)
    expect(saveBookRelation).not.toHaveBeenCalled()
    expect(deleteBookList).not.toHaveBeenCalled()
  })

  it('returns a failed ownership check to the client instead of reporting success', async () => {
    saveBookList.mockRejectedValue(new Error('书单只能包含当前账号下未删除的书籍。'))
    const response = await PUT(request('PUT', { kind: 'list', record: list }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '书单只能包含当前账号下未删除的书籍。' })
  })
})
