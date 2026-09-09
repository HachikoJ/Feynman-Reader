import { normalizeBookRelations, normalizeImportData } from '../backupValidation'

const books = ['book-1', 'book-2'].map(id => ({
  id, name: id, status: 'unread', currentPhase: 0, bestScore: 0,
  noteRecords: [], responses: {}, practiceRecords: [], qaPracticeRecords: [],
  createdAt: 1, updatedAt: 1,
}))
const firstRelation = {
  id: 'relation-1', fromBookId: 'book-1', toBookId: 'book-2',
  type: 'series', note: 'First note', createdAt: 1, updatedAt: 1,
}

describe('persisted book relationship validation', () => {
  it.each([false, true])('preserves separate records of an equivalent relationship (reversed: %s)', reversed => {
    const relations = [firstRelation, {
      ...firstRelation, id: 'relation-2', note: 'Second note', createdAt: 2, updatedAt: 2,
      ...(reversed ? { fromBookId: 'book-2', toBookId: 'book-1' } : {}),
    }]
    const result = normalizeImportData({
      version: 5, exportDate: 3, settings: {}, books, bookRelations: relations,
    })
    expect(result.valid).toBe(true)
    if (!result.valid) throw new Error(result.error)
    expect(result.data.books).toHaveLength(2)
    expect(result.data.bookRelations).toEqual(relations)
    expect(normalizeImportData(result.data)).toEqual(result)
  })

  it('still rejects duplicate record IDs', () => {
    expect(normalizeBookRelations([firstRelation, { ...firstRelation, note: 'Conflicting note' }]))
      .toEqual({ valid: false, error: '书籍关系存在重复 ID：relation-1' })
  })

  it('still rejects invalid relationship fields', () => {
    expect(normalizeBookRelations([{ ...firstRelation, type: 'invalid' }]).valid).toBe(false)
    expect(normalizeBookRelations([{ ...firstRelation, toBookId: 'book-1' }]).valid).toBe(false)
    expect(normalizeBookRelations([{ ...firstRelation, createdAt: 'invalid' }]).valid).toBe(false)
  })
})
