/** @jest-environment node */

jest.mock('../db', () => ({
  initDB: jest.fn(),
  getSettings: jest.fn(),
  saveSettings: jest.fn(),
  getBooks: jest.fn(),
  saveBooks: jest.fn(),
  saveBook: jest.fn(),
  deleteBookById: jest.fn()
}))

import * as db from '../db'
import {
  getBooks,
  getSettings,
  initializeStore,
  addBook,
  deleteBook,
  resetStoreCache,
  saveBooks,
  saveSettings,
  updateBook,
  calculateFinalScore,
  type AppSettings,
  type Book
} from '../store'

const mockInitDB = db.initDB as jest.MockedFunction<typeof db.initDB>
const mockGetSettings = db.getSettings as jest.MockedFunction<typeof db.getSettings>
const mockSaveSettings = db.saveSettings as jest.MockedFunction<typeof db.saveSettings>
const mockGetBooks = db.getBooks as jest.MockedFunction<typeof db.getBooks>
const mockSaveBooks = db.saveBooks as jest.MockedFunction<typeof db.saveBooks>
const mockSaveBook = db.saveBook as jest.MockedFunction<typeof db.saveBook>
const mockDeleteBookById = db.deleteBookById as jest.MockedFunction<typeof db.deleteBookById>

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
    resetStoreCache()
    mockInitDB.mockResolvedValue(undefined)
    mockGetSettings.mockResolvedValue({
      apiKey: '', language: 'zh', theme: 'cyber', hideApiKeyAlert: false, quotes: []
    })
    mockGetBooks.mockResolvedValue([])
    mockSaveBook.mockResolvedValue(undefined)
    mockDeleteBookById.mockResolvedValue(undefined)

    await initializeStore()
    mockSaveBooks.mockClear()
    const book = addBook('Single write book')
    updateBook(book.id, { status: 'reading' })
    deleteBook(book.id)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(getBooks()).toEqual([])
    expect(mockSaveBooks).not.toHaveBeenCalled()
    expect(mockSaveBook).toHaveBeenCalledTimes(2)
    expect(mockDeleteBookById).toHaveBeenCalledWith(book.id)
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
