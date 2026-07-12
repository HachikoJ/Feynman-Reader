import { normalizeImportData, normalizeStoredBooks } from '../backupValidation'
import { exportData } from '../integrations'
import { generateNoteHTML, generatePracticeHTML } from '../share'
import type { Book } from '../store'

const questions = [
  { persona: 'elementary' as const, personaName: '初学者', question: '问题一', score: 80, passed: true },
  { persona: 'professional' as const, personaName: '职场人', question: '问题二', score: 80, passed: true },
  { persona: 'scientist' as const, personaName: '科学家', question: '问题三', score: 80, passed: true }
]

function createBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 'book-1',
    name: '测试书籍',
    status: 'reading',
    currentPhase: 1,
    noteRecords: [{ id: 'note-1', type: 'note', content: '笔记', createdAt: 1 }],
    responses: {},
    practiceRecords: [{
      id: 'practice-1',
      bookId: 'book-1',
      content: '教学内容',
      aiReview: '点评',
      scores: { accuracy: 80, completeness: 80, clarity: 80, overall: 80 },
      passed: true,
      createdAt: 1
    }],
    qaPracticeRecords: [{
      id: 'qa-1',
      bookId: 'book-1',
      questions,
      allPassed: true,
      createdAt: 1,
      updatedAt: 1
    }],
    bestScore: 80,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

function createBackup(books: Book[]) {
  return {
    version: 2,
    exportDate: 1,
    settings: {
      apiKey: '[REDACTED]',
      language: 'zh',
      theme: 'light',
      hideApiKeyAlert: false,
      aiDataConsent: false,
      quotes: [],
      quotesInitialized: false
    },
    books
  }
}

describe('backup import boundary', () => {
  it('accepts the complete built-in quote library', () => {
    const backup = createBackup([])
    const quotes = Array.from({ length: 101 }, (_, index) => ({
      text: `金句 ${index + 1}`,
      author: '测试作者',
      isPreset: true
    }))

    expect(normalizeImportData({
      ...backup,
      settings: { ...backup.settings, quotes }
    }).valid).toBe(true)
  })

  it('rejects duplicate book IDs and invalid scores', () => {
    const duplicate = normalizeImportData(createBackup([createBook(), createBook()]))
    expect(duplicate.valid).toBe(false)

    const invalidScore = createBook()
    invalidScore.practiceRecords[0].scores.overall = 101
    expect(normalizeImportData(createBackup([invalidScore])).valid).toBe(false)
  })

  it('recomputes pass flags, completion status, and final score', () => {
    const forged = createBook({ status: 'finished', bestScore: 100 })
    forged.practiceRecords[0].passed = true
    forged.practiceRecords[0].scores.overall = 40
    forged.qaPracticeRecords[0].allPassed = true
    forged.qaPracticeRecords[0].questions[1].passed = false
    forged.qaPracticeRecords[0].questions[1].score = 40

    const result = normalizeImportData(createBackup([forged]))
    expect(result.valid).toBe(true)
    if (!result.valid) return

    expect(result.data.books[0]).toMatchObject({
      status: 'reading',
      bestScore: 0
    })
    expect(result.data.books[0].practiceRecords[0].passed).toBe(false)
    expect(result.data.books[0].qaPracticeRecords[0].allPassed).toBe(false)
  })

  it('rejects unsafe response keys and strips imported API keys', () => {
    const book = createBook()
    book.responses = JSON.parse('{"__proto__":"polluted"}')
    expect(normalizeImportData(createBackup([book])).valid).toBe(false)

    const valid = normalizeImportData(createBackup([createBook()]))
    expect(valid.valid).toBe(true)
    if (valid.valid) expect(valid.data.settings.apiKey).toBe('')
  })
})

describe('stored data recovery boundary', () => {
  it('keeps valid books when another IndexedDB record is malformed', () => {
    const malformed = { ...createBook({ id: 'broken-book' }), currentPhase: 999 }
    const result = normalizeStoredBooks([createBook(), malformed])

    expect(result.books).toHaveLength(1)
    expect(result.books[0].id).toBe('book-1')
    expect(result.errors).toHaveLength(1)
  })

  it('skips duplicate stored IDs without hiding the rest of the library', () => {
    const result = normalizeStoredBooks([
      createBook(),
      createBook(),
      createBook({ id: 'book-2', name: '另一本书' })
    ])

    expect(result.books.map(book => book.id)).toEqual(['book-1', 'book-2'])
    expect(result.errors).toHaveLength(1)
  })
})

describe('HTML export boundary', () => {
  const payload = '</title><script>globalThis.pwned=true</script><img src=x onerror=alert(1)>'
  const book = createBook({
    name: payload,
    author: payload,
    noteRecords: [{ id: 'note-1', type: 'note', content: payload, createdAt: 1 }]
  })
  book.practiceRecords[0].content = payload
  book.practiceRecords[0].aiReview = payload

  it.each([
    ['note', () => generateNoteHTML(book, 'note-1')],
    ['practice', () => generatePracticeHTML(book, 'practice-1')],
    ['full export', () => exportData([book], 'html').content]
  ])('escapes executable markup in %s HTML', (_name, generate) => {
    const html = generate()
    expect(html).not.toContain('<script>globalThis.pwned=true</script>')
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).toContain('&lt;script&gt;')
  })
})
