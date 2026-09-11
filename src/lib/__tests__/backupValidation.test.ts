import { normalizeBookRelations, normalizeImportData } from '../backupValidation'
import { MAX_BOOKMARKS_PER_BOOK, MAX_DOCUMENT_TEXT_LENGTH, MAX_NOTE_TAGS } from '../dataLimits'

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

const bookmarkFixture = {
  id: 'bookmark-1',
  chapterIndex: 1,
  offset: 120,
  chapterTitle: '第二章 农业革命',
  snippet: '农业革命是史上最大的骗局。',
  label: '重要观点',
  color: 'blue' as const,
  createdAt: 5,
}

const baseBook = {
  id: 'book-1', name: 'book-1', status: 'unread', currentPhase: 0, bestScore: 0,
  noteRecords: [], responses: {}, practiceRecords: [], qaPracticeRecords: [],
  createdAt: 1, updatedAt: 1,
}

function normalizeSingleBook(book: Record<string, unknown>) {
  return normalizeImportData({ version: 5, exportDate: 3, settings: {}, books: [book] })
}

describe('reader bookmark and highlight validation', () => {
  it('keeps bookmark position, colour and label', () => {
    const result = normalizeSingleBook({ ...baseBook, bookmarks: [bookmarkFixture] })
    expect(result.valid).toBe(true)
    if (!result.valid) throw new Error(result.error)
    expect(result.data.books[0].bookmarks).toEqual([bookmarkFixture])
  })

  it('drops unknown colours instead of rejecting the bookmark', () => {
    const result = normalizeSingleBook({ ...baseBook, bookmarks: [{ ...bookmarkFixture, color: 'neon' }] })
    expect(result.valid).toBe(true)
    if (!result.valid) throw new Error(result.error)
    const [bookmark] = result.data.books[0].bookmarks ?? []
    expect(bookmark && 'color' in bookmark).toBe(false)
    expect(bookmark).toEqual(expect.objectContaining({ id: bookmarkFixture.id, offset: bookmarkFixture.offset }))
  })

  it('rejects offsets outside the stored document', () => {
    expect(normalizeSingleBook({ ...baseBook, bookmarks: [{ ...bookmarkFixture, offset: -1 }] }).valid).toBe(false)
    expect(normalizeSingleBook({
      ...baseBook,
      bookmarks: [{ ...bookmarkFixture, offset: MAX_DOCUMENT_TEXT_LENGTH + 1 }],
    }).valid).toBe(false)
  })

  it('rejects more bookmarks than a book can hold', () => {
    const bookmarks = Array.from(
      { length: MAX_BOOKMARKS_PER_BOOK + 1 },
      (_, index) => ({ ...bookmarkFixture, id: `bookmark-${index}` })
    )
    expect(normalizeSingleBook({ ...baseBook, bookmarks }).valid).toBe(false)
  })

  it('keeps highlight offset and colour on note records', () => {
    const note = {
      id: 'note-1', type: 'note', content: '农业革命需要放在更长的历史尺度里看。',
      quote: '农业革命是史上最大的骗局。', offset: 42, color: 'pink', source: 'reading', createdAt: 4,
    }
    const result = normalizeSingleBook({ ...baseBook, noteRecords: [note] })
    expect(result.valid).toBe(true)
    if (!result.valid) throw new Error(result.error)
    expect(result.data.books[0].noteRecords[0]).toEqual(note)
  })

  it('drops unknown colours on note records', () => {
    const note = {
      id: 'note-1', type: 'note', content: '笔记', quote: '原文', offset: 3, color: 'neon', createdAt: 4,
    }
    const result = normalizeSingleBook({ ...baseBook, noteRecords: [note] })
    expect(result.valid).toBe(true)
    if (!result.valid) throw new Error(result.error)
    expect(result.data.books[0].noteRecords[0]).toEqual({
      id: 'note-1', type: 'note', content: '笔记', quote: '原文', offset: 3, createdAt: 4,
    })
  })

  it('keeps highlight tags and normalizes duplicates and spacing', () => {
    const note = {
      id: 'note-1', type: 'note', content: '笔记', quote: '原文', offset: 3, createdAt: 4,
      tags: [' 论证结构 ', '论证结构', '关键概念'],
    }
    const result = normalizeSingleBook({ ...baseBook, noteRecords: [note] })
    expect(result.valid).toBe(true)
    if (!result.valid) throw new Error(result.error)
    expect(result.data.books[0].noteRecords[0]).toEqual({
      id: 'note-1', type: 'note', content: '笔记', quote: '原文', offset: 3, createdAt: 4,
      tags: ['论证结构', '关键概念'],
    })
  })

  it('caps imported highlight tags at the shared limit', () => {
    const note = {
      id: 'note-1', type: 'note', content: '笔记', createdAt: 4,
      tags: Array.from({ length: MAX_NOTE_TAGS + 4 }, (_, index) => `标签${index}`),
    }
    const result = normalizeSingleBook({ ...baseBook, noteRecords: [note] })
    expect(result.valid).toBe(true)
    if (!result.valid) throw new Error(result.error)
    expect(result.data.books[0].noteRecords[0].tags).toHaveLength(MAX_NOTE_TAGS)
  })
})
