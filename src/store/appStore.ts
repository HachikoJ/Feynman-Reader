import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AppSettings, Book, getSettings, saveSettings, getBooks, saveBooks } from '@/lib/store'

// ============================================================================
// Zustand 应用状态管理 (P1 修复)
// ============================================================================

// 应用状态接口
interface AppState {
  // 设置相关
  settings: AppSettings
  updateSettings: (settings: Partial<AppSettings>) => void
  resetSettings: () => void

  // 书籍相关
  books: Book[]
  setBooks: (books: Book[]) => void
  addBook: (book: Book) => void
  updateBook: (id: string, updates: Partial<Book>) => void
  deleteBook: (id: string) => void
  getBook: (id: string) => Book | undefined

  // UI 状态
  view: 'bookshelf' | 'reading' | 'settings'
  setView: (view: 'bookshelf' | 'reading' | 'settings') => void
  selectedBook: Book | null
  setSelectedBook: (book: Book | null) => void
  showApiKeyAlert: boolean
  setShowApiKeyAlert: (show: boolean) => void
  showOnboarding: boolean
  setShowOnboarding: (show: boolean) => void

  // 加载状态
  mounted: boolean
  setMounted: (mounted: boolean) => void
  bookshelfKey: number
  refreshBookshelf: () => void
}

// 默认设置
const defaultSettings: AppSettings = {
  apiKey: '',
  language: 'zh',
  theme: 'cyber',
  hideApiKeyAlert: false,
  quotes: [],
  quotesInitialized: false
}

// 创建 Zustand store
export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // ========== 设置 ==========
      settings: defaultSettings,
      updateSettings: (updates) => {
        const newSettings = { ...get().settings, ...updates }
        set({ settings: newSettings })
        saveSettings(newSettings)

        // 应用主题
        if (updates.theme) {
          document.documentElement.setAttribute('data-theme', newSettings.theme)
        }
      },
      resetSettings: () => {
        set({ settings: defaultSettings })
        saveSettings(defaultSettings)
        document.documentElement.setAttribute('data-theme', defaultSettings.theme)
      },

      // ========== 书籍 ==========
      books: [],
      setBooks: (books) => {
        set({ books })
        saveBooks(books)
      },
      addBook: (book) => {
        const newBooks = [book, ...get().books]
        set({ books: newBooks })
        saveBooks(newBooks)
      },
      updateBook: (id, updates) => {
        const books = get().books
        const index = books.findIndex(b => b.id === id)
        if (index !== -1) {
          const updatedBooks = [...books]
          updatedBooks[index] = { ...books[index], ...updates, updatedAt: Date.now() }
          set({ books: updatedBooks })
          saveBooks(updatedBooks)
        }
      },
      deleteBook: (id) => {
        const newBooks = get().books.filter(b => b.id !== id)
        set({ books: newBooks })
        saveBooks(newBooks)
      },
      getBook: (id) => {
        return get().books.find(b => b.id === id)
      },

      // ========== UI 状态 ==========
      view: 'bookshelf',
      setView: (view) => set({ view }),
      selectedBook: null,
      setSelectedBook: (book) => set({ selectedBook: book }),
      showApiKeyAlert: false,
      setShowApiKeyAlert: (show) => set({ showApiKeyAlert: show }),
      showOnboarding: false,
      setShowOnboarding: (show) => set({ showOnboarding: show }),

      // ========== 加载状态 ==========
      mounted: false,
      setMounted: (mounted) => set({ mounted }),
      bookshelfKey: 0,
      refreshBookshelf: () => set((state) => ({ bookshelfKey: state.bookshelfKey + 1 }))
    }),
    {
      name: 'feynman-app-storage',
      // 只持久化部分状态
      partialize: (state) => ({
        settings: state.settings,
        books: state.books,
        view: state.view
      }),
      // 从 localStorage 初始化
      onRehydrateStorage: () => (state) => {
        if (state) {
          // 从 localStorage 同步数据
          const savedSettings = getSettings()
          const savedBooks = getBooks()

          state.settings = savedSettings
          state.books = savedBooks
          state.mounted = true

          // 应用主题
          if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-theme', savedSettings.theme)
          }
        }
      }
    }
  )
)

// ============================================================================
// 选择器 hooks (优化性能)
// ============================================================================

export const useSettings = () => useAppStore((state) => state.settings)
export const useBooks = () => useAppStore((state) => state.books)
export const useView = () => useAppStore((state) => state.view)
export const useSelectedBook = () => useAppStore((state) => state.selectedBook)
export const useMounted = () => useAppStore((state) => state.mounted)

// ============================================================================
// 操作 hooks (简化使用)
// ============================================================================

export const useAppActions = () => ({
  updateSettings: useAppStore((state) => state.updateSettings),
  resetSettings: useAppStore((state) => state.resetSettings),
  setBooks: useAppStore((state) => state.setBooks),
  addBook: useAppStore((state) => state.addBook),
  updateBook: useAppStore((state) => state.updateBook),
  deleteBook: useAppStore((state) => state.deleteBook),
  getBook: useAppStore((state) => state.getBook),
  setView: useAppStore((state) => state.setView),
  setSelectedBook: useAppStore((state) => state.setSelectedBook),
  setShowApiKeyAlert: useAppStore((state) => state.setShowApiKeyAlert),
  setShowOnboarding: useAppStore((state) => state.setShowOnboarding),
  setMounted: useAppStore((state) => state.setMounted),
  refreshBookshelf: useAppStore((state) => state.refreshBookshelf)
})
