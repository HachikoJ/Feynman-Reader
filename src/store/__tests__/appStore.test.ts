/** @jest-environment node */

jest.mock('@/lib/store', () => ({
  saveSettings: jest.fn(),
  saveBooks: jest.fn()
}))

import { useAppStore } from '../appStore'

describe('appStore', () => {
  beforeEach(() => {
    // Reset the store before each test
    const { resetSettings } = useAppStore.getState()
    resetSettings()
    useAppStore.getState().setBooks([])
  })

  describe('Settings Management', () => {
    it('should have default settings', () => {
      expect(useAppStore.getState().settings.language).toBe('zh')
      expect(useAppStore.getState().settings.theme).toBe('light')
    })

    it('should update settings', () => {
      useAppStore.getState().updateSettings({ language: 'en' })

      const settings = useAppStore.getState().settings
      expect(settings.language).toBe('en')
    })

    it('should reset settings to defaults', () => {
      useAppStore.getState().updateSettings({ language: 'en', theme: 'dark' })
      useAppStore.getState().resetSettings()

      const settings = useAppStore.getState().settings
      expect(settings.language).toBe('zh')
      expect(settings.theme).toBe('light')
    })
  })

  describe('Books Management', () => {
    const mockBook = {
      id: '1',
      name: 'Test Book',
      author: 'Test Author',
      status: 'unread' as const,
      currentPhase: 0,
      noteRecords: [],
      responses: {},
      practiceRecords: [],
      qaPracticeRecords: [],
      bestScore: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    it('should add a book', () => {
      useAppStore.getState().addBook(mockBook)

      const books = useAppStore.getState().books
      expect(books).toHaveLength(1)
      expect(books[0].name).toBe('Test Book')
    })

    it('should update a book', () => {
      useAppStore.getState().addBook(mockBook)
      useAppStore.getState().updateBook('1', { status: 'reading' })

      const book = useAppStore.getState().getBook('1')
      expect(book?.status).toBe('reading')
    })

    it('should delete a book', () => {
      useAppStore.getState().addBook(mockBook)
      useAppStore.getState().deleteBook('1')

      const books = useAppStore.getState().books
      expect(books).toHaveLength(0)
    })

    it('should get a book by id', () => {
      useAppStore.getState().addBook(mockBook)

      const book = useAppStore.getState().getBook('1')
      expect(book).toBeDefined()
      expect(book?.name).toBe('Test Book')
    })

    it('should return undefined for non-existent book', () => {
      const book = useAppStore.getState().getBook('nonexistent')
      expect(book).toBeUndefined()
    })
  })

  describe('UI State', () => {
    it('should change view', () => {
      useAppStore.getState().setView('settings')

      expect(useAppStore.getState().view).toBe('settings')
    })

    it('should set selected book', () => {
      const mockBook = {
        id: '1',
        name: 'Test',
        status: 'unread' as const,
        currentPhase: 0,
        noteRecords: [],
        responses: {},
        practiceRecords: [],
        qaPracticeRecords: [],
        bestScore: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      useAppStore.getState().setSelectedBook(mockBook)

      expect(useAppStore.getState().selectedBook).toEqual(mockBook)
    })

    it('should refresh bookshelf key', () => {
      const initialKey = useAppStore.getState().bookshelfKey
      useAppStore.getState().refreshBookshelf()

      expect(useAppStore.getState().bookshelfKey).toBe(initialKey + 1)
    })
  })
})
