import { renderHook, act } from '@testing-library/react'
import { useAppStore, useSettings, useBooks, useAppActions } from '../appStore'

describe('appStore', () => {
  beforeEach(() => {
    // Reset the store before each test
    const { resetSettings } = useAppStore.getState()
    resetSettings()
    useAppStore.getState().setBooks([])
  })

  describe('Settings Management', () => {
    it('should have default settings', () => {
      const { result } = renderHook(() => useSettings())
      expect(result.current.language).toBe('zh')
      expect(result.current.theme).toBe('cyber')
    })

    it('should update settings', () => {
      const { result } = renderHook(() => useAppActions())

      act(() => {
        result.current.updateSettings({ language: 'en' })
      })

      const settings = useAppStore.getState().settings
      expect(settings.language).toBe('en')
    })

    it('should reset settings to defaults', () => {
      const { result } = renderHook(() => useAppActions())

      act(() => {
        result.current.updateSettings({ language: 'en', theme: 'dark' })
      })

      act(() => {
        result.current.resetSettings()
      })

      const settings = useAppStore.getState().settings
      expect(settings.language).toBe('zh')
      expect(settings.theme).toBe('cyber')
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
      const { result } = renderHook(() => useAppActions())

      act(() => {
        result.current.addBook(mockBook)
      })

      const books = useAppStore.getState().books
      expect(books).toHaveLength(1)
      expect(books[0].name).toBe('Test Book')
    })

    it('should update a book', () => {
      const { result } = renderHook(() => useAppActions())

      act(() => {
        result.current.addBook(mockBook)
      })

      act(() => {
        result.current.updateBook('1', { status: 'reading' })
      })

      const book = useAppStore.getState().getBook('1')
      expect(book?.status).toBe('reading')
    })

    it('should delete a book', () => {
      const { result } = renderHook(() => useAppActions())

      act(() => {
        result.current.addBook(mockBook)
      })

      act(() => {
        result.current.deleteBook('1')
      })

      const books = useAppStore.getState().books
      expect(books).toHaveLength(0)
    })

    it('should get a book by id', () => {
      const { result } = renderHook(() => useAppActions())

      act(() => {
        result.current.addBook(mockBook)
      })

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
      const { result } = renderHook(() => useAppActions())

      act(() => {
        result.current.setView('settings')
      })

      expect(useAppStore.getState().view).toBe('settings')
    })

    it('should set selected book', () => {
      const { result } = renderHook(() => useAppActions())
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

      act(() => {
        result.current.setSelectedBook(mockBook)
      })

      expect(useAppStore.getState().selectedBook).toEqual(mockBook)
    })

    it('should refresh bookshelf key', () => {
      const initialKey = useAppStore.getState().bookshelfKey
      const { result } = renderHook(() => useAppActions())

      act(() => {
        result.current.refreshBookshelf()
      })

      expect(useAppStore.getState().bookshelfKey).toBe(initialKey + 1)
    })
  })
})
