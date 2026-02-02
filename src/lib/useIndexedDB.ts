/**
 * React Hook for IndexedDB Data Access
 * 提供响应式的数据访问，自动处理异步加载
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { logger } from './logger'
import type { AppSettings, Book } from './indexedDB'
import {
  initDB,
  getSettings,
  saveSettings,
  getBooks,
  saveBooks,
  getBook,
  addBook,
  updateBook,
  deleteBook,
  searchBooks,
  filterBooksByStatus,
  filterBooksByTag,
  filterBooksByCategory,
  sortBooks,
  type NoteRecord,
  type PracticeRecord,
  type QAPracticeRecord
} from './db'

// ============================================================================
// Settings Hook
// ============================================================================

export interface UseSettingsResult {
  settings: AppSettings | null
  loading: boolean
  error: Error | null
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>
  resetSettings: () => Promise<void>
  refresh: () => Promise<void>
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const initializing = useRef(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getSettings()
      setSettings(data)
    } catch (e) {
      setError(e as Error)
    } finally {
      setLoading(false)
    }
  }, [])

  // 初始化时加载
  useEffect(() => {
    if (initializing.current) return
    initializing.current = true

    initDB()
      .then(() => load())
      .catch(setError)
  }, [load])

  const updateSettings = useCallback(async (updates: Partial<AppSettings>) => {
    if (!settings) return

    try {
      const newSettings = { ...settings, ...updates }
      await saveSettings(newSettings)
      setSettings(newSettings)

      // 应用主题
      if (updates.theme && typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', newSettings.theme)
      }
    } catch (e) {
      setError(e as Error)
      throw e
    }
  }, [settings])

  const resetSettings = useCallback(async () => {
    try {
      const defaultSettings: AppSettings = {
        apiKey: '',
        language: 'zh',
        theme: 'cyber',
        hideApiKeyAlert: false,
        quotes: [],
        quotesInitialized: false
      }
      await saveSettings(defaultSettings)
      setSettings(defaultSettings)

      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', defaultSettings.theme)
      }
    } catch (e) {
      setError(e as Error)
      throw e
    }
  }, [])

  return {
    settings,
    loading,
    error,
    updateSettings,
    resetSettings,
    refresh: load
  }
}

// ============================================================================
// Books Hook
// ============================================================================

export interface UseBooksResult {
  books: Book[]
  loading: boolean
  error: Error | null
  refresh: () => Promise<void>
  getBook: (id: string) => Promise<Book | undefined>
  addBook: (name: string, author?: string, cover?: string, description?: string, tags?: any[], documentContent?: string) => Promise<Book>
  updateBook: (id: string, updates: Partial<Book>) => Promise<void>
  deleteBook: (id: string) => Promise<void>
  searchBooks: (query: string) => Promise<Book[]>
  filterByStatus: (status: string) => Promise<Book[]>
  filterByTag: (tagName: string) => Promise<Book[]>
  filterByCategory: (category: string) => Promise<Book[]>
  sortBooks: (sortBy: 'updatedAt' | 'createdAt' | 'name' | 'author' | 'bestScore', order?: 'asc' | 'desc') => Promise<Book[]>
}

export function useBooks(): UseBooksResult {
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const initializing = useRef(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getBooks()
      setBooks(data)
    } catch (e) {
      setError(e as Error)
    } finally {
      setLoading(false)
    }
  }, [])

  // 初始化时加载
  useEffect(() => {
    if (initializing.current) return
    initializing.current = true

    initDB()
      .then(() => load())
      .catch(setError)
  }, [load])

  const getBookById = useCallback(async (id: string) => {
    return await getBook(id)
  }, [])

  const addBookItem = useCallback(async (
    name: string,
    author?: string,
    cover?: string,
    description?: string,
    tags?: any[],
    documentContent?: string
  ) => {
    try {
      const newBook = await addBook(name, author, cover, description, tags, documentContent)
      setBooks(prev => [newBook, ...prev])
      return newBook
    } catch (e) {
      setError(e as Error)
      throw e
    }
  }, [])

  const updateBookItem = useCallback(async (id: string, updates: Partial<Book>) => {
    try {
      await updateBook(id, updates)
      setBooks(prev => prev.map(b => b.id === id ? { ...b, ...updates, updatedAt: Date.now() } : b))
    } catch (e) {
      setError(e as Error)
      throw e
    }
  }, [])

  const deleteBookItem = useCallback(async (id: string) => {
    try {
      await deleteBook(id)
      setBooks(prev => prev.filter(b => b.id !== id))
    } catch (e) {
      setError(e as Error)
      throw e
    }
  }, [])

  const search = useCallback(async (query: string) => {
    return await searchBooks(query)
  }, [])

  const filterByStatus = useCallback(async (status: string) => {
    return await filterBooksByStatus(status)
  }, [])

  const filterByTag = useCallback(async (tagName: string) => {
    return await filterBooksByTag(tagName)
  }, [])

  const filterByCategory = useCallback(async (category: string) => {
    return await filterBooksByCategory(category)
  }, [])

  const sort = useCallback(async (
    sortBy: 'updatedAt' | 'createdAt' | 'name' | 'author' | 'bestScore',
    order: 'asc' | 'desc' = 'desc'
  ) => {
    return await sortBooks(sortBy, order)
  }, [])

  return {
    books,
    loading,
    error,
    refresh: load,
    getBook: getBookById,
    addBook: addBookItem,
    updateBook: updateBookItem,
    deleteBook: deleteBookItem,
    searchBooks: search,
    filterByStatus,
    filterByTag,
    filterByCategory,
    sortBooks: sort
  }
}

// ============================================================================
// Single Book Hook
// ============================================================================

export interface UseBookResult {
  book: Book | null
  loading: boolean
  error: Error | null
  refresh: () => Promise<void>
}

export function useBook(bookId: string): UseBookResult {
  const [book, setBook] = useState<Book | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    if (!bookId) {
      setBook(null)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const data = await getBook(bookId)
      setBook(data || null)
    } catch (e) {
      setError(e as Error)
    } finally {
      setLoading(false)
    }
  }, [bookId])

  useEffect(() => {
    initDB().then(() => load()).catch(setError)
  }, [load])

  return {
    book,
    loading,
    error,
    refresh: load
  }
}

// ============================================================================
// Statistics Hook
// ============================================================================

export interface UseStatsResult {
  totalBooks: number
  readingBooks: number
  finishedBooks: number
  totalNotes: number
  totalPractices: number
  avgScore: number
  loading: boolean
}

export function useStats(): UseStatsResult {
  const [stats, setStats] = useState<UseStatsResult>({
    totalBooks: 0,
    readingBooks: 0,
    finishedBooks: 0,
    totalNotes: 0,
    totalPractices: 0,
    avgScore: 0,
    loading: true
  })

  useEffect(() => {
    let mounted = true

    initDB()
      .then(() => getBooks())
      .then(books => {
        if (!mounted) return

        const totalBooks = books.length
        const readingBooks = books.filter(b => b.status === 'reading').length
        const finishedBooks = books.filter(b => b.status === 'finished').length
        const totalNotes = books.reduce((sum, b) => sum + (b.noteRecords?.length || 0), 0)
        const totalPractices = books.reduce((sum, b) => sum + (b.practiceRecords?.length || 0), 0)
        const avgScore = totalBooks > 0
          ? Math.round(books.reduce((sum, b) => sum + b.bestScore, 0) / totalBooks)
          : 0

        setStats({
          totalBooks,
          readingBooks,
          finishedBooks,
          totalNotes,
          totalPractices,
          avgScore,
          loading: false
        })
      })
      .catch(e => {
        logger.error('Failed to load stats:', e)
        if (mounted) {
          setStats(prev => ({ ...prev, loading: false }))
        }
      })

    return () => {
      mounted = false
    }
  }, [])

  return stats
}

// ============================================================================
// Database Info Hook
// ============================================================================

export interface UseDBInfoResult {
  booksCount: number
  dbSize: string
  dataVersion: number
  migratedAt: number | null
  usingIndexedDB: boolean
  loading: boolean
}

export function useDBInfo(): UseDBInfoResult {
  const [info, setInfo] = useState<UseDBInfoResult>({
    booksCount: 0,
    dbSize: '0 B',
    dataVersion: 1,
    migratedAt: null,
    usingIndexedDB: false,
    loading: true
  })

  useEffect(() => {
    let mounted = true

    async function loadInfo() {
      try {
        await initDB()

        // 检查是否使用 IndexedDB
        const hasLocalStorageData =
          typeof window !== 'undefined' &&
          (localStorage.getItem('feynman-settings') || localStorage.getItem('feynman-books'))

        const migrationFlag = typeof window !== 'undefined'
          ? localStorage.getItem('feynman-indexedb-migrated')
          : null

        const usingIndexedDB = migrationFlag === 'true' || !hasLocalStorageData

        if (usingIndexedDB) {
          const { getDatabaseStats } = await import('./db')
          const stats = await getDatabaseStats()

          if (mounted) {
            setInfo({
              booksCount: stats.booksCount,
              dbSize: stats.dbSize.formatted,
              dataVersion: stats.dataVersion,
              migratedAt: stats.migratedAt,
              usingIndexedDB: true,
              loading: false
            })
          }
        } else {
          if (mounted) {
            setInfo({
              booksCount: 0,
              dbSize: 'Using LocalStorage',
              dataVersion: 1,
              migratedAt: null,
              usingIndexedDB: false,
              loading: false
            })
          }
        }
      } catch (e) {
        logger.error('Failed to load DB info:', e)
        if (mounted) {
          setInfo(prev => ({ ...prev, loading: false }))
        }
      }
    }

    loadInfo()

    return () => {
      mounted = false
    }
  }, [])

  return info
}

// ============================================================================
// Initialization Hook
// ============================================================================

export function useIndexedDBInit(): {
  initialized: boolean
  migrating: boolean
  error: Error | null
} {
  const [state, setState] = useState<{
    initialized: boolean
    migrating: boolean
    error: Error | null
  }>({
    initialized: false,
    migrating: false,
    error: null
  })

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        setState({ initialized: false, migrating: true, error: null })

        await initDB()

        if (mounted) {
          setState({ initialized: true, migrating: false, error: null })
        }
      } catch (e) {
        if (mounted) {
          setState({ initialized: false, migrating: false, error: e as Error })
        }
      }
    }

    init()

    return () => {
      mounted = false
    }
  }, [])

  return state
}
