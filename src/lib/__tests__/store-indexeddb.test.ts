/** @jest-environment node */

jest.mock('../db', () => ({
  initDB: jest.fn(),
  getSettings: jest.fn(),
  saveSettings: jest.fn(),
  getBooks: jest.fn(),
  saveBooks: jest.fn(),
  saveBook: jest.fn(),
  saveExistingBook: jest.fn(),
  restoreDeletedBook: jest.fn(),
  deleteExistingBookById: jest.fn(),
  getBook: jest.fn()
}))

import * as db from '../db'
import {
  getBooks,
  getSettings,
  initializeStore,
  addBook,
  deleteBook,
  restoreBook,
  resetStoreCache,
  saveBooks,
  saveSettings,
  saveSetting,
  updateBook,
  addPracticeRecord,
  deletePracticeRecord,
  addQAPracticeRecord,
  deleteQAPracticeRecord,
  calculateFinalScore,
  isQAPracticeRecordComplete,
  applyImportData,
  flushPendingStoreWrites,
  subscribeToPersistenceErrors,
  exportAllData,
  previewImportData,
  type AppSettings,
  type ExportData,
  type Book
} from '../store'
import { MAX_DOCUMENT_TEXT_LENGTH } from '../dataLimits'

const mockInitDB = db.initDB as jest.MockedFunction<typeof db.initDB>
const mockGetSettings = db.getSettings as jest.MockedFunction<typeof db.getSettings>
const mockSaveSettings = db.saveSettings as jest.MockedFunction<typeof db.saveSettings>
const mockGetBooks = db.getBooks as jest.MockedFunction<typeof db.getBooks>
const mockSaveBooks = db.saveBooks as jest.MockedFunction<typeof db.saveBooks>
const mockSaveBook = db.saveBook as jest.MockedFunction<typeof db.saveBook>
const mockSaveExistingBook = db.saveExistingBook as jest.MockedFunction<typeof db.saveExistingBook>
const mockRestoreDeletedBook = db.restoreDeletedBook as jest.MockedFunction<typeof db.restoreDeletedBook>
const mockDeleteExistingBookById = db.deleteExistingBookById as jest.MockedFunction<typeof db.deleteExistingBookById>

describe('IndexedDB-backed store cache', () => {
  beforeAll(() => {
    Object.defineProperty(global, 'window', { value: {}, configurable: true })
  })

  it('loads IndexedDB data before exposing synchronous reads', async () => {
    const settings: AppSettings = {
      apiKey: 'sk-test',
      language: 'en',
      theme: 'dark',
      hideApiKeyAlert: true,
      quotes: [],
      quotesInitialized: true
    }
    const books: Book[] = [{
      id: 'book-1',
      name: 'Test Book',
      status: 'reading',
      currentPhase: 1,
      noteRecords: [],
      responses: {},
      practiceRecords: [],
      qaPracticeRecords: [],
      bestScore: 0,
      createdAt: 1,
      updatedAt: 1
    }]

    mockInitDB.mockResolvedValue(undefined)
    mockGetSettings.mockResolvedValue(settings)
    mockGetBooks.mockResolvedValue(books)

    await initializeStore()

    expect(mockInitDB).toHaveBeenCalledTimes(1)
    expect(getSettings()).toMatchObject(settings)
    expect(getBooks()).toEqual(books)
  })

  it('recomputes forged learning flags and completion state when loading local data', async () => {
    resetStoreCache()
    mockInitDB.mockResolvedValue(undefined)
    mockGetSettings.mockResolvedValue({
      apiKey: '', language: 'zh', theme: 'light', hideApiKeyAlert: false, quotes: []
    })
    mockGetBooks.mockResolvedValue([{
      id: 'forged-book',
      name: 'Forged Book',
      status: 'finished',
      currentPhase: 99,
      noteRecords: [],
      responses: {},
      practiceRecords: [{
        id: 'practice-1',
        bookId: 'forged-book',
        content: '内容',
        aiReview: '点评',
        scores: { accuracy: 10, completeness: 10, clarity: 10, overall: 10 },
        passed: true,
        createdAt: 1
      }],
      qaPracticeRecords: [{
        id: 'qa-1',
        bookId: 'forged-book',
        allPassed: true,
        createdAt: 1,
        updatedAt: 1,
        questions: [
          { persona: 'elementary', personaName: '小学生', question: '问题一', score: 10, passed: true },
          { persona: 'professional', personaName: '职场新人', question: '问题二', score: 10, passed: true },
          { persona: 'scientist', personaName: '科学家', question: '问题三', score: 10, passed: true }
        ]
      }],
      bestScore: 100,
      createdAt: 1,
      updatedAt: 1
    }])

    await initializeStore()

    const [book] = getBooks()
    expect(book.currentPhase).toBe(6)
    expect(book.practiceRecords[0].passed).toBe(false)
    expect(book.qaPracticeRecords[0].allPassed).toBe(false)
    expect(book.qaPracticeRecords[0].questions.every(question => question.passed === false)).toBe(true)
    expect(book.bestScore).toBe(0)
    expect(book.status).toBe('reading')
    await flushPendingStoreWrites()
  })

  it('updates the cache immediately and queues IndexedDB writes', async () => {
    const settings = { ...getSettings(), language: 'zh' as const }
    const books = [...getBooks(), { ...getBooks()[0], id: 'book-2' }]

    mockSaveSettings.mockResolvedValue(undefined)
    mockSaveBooks.mockResolvedValue(undefined)

    saveSettings(settings)
    saveBooks(books)
    await Promise.resolve()
    await Promise.resolve()

    expect(getSettings()).toEqual(settings)
    expect(getBooks()).toEqual(books)
    expect(mockSaveSettings).toHaveBeenCalledWith(settings)
    expect(mockSaveBooks).toHaveBeenCalledWith(books)
  })

  it('adds, updates, and deletes one book without rewriting the full library', async () => {
    jest.clearAllMocks()
    resetStoreCache()
    mockInitDB.mockResolvedValue(undefined)
    mockGetSettings.mockResolvedValue({
      apiKey: '', language: 'zh', theme: 'cyber', hideApiKeyAlert: false, quotes: []
    })
    mockGetBooks.mockResolvedValue([])
    mockSaveBook.mockResolvedValue(undefined)
    mockSaveExistingBook.mockResolvedValue(undefined)
    mockDeleteExistingBookById.mockResolvedValue(undefined)

    await initializeStore()
    mockSaveBooks.mockClear()
    const book = addBook('Single write book')
    updateBook(book.id, { status: 'reading' })
    deleteBook(book.id)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(getBooks()).toEqual([])
    expect(mockSaveBooks).not.toHaveBeenCalled()
    expect(mockSaveBook).toHaveBeenCalledTimes(1)
    expect(mockSaveExistingBook).toHaveBeenCalledWith(
      expect.objectContaining({ id: book.id, status: 'unread' }),
      book.updatedAt
    )
    expect(mockDeleteExistingBookById).toHaveBeenCalledWith(book.id, expect.any(Number))
  })

  it('rejects mutations for books and practice records that no longer exist', async () => {
    resetStoreCache()
    mockInitDB.mockResolvedValue(undefined)
    mockGetSettings.mockResolvedValue({
      apiKey: '', language: 'zh', theme: 'light', hideApiKeyAlert: false, quotes: []
    })
    mockGetBooks.mockResolvedValue([])
    await initializeStore()

    expect(() => updateBook('missing-book', { status: 'reading' })).toThrow('BOOK_NOT_FOUND')
    expect(() => deleteBook('missing-book')).toThrow('BOOK_NOT_FOUND')
    expect(() => deletePracticeRecord('missing-book', 'missing-practice')).toThrow('BOOK_NOT_FOUND')
    expect(() => deleteQAPracticeRecord('missing-book', 'missing-qa')).toThrow('BOOK_NOT_FOUND')
  })

  it('surfaces a stale-tab conflict instead of reporting a successful update', async () => {
    resetStoreCache()
    mockInitDB.mockResolvedValue(undefined)
    mockGetSettings.mockResolvedValue({
      apiKey: '', language: 'zh', theme: 'light', hideApiKeyAlert: false, quotes: []
    })
    mockGetBooks.mockResolvedValue([])
    mockSaveBook.mockResolvedValue(undefined)
    mockSaveExistingBook.mockRejectedValueOnce(new Error('STALE_LOCAL_DATA:book'))
    await initializeStore()

    const book = addBook('Stale tab')
    await flushPendingStoreWrites()
    updateBook(book.id, { noteRecords: [{ id: 'note', type: 'note', content: 'old tab', createdAt: 1 }] })

    await expect(flushPendingStoreWrites()).rejects.toThrow('STALE_LOCAL_DATA')
  })

  it('persists one quick setting without changing other stored values', async () => {
    resetStoreCache()
    mockInitDB.mockResolvedValue(undefined)
    mockGetSettings.mockResolvedValue({
      apiKey: 'sk-saved', language: 'zh', theme: 'light', hideApiKeyAlert: false, quotes: []
    })
    mockGetBooks.mockResolvedValue([])
    mockSaveSettings.mockResolvedValue(undefined)
    await initializeStore()

    const saved = saveSetting('theme', 'dark')
    await flushPendingStoreWrites()

    expect(saved).toMatchObject({ apiKey: 'sk-saved', language: 'zh', theme: 'dark' })
    expect(mockSaveSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      apiKey: 'sk-saved',
      language: 'zh',
      theme: 'dark'
    }))
  })

  it('derives teaching pass status from the score instead of trusting the caller', async () => {
    jest.clearAllMocks()
    resetStoreCache()
    mockInitDB.mockResolvedValue(undefined)
    mockGetSettings.mockResolvedValue({
      apiKey: '', language: 'zh', theme: 'light', hideApiKeyAlert: false, quotes: []
    })
    mockGetBooks.mockResolvedValue([])
    mockSaveBook.mockResolvedValue(undefined)
    await initializeStore()

    const book = addBook('Caller trust test')
    const record = addPracticeRecord(book.id, {
      content: '不合格回答',
      aiReview: '需要继续完善',
      scores: { accuracy: 10, completeness: 10, clarity: 10, overall: 10 },
      passed: true
    })

    expect(record.passed).toBe(false)
    expect(getBooks()[0]).toMatchObject({ status: 'reading', bestScore: 0 })
    await flushPendingStoreWrites()
  })

  it('marks a book as reading when the user saves a note', async () => {
    jest.clearAllMocks()
    resetStoreCache()
    mockInitDB.mockResolvedValue(undefined)
    mockGetSettings.mockResolvedValue({
      apiKey: '', language: 'zh', theme: 'light', hideApiKeyAlert: false, quotes: []
    })
    mockGetBooks.mockResolvedValue([])
    mockSaveBook.mockResolvedValue(undefined)
    await initializeStore()

    const book = addBook('Note activity test')
    updateBook(book.id, {
      noteRecords: [{ id: 'note-1', type: 'note', content: '学习笔记', createdAt: 1 }]
    })

    expect(getBooks()[0]).toMatchObject({ status: 'reading', bestScore: 0 })
    await flushPendingStoreWrites()
  })

  it('restores a deleted book with all learning data and the original id', async () => {
    resetStoreCache()
    mockInitDB.mockResolvedValue(undefined)
    mockGetSettings.mockResolvedValue({
      apiKey: '', language: 'zh', theme: 'light', hideApiKeyAlert: false, quotes: []
    })
    mockGetBooks.mockResolvedValue([])
    mockSaveBook.mockResolvedValue(undefined)
    mockRestoreDeletedBook.mockResolvedValue(undefined)
    mockDeleteExistingBookById.mockResolvedValue(undefined)
    await initializeStore()

    const original = addBook('Restore me')
    const withProgress: Book = {
      ...original,
      currentPhase: 4,
      noteRecords: [{ id: 'note-1', type: 'note', content: '重要笔记', createdAt: 10 }],
      responses: { background: '阶段内容' },
      practiceRecords: [],
      qaPracticeRecords: []
    }
    updateBook(original.id, withProgress)
    deleteBook(original.id)
    restoreBook(withProgress)

    expect(getBooks()).toEqual([expect.objectContaining({
      id: original.id,
      currentPhase: 4,
      noteRecords: withProgress.noteRecords,
      responses: withProgress.responses
    })])
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mockRestoreDeletedBook).toHaveBeenLastCalledWith(expect.objectContaining({ id: original.id, currentPhase: 4 }))
  })

  it('redacts API keys from exports and preserves the current key when importing settings', async () => {
    resetStoreCache()
    const currentSettings: AppSettings = {
      apiKey: 'sk-current-secret',
      language: 'zh',
      theme: 'light',
      hideApiKeyAlert: false,
      aiDataConsent: false,
      quotes: [],
      quotesInitialized: false
    }
    mockInitDB.mockResolvedValue(undefined)
    mockGetSettings.mockResolvedValue(currentSettings)
    mockGetBooks.mockResolvedValue([])
    mockSaveSettings.mockResolvedValue(undefined)
    await initializeStore()

    const exported = JSON.parse(exportAllData()) as ExportData
    expect(exported.settings.apiKey).toBe('[REDACTED]')
    expect(exportAllData()).not.toContain(currentSettings.apiKey)

    applyImportData({
      ...exported,
      settings: {
        ...exported.settings,
        language: 'en',
        theme: 'dark',
        hideApiKeyAlert: true,
        aiDataConsent: true,
        apiKey: '[REDACTED]'
      }
    }, { importSettings: true, importBooks: false })

    expect(getSettings()).toMatchObject({
      apiKey: currentSettings.apiKey,
      language: 'en',
      theme: 'dark',
      hideApiKeyAlert: false,
      aiDataConsent: false
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(mockSaveSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      apiKey: currentSettings.apiKey,
      language: 'en',
      theme: 'dark',
      hideApiKeyAlert: false,
      aiDataConsent: false
    }))
  })

  it('waits for imported data to finish persisting before reporting success', async () => {
    resetStoreCache()
    mockInitDB.mockResolvedValue(undefined)
    mockGetSettings.mockResolvedValue({
      apiKey: '', language: 'zh', theme: 'light', hideApiKeyAlert: false, quotes: []
    })
    mockGetBooks.mockResolvedValue([])

    let finishSaving: (() => void) | undefined
    mockSaveBooks.mockImplementationOnce(() => new Promise<void>(resolve => {
      finishSaving = resolve
    }))
    await initializeStore()

    applyImportData({
      version: 2,
      exportDate: Date.now(),
      settings: getSettings(),
      books: [{
        id: 'imported-book',
        name: 'Imported Book',
        status: 'unread',
        currentPhase: 0,
        noteRecords: [],
        responses: {},
        practiceRecords: [],
        qaPracticeRecords: [],
        bestScore: 0,
        createdAt: 1,
        updatedAt: 1
      }]
    }, { importSettings: false, importBooks: true, mergeBooks: false })

    let flushed = false
    const flushPromise = flushPendingStoreWrites().then(() => { flushed = true })
    await Promise.resolve()
    expect(flushed).toBe(false)

    finishSaving?.()
    await flushPromise
    expect(flushed).toBe(true)
    expect(mockSaveBooks).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: 'imported-book' })
    ]))
  })

  it('recomputes imported status and scores instead of trusting forged completion fields', async () => {
    resetStoreCache()
    mockInitDB.mockResolvedValue(undefined)
    mockGetSettings.mockResolvedValue({
      apiKey: '', language: 'zh', theme: 'light', hideApiKeyAlert: false, quotes: []
    })
    mockGetBooks.mockResolvedValue([])
    mockSaveBooks.mockResolvedValue(undefined)
    await initializeStore()

    applyImportData({
      version: 2,
      exportDate: Date.now(),
      settings: getSettings(),
      books: [{
        id: 'forged-book',
        name: 'Forged Book',
        status: 'finished',
        currentPhase: 0,
        noteRecords: [],
        responses: {},
        practiceRecords: [],
        qaPracticeRecords: [],
        bestScore: 99,
        createdAt: 1,
        updatedAt: 1
      }]
    }, { importSettings: false, importBooks: true, mergeBooks: false })

    expect(getBooks()).toEqual([expect.objectContaining({
      id: 'forged-book',
      status: 'unread',
      bestScore: 0
    })])
  })

  it('uses the latest imported answer attempt as the question completion source', () => {
    const attempts = [
      { userAnswer: '错误回答', answeredAt: 1, aiReview: '未通过', score: 20, passed: true, reviewedAt: 1 },
      { userAnswer: '正确回答', answeredAt: 2, aiReview: '已通过', score: 80, passed: false, reviewedAt: 2 }
    ]
    const questions = ['elementary', 'professional', 'scientist'].map((persona, index) => ({
      persona,
      personaName: `角色 ${index + 1}`,
      question: `问题 ${index + 1}`,
      userAnswer: '伪造的顶层回答',
      answeredAt: 99,
      aiReview: '伪造的顶层点评',
      score: 10,
      passed: false,
      reviewedAt: 99,
      attempts
    }))
    const preview = previewImportData(JSON.stringify({
      version: 3,
      exportDate: Date.now(),
      settings: getSettings(),
      books: [{
        id: 'attempt-book',
        name: 'Attempt Book',
        status: 'unread',
        currentPhase: 0,
        noteRecords: [],
        responses: {},
        practiceRecords: [],
        qaPracticeRecords: [{
          id: 'qa-attempts',
          bookId: 'attempt-book',
          questions,
          allPassed: false,
          createdAt: 1,
          updatedAt: 2
        }],
        bestScore: 0,
        createdAt: 1,
        updatedAt: 2
      }]
    }))

    expect(preview.valid).toBe(true)
    expect(preview.data?.books[0].qaPracticeRecords?.[0]).toMatchObject({
      allPassed: true,
      questions: [
        expect.objectContaining({ userAnswer: '正确回答', score: 80, passed: true }),
        expect.objectContaining({ userAnswer: '正确回答', score: 80, passed: true }),
        expect.objectContaining({ userAnswer: '正确回答', score: 80, passed: true })
      ]
    })
  })

  it('rejects imported questions with more than fifty answer attempts', () => {
    const attempts = Array.from({ length: 51 }, (_, index) => ({
      userAnswer: `回答 ${index}`,
      answeredAt: index,
      aiReview: `点评 ${index}`,
      score: 50,
      passed: false,
      reviewedAt: index
    }))
    const preview = previewImportData(JSON.stringify({
      version: 3,
      exportDate: Date.now(),
      settings: getSettings(),
      books: [{
        id: 'too-many-attempts',
        name: 'Too Many Attempts',
        status: 'reading',
        currentPhase: 0,
        noteRecords: [],
        responses: {},
        practiceRecords: [],
        qaPracticeRecords: [{
          id: 'qa-too-many',
          bookId: 'too-many-attempts',
          questions: [{
            persona: 'elementary',
            personaName: '初学者',
            question: '问题',
            attempts
          }],
          allPassed: false,
          createdAt: 1,
          updatedAt: 1
        }],
        bestScore: 0,
        createdAt: 1,
        updatedAt: 1
      }]
    }))

    expect(preview.valid).toBe(false)
    expect(preview.error).toContain('最多允许 50 次回答')
  })

  it('normalizes an imported reading status without learning activity to unread', () => {
    const preview = previewImportData(JSON.stringify({
      version: 2,
      exportDate: Date.now(),
      settings: getSettings(),
      books: [{
        id: 'idle-book',
        name: 'Idle Book',
        status: 'reading',
        currentPhase: 0,
        noteRecords: [],
        responses: {},
        practiceRecords: [],
        qaPracticeRecords: [],
        bestScore: 0,
        createdAt: 1,
        updatedAt: 1
      }]
    }))

    expect(preview.valid).toBe(true)
    expect(preview.data?.books[0].status).toBe('unread')
  })

  it('normalizes an imported book with notes to reading', () => {
    const preview = previewImportData(JSON.stringify({
      version: 2,
      exportDate: Date.now(),
      settings: getSettings(),
      books: [{
        id: 'noted-book',
        name: 'Noted Book',
        status: 'unread',
        currentPhase: 0,
        noteRecords: [{ id: 'note-1', type: 'note', content: '学习笔记', createdAt: 1 }],
        responses: {},
        practiceRecords: [],
        qaPracticeRecords: [],
        bestScore: 0,
        createdAt: 1,
        updatedAt: 1
      }]
    }))

    expect(preview.valid).toBe(true)
    expect(preview.data?.books[0].status).toBe('reading')
  })

  it('round-trips a document at the supported text limit through backup validation', async () => {
    resetStoreCache()
    mockInitDB.mockResolvedValue(undefined)
    mockGetSettings.mockResolvedValue({
      apiKey: '', language: 'zh', theme: 'light', hideApiKeyAlert: false, quotes: []
    })
    mockGetBooks.mockResolvedValue([])
    mockSaveBooks.mockResolvedValue(undefined)
    await initializeStore()

    const book = addBook('Large Document', 'Author', undefined, undefined, undefined, 'x'.repeat(MAX_DOCUMENT_TEXT_LENGTH))
    await flushPendingStoreWrites()
    const exported = exportAllData()
    const preview = previewImportData(exported)

    expect(preview.valid).toBe(true)
    expect(preview.data?.books[0]).toMatchObject({ id: book.id, documentContent: expect.any(String) })
    expect(preview.data?.books[0].documentContent).toHaveLength(MAX_DOCUMENT_TEXT_LENGTH)
  })

  it('reports a persistence failure once and allows a later successful retry', async () => {
    resetStoreCache()
    mockInitDB.mockResolvedValue(undefined)
    mockGetSettings.mockResolvedValue({
      apiKey: '', language: 'zh', theme: 'light', hideApiKeyAlert: false, quotes: []
    })
    mockGetBooks.mockResolvedValue([])
    await initializeStore()

    mockSaveSettings
      .mockRejectedValueOnce(new Error('storage denied'))
      .mockResolvedValueOnce(undefined)

    const persistenceListener = jest.fn()
    const unsubscribe = subscribeToPersistenceErrors(persistenceListener)

    saveSettings({ ...getSettings(), language: 'en' })
    await expect(flushPendingStoreWrites()).rejects.toThrow('storage denied')
    expect(persistenceListener).toHaveBeenCalledWith(expect.objectContaining({ message: 'storage denied' }))

    saveSettings({ ...getSettings(), language: 'zh' })
    await expect(flushPendingStoreWrites()).resolves.toBeUndefined()
    unsubscribe()
  })

  it('returns a book to unread after its last learning activity is deleted', async () => {
    resetStoreCache()
    mockInitDB.mockResolvedValue(undefined)
    mockGetSettings.mockResolvedValue({
      apiKey: '', language: 'zh', theme: 'light', hideApiKeyAlert: false, quotes: []
    })
    mockGetBooks.mockResolvedValue([])
    mockSaveBook.mockResolvedValue(undefined)
    await initializeStore()

    const book = addBook('Rollback Status')
    updateBook(book.id, {
      noteRecords: [{ id: 'note-1', type: 'note', content: '学习笔记', createdAt: 1 }]
    })
    expect(getBooks()[0].status).toBe('reading')

    updateBook(book.id, { noteRecords: [] })
    expect(getBooks()[0].status).toBe('unread')
  })

  it('removes completion and score when the qualifying practice records are deleted', async () => {
    resetStoreCache()
    mockInitDB.mockResolvedValue(undefined)
    mockGetSettings.mockResolvedValue({
      apiKey: '', language: 'zh', theme: 'light', hideApiKeyAlert: false, quotes: []
    })
    mockGetBooks.mockResolvedValue([])
    mockSaveBook.mockResolvedValue(undefined)
    await initializeStore()

    const book = addBook('Completion Rollback')
    const teaching = addPracticeRecord(book.id, {
      content: '教学内容',
      aiReview: '点评',
      scores: { accuracy: 80, completeness: 80, clarity: 80, overall: 80 },
      passed: true
    })
    const qa = addQAPracticeRecord(book.id, {
      allPassed: true,
      questions: [
        { persona: 'elementary', personaName: '初学者', question: '问题一', score: 80, passed: true },
        { persona: 'professional', personaName: '职场新人', question: '问题二', score: 80, passed: true },
        { persona: 'scientist', personaName: '科学家', question: '问题三', score: 80, passed: true }
      ]
    })
    expect(getBooks()[0]).toMatchObject({ status: 'finished', bestScore: 80 })

    deleteQAPracticeRecord(book.id, qa.id)
    expect(getBooks()[0]).toMatchObject({ status: 'reading', bestScore: 0 })

    deletePracticeRecord(book.id, teaching.id)
    expect(getBooks()[0]).toMatchObject({ status: 'unread', bestScore: 0 })
  })
})

describe('final score eligibility', () => {
  const baseBook: Book = {
    id: 'book-score',
    name: 'Score Test',
    status: 'reading',
    currentPhase: 1,
    noteRecords: [],
    responses: {},
    practiceRecords: [{
      id: 'teaching-1',
      bookId: 'book-score',
      content: '教学内容',
      aiReview: '点评',
      scores: { accuracy: 90, completeness: 90, clarity: 90, overall: 90 },
      passed: true,
      createdAt: 1
    }],
    qaPracticeRecords: [],
    bestScore: 0,
    createdAt: 1,
    updatedAt: 1
  }

  it('does not calculate a final score from an incomplete Q&A record', () => {
    const book: Book = {
      ...baseBook,
      qaPracticeRecords: [{
        id: 'qa-1',
        bookId: 'book-score',
        allPassed: false,
        createdAt: 1,
        updatedAt: 1,
        questions: [
          { persona: 'elementary', personaName: '初学者', question: '问题一', score: 90, passed: true },
          { persona: 'professional', personaName: '职场新人', question: '问题二', score: 80, passed: true },
          { persona: 'scientist', personaName: '科学家', question: '问题三', score: 40, passed: false }
        ]
      }]
    }

    expect(calculateFinalScore(book)).toBe(0)
  })

  it('does not trust a forged allPassed flag or an incomplete question set', () => {
    const forgedRecord = {
      id: 'qa-forged',
      bookId: 'book-score',
      allPassed: true,
      createdAt: 1,
      updatedAt: 1,
      questions: [
        { persona: 'elementary' as const, personaName: '初学者', question: '问题一', score: 90, passed: true },
        { persona: 'professional' as const, personaName: '职场新人', question: '问题二', score: 90, passed: true }
      ]
    }

    expect(isQAPracticeRecordComplete(forgedRecord)).toBe(false)
    expect(calculateFinalScore({ ...baseBook, qaPracticeRecords: [forgedRecord] })).toBe(0)
  })

  it('calculates a final score after every question in a Q&A record passes', () => {
    const book: Book = {
      ...baseBook,
      qaPracticeRecords: [{
        id: 'qa-1',
        bookId: 'book-score',
        allPassed: true,
        createdAt: 1,
        updatedAt: 1,
        questions: [
          { persona: 'elementary', personaName: '初学者', question: '问题一', score: 70, passed: true },
          { persona: 'professional', personaName: '职场新人', question: '问题二', score: 80, passed: true },
          { persona: 'scientist', personaName: '科学家', question: '问题三', score: 90, passed: true }
        ]
      }]
    }

    expect(calculateFinalScore(book)).toBe(85)
  })
})
