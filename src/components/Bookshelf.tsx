'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Book,
  BookStatus,
  BookTag,
  addBook,
  deleteBook,
  flushPendingStoreWrites,
  getAllCategories,
  getAllTags,
  getBookOrganizationSnapshot,
  getBooks,
  getSettings,
  reloadBookFromPersistence,
  reloadBookOrganizationFromPersistence,
  reloadBooksFromPersistence,
  restoreBook,
  restoreBookOrganizationSnapshot,
  updateBook
} from '@/lib/store'
import { logger } from '@/lib/logger'
import { Language, t } from '@/lib/i18n'
import { LEARNING_PHASES } from '@/lib/feynman-prompts'
import { AI_OUTPUT_INCOMPLETE, createDeepSeekClient, generateBookTags } from '@/lib/deepseek'
import { AI_REQUEST_CANCELLED, AI_TASK_BUSY } from '@/lib/aiRequestManager'
import { AlertCircle, ChartNoAxesCombined, ChevronDown, ChevronRight, LayoutGrid, List, Tag, X } from 'lucide-react'
import DocumentUpload from './DocumentUpload'
import { validateBookName, validateAuthorName, validateContent, sanitizeTextInput, detectMaliciousContent } from '@/lib/validation'
import { undoRedoManager, createDeleteBookAction, createBatchDeleteBooksAction } from '@/lib/undoRedo'
import { getSafeImageSrc } from '@/lib/safeUrl'
import { MAX_TAG_LENGTH } from '@/lib/dataLimits'
import AppIcon from './AppIcon'
import BookListManager from './BookListManager'
import { LibraryAnalytics } from './Charts'
import MobileSwipeCard from './MobileSwipeCard'
import { VirtualList } from './VirtualList'
import { showAppAlert } from '@/lib/appDialog'
import { tokendanceRecoveryMessage } from '@/lib/tokendance'

interface Props {
  lang: Language
  onSelectBook: (book: Book) => void
}

type TabFilter = 'all' | BookStatus
type ViewMode = 'grid' | 'list'

const categoryLabelsEn: Record<string, string> = {
  '社科': 'Social Science',
  '心理': 'Psychology',
  '文学': 'Literature',
  '科技': 'Technology',
  '经管': 'Business',
  '历史': 'History',
  '哲学': 'Philosophy',
  '艺术': 'Arts',
  '生活': 'Lifestyle',
  '教育': 'Education',
  '其他': 'Other'
}

export function getBookshelfProgressPercentage(book: Pick<Book, 'currentPhase'>): number {
  return Math.min(100, Math.max(0, (book.currentPhase / LEARNING_PHASES.length) * 100))
}

export default function Bookshelf({ lang, onSelectBook }: Props) {
  const [books, setBooks] = useState<Book[]>([])
  const [activeTab, setActiveTab] = useState<TabFilter>('all')

  // 分类列表
  const categories = ['社科', '心理', '文学', '科技', '经管', '历史', '哲学', '艺术', '生活', '教育', '其他']
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingBook, setEditingBook] = useState<Book | null>(null)
  const [newBookName, setNewBookName] = useState('')
  const [newBookAuthor, setNewBookAuthor] = useState('')
  const [newBookDesc, setNewBookDesc] = useState('')
  const [newBookCover, setNewBookCover] = useState('')
  const [showCharts, setShowCharts] = useState(false)
  const [showBookLists, setShowBookLists] = useState(false)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [generatingTags, setGeneratingTags] = useState(false)
  const [tagGenerationError, setTagGenerationError] = useState<string | null>(null)
  const [showTagFilter, setShowTagFilter] = useState(false)
  const [showDocumentUpload, setShowDocumentUpload] = useState(false)
  const [deleteConfirmBook, setDeleteConfirmBook] = useState<Book | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // P0 新增：搜索功能
  const [searchQuery, setSearchQuery] = useState('')
  const [searchHistory, setSearchHistory] = useState<string[]>([])
  const [showSearchHistory, setShowSearchHistory] = useState(false)
  
  // 批量管理相关状态
  const [batchMode, setBatchMode] = useState(false)
  const [selectedBooks, setSelectedBooks] = useState<Set<string>>(new Set())
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false)
  
  // 标签管理相关状态
  const [editingTags, setEditingTags] = useState<BookTag[]>([])
  const [newTagName, setNewTagName] = useState('')
  const [newTagCategory, setNewTagCategory] = useState('社科')
  const [customCategory, setCustomCategory] = useState('') // 自定义分类名
  const [showTagManagement, setShowTagManagement] = useState(false)
  const [editingGlobalTag, setEditingGlobalTag] = useState<BookTag | null>(null)
  const [newGlobalTagName, setNewGlobalTagName] = useState('')
  const [newGlobalTagCategory, setNewGlobalTagCategory] = useState('')
  const [mutatingBooks, setMutatingBooks] = useState(false)
  const bookMutationInFlightRef = useRef(false)
  const [savingBook, setSavingBook] = useState(false)
  const bookSaveInFlightRef = useRef(false)
  const [tagToDelete, setTagToDelete] = useState<BookTag | null>(null)
  const [virtualListMetrics, setVirtualListMetrics] = useState({ itemHeight: 210, height: 640 })
  const getCategoryLabel = (category: string) => lang === 'zh' ? category : (categoryLabelsEn[category] || category)
  
  const descTextareaRef = useRef<HTMLTextAreaElement>(null)

  // 自动调整 textarea 高度
  const autoResizeTextarea = (textarea: HTMLTextAreaElement | null) => {
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = textarea.scrollHeight + 'px'
    }
  }

  const handleDescChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewBookDesc(e.target.value)
    autoResizeTextarea(e.target)
  }

  useEffect(() => {
    setBooks(getBooks())
  }, [])

  useEffect(() => {
    const updateVirtualListMetrics = () => {
      const mobile = window.innerWidth < 640
      setVirtualListMetrics({
        itemHeight: mobile ? 270 : 210,
        height: Math.max(420, Math.min(mobile ? 620 : 720, Math.round(window.innerHeight * 0.68)))
      })
    }
    updateVirtualListMetrics()
    window.addEventListener('resize', updateVirtualListMetrics)
    return () => window.removeEventListener('resize', updateVirtualListMetrics)
  }, [])

  // 当组件重新显示时，刷新书籍数据（确保显示最新的 bestScore）
  useEffect(() => {
    const refreshBooks = () => {
      setBooks(getBooks())
    }
    
    // 监听窗口焦点，当用户切换回来时刷新
    window.addEventListener('focus', refreshBooks)
    
    return () => {
      window.removeEventListener('focus', refreshBooks)
    }
  }, [])

  const filteredBooks = books
    .filter(b => {
      // 状态筛选
      if (activeTab !== 'all' && b.status !== activeTab) return false
      // 分类筛选
      if (selectedCategory && !b.tags?.some(tag => tag.category === selectedCategory)) return false
      // 标签筛选
      if (selectedTag && !b.tags?.some(tag => tag.name === selectedTag)) return false

      // P0 新增：搜索功能
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const searchableText = [
          b.name,
          b.author || '',
          b.description || '',
          ...(b.tags?.map(t => `${t.category} ${t.name}`) || [])
        ].join(' ').toLowerCase()

        // 简单的模糊搜索：检查所有搜索词是否都在文本中
        const searchTerms = query.split(/\s+/).filter(t => t)
        const matchesAllTerms = searchTerms.every(term => searchableText.includes(term))
        if (!matchesAllTerms) return false
      }

      return true
    })
    .sort((a, b) => {
      // 按更新时间降序排列（最近更新的在最前面）
      return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)
    })

  // P0 新增：搜索处理函数
  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    if (value.trim() && !searchHistory.includes(value.trim())) {
      setSearchHistory([value.trim(), ...searchHistory.slice(0, 9)]) // 保留最近10条
    }
    setShowSearchHistory(false)
  }

  const clearSearch = () => {
    setSearchQuery('')
    setShowSearchHistory(false)
  }

  // 获取所有标签和分类
  const allTags = getAllTags()
  const allCategories = getAllCategories()

  // AI 生成标签
  const handleGenerateTags = async (bookId: string, bookName: string, author?: string, description?: string) => {
    const settings = getSettings()
    if (!settings.apiKey) return

    setTagGenerationError(null)
    setGeneratingTags(true)
    let tagsGenerated = false
    try {
      const client = await createDeepSeekClient(settings.apiKey)
      const tags = await generateBookTags(
        client,
        bookName,
        author,
        description,
        { task: 'book-tags', bookId }
      )
      tagsGenerated = true
      if (tags.length > 0) {
        await flushPendingStoreWrites()
        updateBook(bookId, { tags })
        await flushPendingStoreWrites()
        setBooks(getBooks())
        
        // 如果正在编辑这本书，同时更新编辑状态
        if (editingBook && editingBook.id === bookId) {
          setEditingTags(tags)
        }
      }
    } catch (error) {
      const persistedBook = await reloadBookFromPersistence(bookId).catch(() => undefined)
      if (persistedBook) {
        setBooks(getBooks())
        if (editingBook?.id === bookId) setEditingTags(persistedBook.tags || [])
      }
      logger.error('生成标签失败:', error)
      const requestMessage = error instanceof Error && error.message === AI_REQUEST_CANCELLED
        ? (lang === 'zh' ? '已取消 AI 标签生成，书籍和原有标签不受影响。' : 'AI tag generation was cancelled. The book and existing tags were kept.')
        : error instanceof Error && error.message === AI_TASK_BUSY
          ? (lang === 'zh' ? '已有 AI 任务正在运行，请等待完成或先取消当前任务。' : 'Another AI task is running. Wait for it to finish or cancel it first.')
          : error instanceof Error && error.message === AI_OUTPUT_INCOMPLETE
            ? (lang === 'zh' ? 'AI 返回的标签不完整，系统已拦截，请稍后重试。' : 'The AI returned incomplete tags. Please try again later.')
            : tokendanceRecoveryMessage(error, lang)
      setTagGenerationError(requestMessage || (tagsGenerated
        ? (lang === 'zh'
            ? 'AI 标签已生成，但未能保存到本地，原标签已恢复。请检查浏览器存储后重试。'
            : 'AI tags were generated but could not be saved locally. The original tags were restored.')
        : (lang === 'zh'
            ? '书籍已保存，但 AI 标签生成失败。你可以稍后重试，或在编辑书籍时手动添加标签。'
            : 'The book was saved, but AI tag generation failed. Retry later or add tags manually while editing the book.')))
    } finally {
      setGeneratingTags(false)
    }
  }

  const handleAddBook = async () => {
    if (bookSaveInFlightRef.current) return
    // P0 新增：输入验证
    const nameValidation = validateBookName(newBookName)
    if (!nameValidation.valid) {
      await showBookFormError(nameValidation.error || (lang === 'zh' ? '书名无效' : 'Invalid book title'))
      return
    }

    const authorValidation = validateAuthorName(newBookAuthor)
    if (!authorValidation.valid) {
      await showBookFormError(authorValidation.error || (lang === 'zh' ? '作者名无效' : 'Invalid author name'))
      return
    }

    const descValidation = validateContent(newBookDesc, 500)
    if (!descValidation.valid) {
      await showBookFormError(descValidation.error || (lang === 'zh' ? '描述过长' : 'The description is too long'))
      return
    }

    // 检测恶意内容
    if (detectMaliciousContent(newBookName) || detectMaliciousContent(newBookAuthor) || detectMaliciousContent(newBookDesc)) {
      await showBookFormError(lang === 'zh' ? '输入包含不安全的内容，请修改后重试。' : 'The input contains unsafe content. Edit it and try again.')
      return
    }

    // 清理输入
    const cleanName = sanitizeTextInput(newBookName, 200)
    const cleanAuthor = newBookAuthor ? sanitizeTextInput(newBookAuthor, 100) : undefined
    const cleanDesc = newBookDesc ? sanitizeTextInput(newBookDesc, 500) : undefined

    let book: Book | undefined
    bookSaveInFlightRef.current = true
    setSavingBook(true)
    try {
      await flushPendingStoreWrites()
      book = addBook(cleanName, cleanAuthor, newBookCover || undefined, cleanDesc)
      await flushPendingStoreWrites()
      setBooks(getBooks())
      resetForm()
      setShowAddModal(false)
    } catch (error) {
      if (book) await reloadBookFromPersistence(book.id).catch(() => undefined)
      logger.error('Book save failed:', error)
      await showBookFormError(lang === 'zh' ? '书籍保存失败，填写内容已保留，请检查浏览器存储后重试。' : 'Saving failed. Your form content was kept; check browser storage and try again.')
      return
    } finally {
      bookSaveInFlightRef.current = false
      setSavingBook(false)
    }

    // 自动生成标签
    const settings = getSettings()
    if (settings.apiKey && book) {
      handleGenerateTags(book.id, book.name, book.author, book.description)
    }
  }

  const handleUpdateBook = async () => {
    if (!editingBook || bookSaveInFlightRef.current) return

    // P0 新增：输入验证
    const nameValidation = validateBookName(newBookName)
    if (!nameValidation.valid) {
      await showBookFormError(nameValidation.error || (lang === 'zh' ? '书名无效' : 'Invalid book title'))
      return
    }

    const authorValidation = validateAuthorName(newBookAuthor)
    if (!authorValidation.valid) {
      await showBookFormError(authorValidation.error || (lang === 'zh' ? '作者名无效' : 'Invalid author name'))
      return
    }

    const descValidation = validateContent(newBookDesc, 500)
    if (!descValidation.valid) {
      await showBookFormError(descValidation.error || (lang === 'zh' ? '描述过长' : 'The description is too long'))
      return
    }

    // 检测恶意内容
    if (detectMaliciousContent(newBookName) || detectMaliciousContent(newBookAuthor) || detectMaliciousContent(newBookDesc)) {
      await showBookFormError(lang === 'zh' ? '输入包含不安全的内容，请修改后重试。' : 'The input contains unsafe content. Edit it and try again.')
      return
    }

    // 清理输入
    const updates: Partial<Book> = {
      name: sanitizeTextInput(newBookName, 200),
      author: newBookAuthor ? sanitizeTextInput(newBookAuthor, 100) : undefined,
      description: newBookDesc ? sanitizeTextInput(newBookDesc, 500) : undefined,
      cover: newBookCover || undefined,
      tags: editingTags.length > 0 ? editingTags : undefined
    }
    bookSaveInFlightRef.current = true
    setSavingBook(true)
    try {
      await flushPendingStoreWrites()
      updateBook(editingBook.id, updates)
      await flushPendingStoreWrites()
      setBooks(getBooks())
      resetForm()
      setEditingBook(null)
    } catch (error) {
      const persistedBooks = await reloadBooksFromPersistence().catch(() => getBooks())
      setBooks(persistedBooks)
      logger.error('Book update failed:', error)
      await showBookFormError(lang === 'zh' ? '修改保存失败，填写内容已保留，请检查浏览器存储后重试。' : 'Saving changes failed. Your form content was kept; check browser storage and try again.')
    } finally {
      bookSaveInFlightRef.current = false
      setSavingBook(false)
    }
  }

  const resetForm = () => {
    setNewBookName('')
    setNewBookAuthor('')
    setNewBookDesc('')
    setNewBookCover('')
    setEditingTags([])
    setNewTagName('')
    setNewTagCategory('')
  }

  const openEditModal = (book: Book) => {
    setEditingBook(book)
    setNewBookName(book.name)
    setNewBookAuthor(book.author || '')
    setNewBookDesc(book.description || '')
    setNewBookCover(book.cover || '')
    setEditingTags(book.tags || [])
    
    // 等待 DOM 更新后调整 textarea 高度
    setTimeout(() => {
      autoResizeTextarea(descTextareaRef.current)
    }, 0)
  }

  const handleAddTag = () => {
    if (!newTagName.trim() || !newTagCategory.trim()) return
    
    // 如果选择了"其他"，使用自定义分类名
    const finalCategory = newTagCategory === '其他' 
      ? (customCategory.trim() || '其他')
      : newTagCategory
    
    const newTag: BookTag = {
      name: newTagName.trim(),
      category: finalCategory
    }
    
    // 检查是否已存在相同的标签
    const exists = editingTags.some(tag => 
      tag.name === newTag.name && tag.category === newTag.category
    )
    
    if (!exists) {
      setEditingTags([...editingTags, newTag])
    }
    
    setNewTagName('')
    setNewTagCategory('社科')
    setCustomCategory('')
  }

  const handleRemoveTag = (tagToRemove: BookTag) => {
    setEditingTags(editingTags.filter(tag => 
      !(tag.name === tagToRemove.name && tag.category === tagToRemove.category)
    ))
  }

  const showBookFormError = (message: string) => showAppAlert({
    title: lang === 'zh' ? '无法保存书籍' : 'Unable to save book',
    message,
    tone: 'warning'
  })

  const persistBookMutation = async (mutation: () => void) => {
    try {
      await flushPendingStoreWrites()
      mutation()
      await flushPendingStoreWrites()
      setBooks(getBooks())
    } catch (error) {
      const persistedBooks = await reloadBooksFromPersistence().catch(() => getBooks())
      await reloadBookOrganizationFromPersistence().catch(() => undefined)
      setBooks(persistedBooks)
      throw error
    }
  }

  // 全局标签管理函数
  const handleEditGlobalTag = (tag: BookTag) => {
    setEditingGlobalTag(tag)
    setNewGlobalTagName(tag.name)
    setNewGlobalTagCategory(tag.category)
  }

  const handleUpdateGlobalTag = async () => {
    if (!editingGlobalTag || bookMutationInFlightRef.current) return

    const cleanName = sanitizeTextInput(newGlobalTagName, MAX_TAG_LENGTH).trim()
    const cleanCategory = sanitizeTextInput(newGlobalTagCategory, MAX_TAG_LENGTH).trim()
    if (!cleanName || !cleanCategory) return
    if (detectMaliciousContent(cleanName) || detectMaliciousContent(cleanCategory)) {
      setTagGenerationError(lang === 'zh' ? '标签名称或分类包含不安全内容。' : 'The tag name or category contains unsafe content.')
      return
    }

    const oldTag = editingGlobalTag
    const newTag: BookTag = {
      name: cleanName,
      category: cleanCategory
    }

    bookMutationInFlightRef.current = true
    setMutatingBooks(true)
    setTagGenerationError(null)
    try {
      await persistBookMutation(() => {
        books.forEach(book => {
          if (!book.tags?.some(tag => tag.name === oldTag.name && tag.category === oldTag.category)) return
          const deduplicated = new Map<string, BookTag>()
          book.tags.forEach(tag => {
            const nextTag = tag.name === oldTag.name && tag.category === oldTag.category ? newTag : tag
            deduplicated.set(`${nextTag.category}\u0000${nextTag.name}`, nextTag)
          })
          updateBook(book.id, { tags: Array.from(deduplicated.values()) })
        })
      })
      setEditingGlobalTag(null)
      setNewGlobalTagName('')
      setNewGlobalTagCategory('')
    } catch (error) {
      logger.error('Global tag update failed:', error)
      setTagGenerationError(lang === 'zh'
        ? '标签修改未能完整保存，请刷新确认书架状态后重试。'
        : 'The tag change could not be fully saved. Refresh to confirm the bookshelf state before retrying.')
    } finally {
      bookMutationInFlightRef.current = false
      setMutatingBooks(false)
    }
  }

  const handleDeleteGlobalTag = (tag: BookTag) => {
    setTagToDelete(tag)
  }

  const confirmDeleteGlobalTag = async () => {
    if (!tagToDelete || bookMutationInFlightRef.current) return

    const deletingTag = tagToDelete
    bookMutationInFlightRef.current = true
    setMutatingBooks(true)
    setTagGenerationError(null)
    try {
      await persistBookMutation(() => {
        books.forEach(book => {
          if (!book.tags?.some(tag => tag.name === deletingTag.name && tag.category === deletingTag.category)) return
          const newTags = book.tags.filter(tag => !(tag.name === deletingTag.name && tag.category === deletingTag.category))
          updateBook(book.id, { tags: newTags.length > 0 ? newTags : undefined })
        })
      })
      setTagToDelete(null)
    } catch (error) {
      logger.error('Global tag deletion failed:', error)
      setTagGenerationError(lang === 'zh'
        ? '标签删除未能完整保存，请刷新确认书架状态后重试。'
        : 'The tag deletion could not be fully saved. Refresh to confirm the bookshelf state before retrying.')
    } finally {
      bookMutationInFlightRef.current = false
      setMutatingBooks(false)
    }
  }

  // 统计使用某个标签的书籍数量
  const countBooksWithTag = (tag: BookTag): number => {
    return books.filter(book => 
      book.tags?.some(t => t.name === tag.name && t.category === tag.category)
    ).length
  }

  const handleDeleteBook = (book: Book) => {
    setDeleteConfirmBook(book)
  }

  const confirmDelete = async () => {
    if (deleteConfirmBook && !bookMutationInFlightRef.current) {
      const organizationSnapshot = getBookOrganizationSnapshot(deleteConfirmBook.id)
      // P1 新增：使用撤销/重做管理器
      const action = createDeleteBookAction(
        deleteConfirmBook.id,
        deleteConfirmBook,
        (id) => persistBookMutation(() => deleteBook(id)),
        (book) => persistBookMutation(() => {
          restoreBook(book)
          restoreBookOrganizationSnapshot(book.id, organizationSnapshot)
        })
      )
      bookMutationInFlightRef.current = true
      setMutatingBooks(true)
      let succeeded = false
      try {
        succeeded = await undoRedoManager.execute(action)
      } finally {
        bookMutationInFlightRef.current = false
        setMutatingBooks(false)
      }
      if (succeeded) {
        setDeleteConfirmBook(null)
      } else {
        setTagGenerationError(lang === 'zh'
          ? '书籍删除失败，请刷新确认书架状态后重试。'
          : 'The book could not be deleted. Refresh to confirm the bookshelf state before retrying.')
      }
    }
  }

  const handleSelectBook = (book: Book) => {
    // 批量模式下不打开书籍，只切换选中状态
    if (batchMode) {
      toggleBookSelection(book.id)
      return
    }
    // 不再自动改变状态，只是打开书籍
    // 状态会在用户真正开始学习时改变（开始阶段学习、提交实践等）
    onSelectBook(book)
  }
  
  // 批量管理相关函数
  const toggleBatchMode = () => {
    setBatchMode(!batchMode)
    setSelectedBooks(new Set())
  }
  
  const toggleBookSelection = (bookId: string) => {
    const newSelected = new Set(selectedBooks)
    if (newSelected.has(bookId)) {
      newSelected.delete(bookId)
    } else {
      newSelected.add(bookId)
    }
    setSelectedBooks(newSelected)
  }
  
  const selectAll = () => {
    const allIds = new Set(filteredBooks.map(b => b.id))
    setSelectedBooks(allIds)
  }
  
  const deselectAll = () => {
    setSelectedBooks(new Set())
  }
  
  const handleBatchDelete = () => {
    setShowBatchDeleteConfirm(true)
  }
  
  const confirmBatchDelete = async () => {
    if (bookMutationInFlightRef.current || selectedBooks.size === 0) return
    // P1 新增：使用撤销/重做管理器
    const booksToDelete = books.filter(b => selectedBooks.has(b.id))
    if (booksToDelete.length === 0) return
    const organizationSnapshots = new Map(booksToDelete.map(book => [
      book.id,
      getBookOrganizationSnapshot(book.id)
    ]))
    const action = createBatchDeleteBooksAction(
      booksToDelete.map(b => ({ id: b.id, data: b })),
      (ids) => persistBookMutation(() => ids.forEach(id => deleteBook(id))),
      (restoredBooks) => persistBookMutation(() => {
        restoredBooks.forEach(book => restoreBook(book))
        restoredBooks.forEach(book => {
          const snapshot = organizationSnapshots.get(book.id)
          if (snapshot) restoreBookOrganizationSnapshot(book.id, snapshot)
        })
      })
    )
    bookMutationInFlightRef.current = true
    setMutatingBooks(true)
    let succeeded = false
    try {
      succeeded = await undoRedoManager.execute(action)
    } finally {
      bookMutationInFlightRef.current = false
      setMutatingBooks(false)
    }
    if (succeeded) {
      setSelectedBooks(new Set())
      setShowBatchDeleteConfirm(false)
      setBatchMode(false)
    } else {
      setTagGenerationError(lang === 'zh'
        ? '批量删除失败，请刷新确认书架状态后重试。'
        : 'Batch deletion failed. Refresh to confirm the bookshelf state before retrying.')
    }
  }

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (event) => {
      setNewBookCover(event.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const getStatusIcon = (status: BookStatus, size = 20, onBadge = false) => {
    switch (status) {
      case 'unread': return <AppIcon name="library" tone={onBadge ? 'inherit' : 'muted'} size={size} />
      case 'reading': return <AppIcon name="bookOpen" tone={onBadge ? 'inherit' : 'amber'} size={size} />
      case 'finished': return <AppIcon name="success" tone={onBadge ? 'inherit' : 'green'} size={size} />
    }
  }

  // 统计数据
  const stats = {
    total: books.length,
    unread: books.filter(b => b.status === 'unread').length,
    reading: books.filter(b => b.status === 'reading').length,
    finished: books.filter(b => b.status === 'finished').length,
    avgScore: books.filter(b => b.bestScore > 0).reduce((sum, b) => sum + b.bestScore, 0) / 
              (books.filter(b => b.bestScore > 0).length || 1)
  }

  const tabs: { key: TabFilter; label: string; count: number }[] = [
    { key: 'all', label: t(lang, 'bookshelf.tabs.all'), count: stats.total },
    { key: 'unread', label: t(lang, 'bookshelf.tabs.unread'), count: stats.unread },
    { key: 'reading', label: t(lang, 'bookshelf.tabs.reading'), count: stats.reading },
    { key: 'finished', label: t(lang, 'bookshelf.tabs.finished'), count: stats.finished }
  ]

  const priorityReviewBook = books
    .filter(book => book.currentPhase < LEARNING_PHASES.length || book.bestScore < 80)
    .sort((a, b) => {
      const aNeedsReview = a.qaPracticeRecords?.some(record => record.questions.some(question => question.score !== undefined && question.score < 70)) ? 0 : 1
      const bNeedsReview = b.qaPracticeRecords?.some(record => record.questions.some(question => question.score !== undefined && question.score < 70)) ? 0 : 1
      return aNeedsReview - bNeedsReview || (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)
    })[0]
  // Keep the review workbench useful even when every book is complete.
  const reviewBook = priorityReviewBook || [...books]
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))[0]

  const reviewPrompt = reviewBook?.qaPracticeRecords
    ?.flatMap(record => record.questions)
    .find(question => question.score !== undefined && question.score < 70)?.question

  const getNextLearningStep = (book: Book) => {
    if (reviewPrompt && book.id === reviewBook?.id) return lang === 'zh' ? '重新回答一道薄弱追问' : 'Retry one weak question'
    if (book.currentPhase < LEARNING_PHASES.length) return lang === 'zh' ? `完成第 ${book.currentPhase + 1} 阶段` : `Complete phase ${book.currentPhase + 1}`
    return lang === 'zh' ? '复述一次核心观点' : 'Retell one core idea'
  }

  const renderBookListRow = (book: Book, virtualized = false) => (
    <MobileSwipeCard
      key={book.id}
      disabled={batchMode}
      leftAction={{
        icon: 'bookOpen',
        label: lang === 'zh' ? '打开' : 'Open',
        color: 'bg-emerald-600',
        onAction: () => handleSelectBook(book)
      }}
      rightAction={{
        icon: 'edit',
        label: lang === 'zh' ? '编辑' : 'Edit',
        color: 'bg-amber-600',
        onAction: () => openEditModal(book)
      }}
      className={virtualized ? 'h-[258px] pb-3 sm:h-[198px]' : ''}
    >
      <div className={`card card-hover relative flex gap-3 sm:gap-4 ${virtualized ? 'h-full overflow-hidden' : ''}`}>
        {batchMode && (
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={selectedBooks.has(book.id)}
              onChange={() => toggleBookSelection(book.id)}
              className="h-5 w-5 cursor-pointer accent-[var(--accent)]"
              onClick={event => event.stopPropagation()}
            />
          </div>
        )}

        <button
          type="button"
          className="relative h-28 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent-secondary)]/20"
          onClick={() => handleSelectBook(book)}
          aria-label={lang === 'zh' ? `打开《${book.name}》` : `Open ${book.name}`}
        >
          {getSafeImageSrc(book.cover) ? (
            <img src={getSafeImageSrc(book.cover)!} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center">{getStatusIcon(book.status, 30)}</span>
          )}
          {book.isSample && (
            <span
              className="absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/90 bg-[var(--accent)] px-1 text-[10px] font-bold leading-none text-white shadow-lg"
              aria-label={lang === 'zh' ? '示例书籍' : 'Sample book'}
            >
              {lang === 'zh' ? '示例' : 'Sample'}
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-base font-semibold sm:text-lg">{book.name}</h3>
              </div>
              {book.author && <p className="truncate text-sm text-[var(--text-secondary)]">{book.author}</p>}
            </div>
            <span className={`inline-flex flex-shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-bold ${
              book.status === 'unread'
                ? 'border-gray-500/45 bg-gray-500/15 text-gray-600 dark:text-gray-300'
                : book.status === 'reading'
                  ? 'border-amber-500/45 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  : 'border-emerald-500/45 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
            }`}>
              {getStatusIcon(book.status, 14)}
              {t(lang, `bookshelf.status.${book.status}`)}
            </span>
          </div>

          {book.description && <p className="mt-1 line-clamp-1 text-sm text-[var(--text-secondary)]">{book.description}</p>}

          <div className="mt-2 flex max-h-6 flex-wrap items-center gap-1 overflow-hidden">
            {book.tags?.length ? (
              <>
                {book.tags.slice(0, 3).map(tag => (
                  <span key={`${tag.category}:${tag.name}`} className="rounded bg-[var(--accent)]/10 px-2 py-0.5 text-xs text-[var(--accent)]">
                    {tag.name}
                  </span>
                ))}
                {book.tags.length > 3 && <span className="text-xs text-[var(--text-secondary)]">+{book.tags.length - 3}</span>}
                <button
                  type="button"
                  onClick={() => handleGenerateTags(book.id, book.name, book.author, book.description)}
                  className="ml-1 text-[var(--text-secondary)] hover:text-[var(--accent)]"
                  disabled={generatingTags}
                  title={t(lang, 'bookshelf.tags.regenerate')}
                >
                  <AppIcon name="refresh" size={14} />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => handleGenerateTags(book.id, book.name, book.author, book.description)}
                className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                disabled={generatingTags}
              >
                <AppIcon name="tag" size={14} />
                {generatingTags ? t(lang, 'bookshelf.tags.generating') : (lang === 'zh' ? '生成标签' : 'Generate tags')}
              </button>
            )}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">{t(lang, 'bookshelf.progress')}</span>
                <span>{book.currentPhase}/{LEARNING_PHASES.length}</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${getBookshelfProgressPercentage(book)}%` }} />
              </div>
            </div>
            {book.bestScore > 0 && (
              <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold ${
                book.bestScore >= 60
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              }`}>
                <AppIcon name="target" size={14} />
                {book.bestScore}{lang === 'zh' ? '分' : ''}
              </span>
            )}
          </div>

          {!batchMode && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => handleSelectBook(book)} className="btn-primary py-1.5 text-sm">
                <AppIcon name="bookOpen" size={15} />
                {book.status === 'unread' ? t(lang, 'bookshelf.startReading') : t(lang, 'bookshelf.continueReading')}
              </button>
              <button type="button" onClick={() => openEditModal(book)} className="btn-secondary py-1.5 text-sm">
                <AppIcon name="edit" tone="amber" size={14} />
                {lang === 'zh' ? '编辑' : 'Edit'}
              </button>
              <button type="button" onClick={() => handleDeleteBook(book)} className="btn-secondary border-red-400/30 py-1.5 text-sm text-red-500 hover:border-red-400">
                <AppIcon name="trash" size={14} />
                {lang === 'zh' ? '删除' : 'Delete'}
              </button>
            </div>
          )}
        </div>
      </div>
    </MobileSwipeCard>
  )

  return (
    <div className="max-w-6xl mx-auto">
      {tagGenerationError && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertCircle size={19} className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />
          <span className="flex-1">{tagGenerationError}</span>
          <button
            type="button"
            onClick={() => setTagGenerationError(null)}
            className="shrink-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            aria-label={lang === 'zh' ? '关闭提示' : 'Dismiss message'}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t(lang, 'bookshelf.title')}</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">
            {lang === 'zh'
              ? `共 ${stats.total} 本书，已读 ${stats.finished} 本`
              : `${stats.total} books, ${stats.finished} finished`}
          </p>

        </div>
        <button data-testid="add-book-button" onClick={() => setShowAddModal(true)} className="btn-primary shrink-0">
          <AppIcon name="plus" size={17} />
          <span className="hidden sm:inline">{t(lang, 'bookshelf.addBook')}</span>
          <span className="sm:hidden">{lang === 'zh' ? '添加' : 'Add'}</span>
        </button>
      </div>

      {reviewBook && (
        <section className="mb-6 border-y border-[var(--border)] py-5" aria-labelledby="today-review-title">
          <div className="grid items-center gap-4 sm:grid-cols-[88px_minmax(0,1fr)_auto]">
            <button
              type="button"
              onClick={() => onSelectBook(reviewBook)}
              className="relative hidden aspect-[3/4] w-[88px] overflow-hidden rounded-lg bg-[var(--bg-secondary)] sm:block"
              aria-label={lang === 'zh' ? `打开《${reviewBook.name}》` : `Open ${reviewBook.name}`}
            >
              {getSafeImageSrc(reviewBook.cover) ? (
                <img src={getSafeImageSrc(reviewBook.cover)!} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center">{getStatusIcon(reviewBook.status, 28)}</span>
              )}
            </button>
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--accent)]">
                <AppIcon name="refresh" size={15} aria-hidden="true" />
                <span>{lang === 'zh' ? '今日复习' : 'Today\'s review'}</span>
                {reviewBook.isSample && (
                  <span className="rounded-md bg-[var(--accent)]/10 px-2 py-0.5 text-xs">
                    {lang === 'zh' ? '完整示例' : 'Complete sample'}
                  </span>
                )}
              </div>
              <h2 id="today-review-title" className="text-xl font-semibold">
                {reviewPrompt || (lang === 'zh' ? `继续《${reviewBook.name}》的理解练习` : `Continue learning ${reviewBook.name}`)}
              </h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {lang === 'zh' ? `${reviewBook.name} · ${getNextLearningStep(reviewBook)} · 预计 5 分钟` : `${reviewBook.name} · ${getNextLearningStep(reviewBook)} · about 5 min`}
              </p>
              {reviewBook.isSample && (
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  {lang === 'zh' ? '已备好六阶段分析、笔记、教学模拟与角色问答，无需配置即可查看。' : 'Six phases, notes, teaching practice, and persona Q&A are ready to explore without setup.'}
                </p>
              )}
            </div>
            <button type="button" onClick={() => onSelectBook(reviewBook)} className="btn-primary w-full shrink-0 sm:w-auto">
              <AppIcon name="arrowRight" size={17} aria-hidden="true" />
              {reviewBook.isSample
                ? (lang === 'zh' ? '查看完整示例' : 'Explore sample')
                : (lang === 'zh' ? '开始复习' : 'Start review')}
            </button>
          </div>
        </section>
      )}

      {books.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[var(--border)] pb-4 text-sm">
          <span><strong className="mr-1 text-base">{stats.total}</strong>{lang === 'zh' ? '本书' : 'books'}</span>
          <span><strong className="mr-1 text-base text-amber-600 dark:text-amber-400">{stats.reading}</strong>{lang === 'zh' ? '在读' : 'reading'}</span>
          <span><strong className="mr-1 text-base text-emerald-600 dark:text-emerald-400">{stats.finished}</strong>{lang === 'zh' ? '已读' : 'finished'}</span>
          <span><strong className="mr-1 text-base">{Math.round(stats.avgScore) || '-'}</strong>{lang === 'zh' ? '平均分' : 'avg score'}</span>
          <button onClick={() => setShowCharts(!showCharts)} className="ml-auto inline-flex min-h-11 items-center gap-1 text-[var(--accent)] hover:underline">
            {showCharts ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
            <ChartNoAxesCombined size={16} aria-hidden="true" />
            {lang === 'zh' ? '详细分析' : 'Analytics'}
          </button>
          {showCharts && <div className="w-full"><LibraryAnalytics books={books} lang={lang} /></div>}
        </div>
      )}

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {books.length > 0 && (
          <div className="relative w-full lg:max-w-sm">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => setShowSearchHistory(searchHistory.length > 0 && !searchQuery)}
                placeholder={lang === 'zh' ? '搜索书名、作者、标签...' : 'Search books, authors, tags...'}
                className="input-field w-full !pr-10"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <AppIcon name="close" size={16} />
                </button>
              )}

              {/* 搜索历史 */}
              {showSearchHistory && searchHistory.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden z-10">
                  <div className="p-2">
                    <div className="text-xs text-[var(--text-secondary)] px-2 py-1">
                      {lang === 'zh' ? '搜索历史' : 'Search History'}
                    </div>
                    {searchHistory.map((term, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          handleSearchChange(term)
                          setShowSearchHistory(false)
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[var(--bg-secondary)] text-sm flex items-center gap-2"
                      >
                        <AppIcon name="refresh" tone="muted" size={15} />
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}
          </div>
        )}
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <button onClick={() => setShowBookLists(true)} className="btn-secondary flex items-center gap-2">
            <AppIcon name="bookMarked" tone="violet" size={17} />
            {lang === 'zh' ? '书单' : 'Lists'}
          </button>
          {books.length > 0 && (
            <button
              onClick={toggleBatchMode}
              className={batchMode ? "btn-primary" : "btn-secondary"}
            >
              <AppIcon name={batchMode ? 'check' : 'clipboard'} size={17} />
              {lang === 'zh' ? (batchMode ? '退出批量' : '批量管理') : (batchMode ? 'Exit Batch' : 'Batch')}
            </button>
          )}
          <button onClick={() => setShowDocumentUpload(true)} className="btn-secondary flex items-center gap-2">
            <AppIcon name="upload" tone="blue" size={17} />{lang === 'zh' ? '上传文档' : 'Upload Doc'}
          </button>
        </div>
      </div>

      {/* Tabs & View Toggle */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 gap-1 overflow-x-auto rounded-lg bg-[var(--bg-secondary)] p-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`tab ${activeTab === tab.key ? 'active' : ''}`}
            >
              {tab.label}
              <span className="ml-1 opacity-60">({tab.count})</span>
            </button>
          ))}
        </div>
        
        <div className="flex gap-1 p-1 bg-[var(--bg-secondary)] rounded-lg">
          <button
            onClick={() => setViewMode('grid')}
            className={`flex h-11 w-11 items-center justify-center rounded ${viewMode === 'grid' ? 'bg-[var(--accent)] text-white' : ''}`}
            aria-label={lang === 'zh' ? '网格视图' : 'Grid view'}
            title={lang === 'zh' ? '网格视图' : 'Grid view'}
          >
            <LayoutGrid size={18} aria-hidden="true" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`flex h-11 w-11 items-center justify-center rounded ${viewMode === 'list' ? 'bg-[var(--accent)] text-white' : ''}`}
            aria-label={lang === 'zh' ? '列表视图' : 'List view'}
            title={lang === 'zh' ? '列表视图' : 'List view'}
          >
            <List size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 批量操作工具栏 */}
      {batchMode && (
        <div className="card p-4 mb-4 animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-[var(--text-secondary)]">
                {lang === 'zh' ? `已选择 ${selectedBooks.size} 本书` : `${selectedBooks.size} selected`}
              </span>
              <button onClick={selectAll} className="text-sm text-[var(--accent)] hover:underline">
                {lang === 'zh' ? '全选' : 'Select All'}
              </button>
              <button onClick={deselectAll} className="text-sm text-[var(--accent)] hover:underline">
                {lang === 'zh' ? '取消全选' : 'Deselect All'}
              </button>
            </div>
            
            {selectedBooks.size > 0 && (
              <div className="flex gap-2">
                <button 
                  onClick={handleBatchDelete}
                  className="btn-secondary text-sm py-2 text-red-400 border-red-400/30 hover:border-red-400"
                >
                  <AppIcon name="trash" size={15} />{lang === 'zh' ? '批量删除' : 'Delete'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tag Filter */}
      {allTags.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setShowTagFilter(!showTagFilter)}
              className="text-sm text-[var(--accent)] hover:underline flex items-center gap-1"
            >
              {showTagFilter ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
              <Tag size={16} className="text-violet-500" aria-hidden="true" />
              {t(lang, 'bookshelf.tags.title')}
              {(selectedCategory || selectedTag) && (
                <span className="ml-2 px-2 py-0.5 bg-[var(--accent)]/20 rounded text-xs">
                  {lang === 'zh' ? '已筛选' : 'Filtered'}
                </span>
              )}
            </button>
            
            <button
              onClick={() => setShowTagManagement(true)}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent)] flex items-center gap-1"
            >
              <AppIcon name="settings" tone="muted" size={16} />
              {lang === 'zh' ? '管理标签' : 'Manage Tags'}
            </button>
          </div>
          
          {showTagFilter && (
            <div className="card p-4 animate-fade-in">
              {/* 分类筛选 */}
              <div className="mb-3">
                <div className="text-xs text-[var(--text-secondary)] mb-2">{t(lang, 'bookshelf.tags.category')}</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => { setSelectedCategory(null); setSelectedTag(null) }}
                    className={`px-3 py-1 rounded-full text-sm transition-colors ${
                      !selectedCategory 
                        ? 'bg-[var(--accent)] text-white' 
                        : 'bg-[var(--bg-secondary)] hover:bg-[var(--accent)]/20'
                    }`}
                  >
                    {t(lang, 'bookshelf.tags.all')}
                  </button>
                  {allCategories.map(category => (
                    <button
                      key={category}
                      onClick={() => { setSelectedCategory(category); setSelectedTag(null) }}
                      className={`px-3 py-1 rounded-full text-sm transition-colors ${
                        selectedCategory === category 
                          ? 'bg-[var(--accent)] text-white' 
                          : 'bg-[var(--bg-secondary)] hover:bg-[var(--accent)]/20'
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* 具体标签筛选 */}
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]"><AppIcon name="tag" tone="violet" size={14} />{lang === 'zh' ? '标签' : 'Tags'}</div>
                <div className="flex flex-wrap gap-2">
                  {(selectedCategory 
                    ? allTags.filter(tag => tag.category === selectedCategory)
                    : allTags
                  ).map(tag => (
                    <button
                      key={`${tag.category}:${tag.name}`}
                      onClick={() => setSelectedTag(selectedTag === tag.name ? null : tag.name)}
                      className={`px-3 py-1 rounded-full text-sm transition-colors ${
                        selectedTag === tag.name 
                          ? 'bg-[var(--accent)] text-white' 
                          : 'bg-[var(--bg-secondary)] hover:bg-[var(--accent)]/20'
                      }`}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Book List */}
      {filteredBooks.length === 0 ? (
        <div className="card text-center py-16">
          <AppIcon name="library" tone="blue" size={56} className="mx-auto mb-4" />
          <p className="text-[var(--text-secondary)] text-lg">{t(lang, 'bookshelf.empty')}</p>
          <button onClick={() => setShowAddModal(true)} className="btn-primary mt-4">
            <AppIcon name="plus" size={17} />
            {t(lang, 'bookshelf.addBook')}
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        // Grid View
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredBooks.map(book => (
            <MobileSwipeCard
              key={book.id}
              disabled={batchMode}
              leftAction={{
                icon: 'bookOpen',
                label: lang === 'zh' ? '打开' : 'Open',
                color: 'bg-emerald-600',
                onAction: () => handleSelectBook(book)
              }}
              rightAction={{
                icon: 'edit',
                label: lang === 'zh' ? '编辑' : 'Edit',
                color: 'bg-amber-600',
                onAction: () => openEditModal(book)
              }}
              className="h-full"
            >
            <div className="card card-hover h-full p-0 overflow-hidden group relative">
              {/* 批量选择复选框 */}
              {batchMode && (
                <div className="absolute top-2 left-2 z-10">
                  <input
                    type="checkbox"
                    checked={selectedBooks.has(book.id)}
                    onChange={() => toggleBookSelection(book.id)}
                    className="w-5 h-5 cursor-pointer accent-[var(--accent)]"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}
              
              {/* Cover */}
              <div
                className="aspect-[3/4] bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent-secondary)]/20 relative cursor-pointer"
                onClick={() => handleSelectBook(book)}
              >
                {getSafeImageSrc(book.cover) ? (
                  <img src={getSafeImageSrc(book.cover)!} alt={book.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-4">
                    <span className="mb-2">{getStatusIcon(book.status, 30)}</span>
                    <span className="text-sm text-center text-[var(--text-secondary)] line-clamp-2">{book.name}</span>
                  </div>
                )}
                
                {/* Status Badge - 左上角，带阴影和边框 */}
                <div className={`absolute ${batchMode ? 'top-2 left-9' : 'top-2 left-2'} inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold shadow-lg border-2 ${
                  book.status === 'unread' 
                    ? 'bg-gray-500 text-white border-gray-600' 
                    : book.status === 'reading'
                      ? 'bg-yellow-500 text-white border-yellow-600'
                      : 'bg-green-500 text-white border-green-600'
                }`}>
                  {getStatusIcon(book.status, 14, true)}
                  {t(lang, `bookshelf.status.${book.status}`)}
                </div>

                {book.isSample && (
                  <div
                    className="absolute right-2 top-2 z-10 flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/90 bg-[var(--accent)] px-1 text-xs font-bold leading-none text-white shadow-lg"
                    aria-label={lang === 'zh' ? '示例书籍' : 'Sample book'}
                  >
                    {lang === 'zh' ? '示例' : 'Sample'}
                  </div>
                )}

                {/* Hover Actions - 右上角小图标 */}
                {!batchMode && (
                  <div className={`absolute right-2 ${book.isSample ? 'top-[4.5rem] flex-col' : 'top-2'} flex gap-1 opacity-0 transition-opacity group-hover:opacity-100`}>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSelectBook(book) }}
                      className="w-8 h-8 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-sm hover:scale-110 transition-transform"
                      title={lang === 'zh' ? '阅读' : 'Read'}
                    >
                      <AppIcon name="bookOpen" size={16} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditModal(book) }}
                      className="w-8 h-8 rounded-full bg-white/90 text-gray-700 flex items-center justify-center text-sm hover:scale-110 transition-transform"
                      title={lang === 'zh' ? '编辑' : 'Edit'}
                    >
                      <AppIcon name="edit" size={16} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteBook(book) }}
                      className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center text-sm hover:scale-110 transition-transform"
                      title={lang === 'zh' ? '删除' : 'Delete'}
                    >
                      <AppIcon name="trash" size={16} />
                    </button>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <h3 className="truncate text-sm font-semibold">{book.name}</h3>
                  </div>
                  {book.bestScore > 0 && (
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold ${
                      book.bestScore >= 60
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    }`}>
                      <AppIcon name="target" size={13} />
                      {book.bestScore}{lang === 'zh' ? '分' : ''}
                    </span>
                  )}
                </div>
                {book.author && <p className="text-xs text-[var(--text-secondary)] truncate">{book.author}</p>}
                {book.description && <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{book.description}</p>}
                
                {/* Tags */}
                {book.tags && book.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {book.tags.slice(0, 2).map(tag => (
                      <span 
                        key={`${tag.category}:${tag.name}`}
                        className="px-1.5 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] rounded text-xs"
                      >
                        {tag.name}
                      </span>
                    ))}
                    {book.tags.length > 2 && (
                      <span className="text-xs text-[var(--text-secondary)]">+{book.tags.length - 2}</span>
                    )}
                  </div>
                )}
                
                {/* Progress */}
                <div className="mt-2">
                  <div className="progress-bar h-1">
                    <div className="progress-fill" style={{ width: `${getBookshelfProgressPercentage(book)}%` }} />
                  </div>
                </div>
              </div>
            </div>
            </MobileSwipeCard>
          ))}
        </div>
      ) : (
        // List View
        filteredBooks.length > 30 ? (
          <VirtualList
            key={`${activeTab}-${selectedCategory || ''}-${selectedTag || ''}-${searchQuery}`}
            items={filteredBooks}
            itemHeight={virtualListMetrics.itemHeight}
            height={virtualListMetrics.height}
            overscan={4}
            getItemKey={book => book.id}
            renderItem={book => renderBookListRow(book, true)}
            testId="bookshelf-virtual-list"
            className="pr-1"
          />
        ) : (
          <div className="space-y-3">
            {filteredBooks.map(book => renderBookListRow(book))}
          </div>
        )
      )}

      {/* Add/Edit Book Modal */}
      {showBookLists && (
        <div className="modal-overlay" onClick={() => setShowBookLists(false)}>
          <div className="modal-content max-h-[90vh] max-w-5xl overflow-y-auto" onClick={event => event.stopPropagation()}>
            <div className="mb-1 flex justify-end">
              <button
                type="button"
                onClick={() => setShowBookLists(false)}
                className="icon-button"
                aria-label={lang === 'zh' ? '关闭书单管理' : 'Close list manager'}
                title={lang === 'zh' ? '关闭' : 'Close'}
              >
                <AppIcon name="close" size={20} />
              </button>
            </div>
            <BookListManager
              lang={lang}
              onOpenBook={selected => {
                setShowBookLists(false)
                handleSelectBook(selected)
              }}
            />
          </div>
        </div>
      )}

      {(showAddModal || editingBook) && (
        <div className="modal-overlay" onClick={() => { setShowAddModal(false); setEditingBook(null); resetForm() }}>
          <div className="modal-content max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-6">
              {editingBook ? (lang === 'zh' ? '编辑书籍' : 'Edit Book') : t(lang, 'bookshelf.addBook')}
            </h2>
            
            <div className="space-y-4">
              {/* Cover Upload */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  {lang === 'zh' ? '封面图片' : 'Cover Image'}
                </label>
                <div className="flex items-center gap-4">
                  <div 
                    className="w-24 h-32 rounded-lg overflow-hidden bg-[var(--bg-secondary)] flex items-center justify-center cursor-pointer border-2 border-dashed border-[var(--border)] hover:border-[var(--accent)]"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {getSafeImageSrc(newBookCover) ? (
                      <img src={getSafeImageSrc(newBookCover)!} alt="Cover" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    ) : (
                      <AppIcon name="camera" tone="blue" size={28} />
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleCoverUpload}
                    className="hidden"
                  />
                  <div className="text-sm text-[var(--text-secondary)]">
                    {lang === 'zh' ? '点击上传封面图片' : 'Click to upload cover'}
                    {newBookCover && (
                      <button 
                        onClick={() => setNewBookCover('')}
                        className="block text-red-400 mt-1"
                      >
                        {lang === 'zh' ? '移除图片' : 'Remove'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Book Name */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  {t(lang, 'bookshelf.bookName')} *
                </label>
                <input
                  type="text"
                  value={newBookName}
                  onChange={e => setNewBookName(e.target.value)}
                  placeholder={t(lang, 'bookshelf.bookNamePlaceholder')}
                  className="input-field"
                  autoFocus
                />
              </div>
              
              {/* Author */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  {t(lang, 'bookshelf.author')}
                </label>
                <input
                  type="text"
                  value={newBookAuthor}
                  onChange={e => setNewBookAuthor(e.target.value)}
                  placeholder={t(lang, 'bookshelf.authorPlaceholder')}
                  className="input-field"
                />
              </div>

              {/* Description */}
              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  {lang === 'zh' ? '一句话介绍' : 'Brief Description'}
                </label>
                <textarea
                  ref={descTextareaRef}
                  value={newBookDesc}
                  onChange={handleDescChange}
                  placeholder={lang === 'zh' ? '这本书讲了什么...' : 'What is this book about...'}
                  className="input-field min-h-[80px] resize-none overflow-hidden"
                  rows={3}
                />
              </div>

              {/* Tags Management */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  <AppIcon name="tag" tone="violet" size={18} />{lang === 'zh' ? '标签' : 'Tags'}
                </label>
                
                {/* Existing Tags */}
                {editingTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {editingTags.map((tag, index) => (
                      <div 
                        key={index}
                        className="px-3 py-1.5 bg-[var(--accent)]/10 text-[var(--accent)] rounded-lg text-sm flex items-center gap-2 border border-[var(--accent)]/20"
                      >
                        <span className="text-xs text-[var(--text-secondary)]">{tag.category}</span>
                        <span>·</span>
                        <span>{tag.name}</span>
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="text-red-400 hover:text-red-500 ml-1"
                        >
                          <AppIcon name="close" size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Add New Tag */}
                <div className="space-y-3">
                  <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">
                    {lang === 'zh' ? '添加新标签' : 'Add New Tag'}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                        {lang === 'zh' ? '分类' : 'Category'}
                      </label>
                      <select
                        value={newTagCategory}
                        onChange={e => {
                          setNewTagCategory(e.target.value)
                          if (e.target.value !== '其他') {
                            setCustomCategory('')
                          }
                        }}
                        className="input-field w-full"
                      >
                        {categories.map(cat => (
                          <option key={cat} value={cat}>{getCategoryLabel(cat)}</option>
                        ))}
                      </select>
                      {newTagCategory === '其他' && (
                        <input
                          type="text"
                          value={customCategory}
                          onChange={e => setCustomCategory(e.target.value)}
                          placeholder={lang === 'zh' ? '输入自定义分类' : 'Enter custom category'}
                          className="input-field w-full mt-2"
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                        {lang === 'zh' ? '标签名' : 'Tag Name'}
                      </label>
                      <input
                        type="text"
                        value={newTagName}
                        onChange={e => setNewTagName(e.target.value)}
                        placeholder={lang === 'zh' ? '如：心理学' : 'e.g., Psychology'}
                        className="input-field w-full"
                        onKeyPress={e => e.key === 'Enter' && handleAddTag()}
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleAddTag}
                    disabled={!newTagName.trim() || (newTagCategory === '其他' && !customCategory.trim())}
                    className="btn-secondary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <AppIcon name="plus" tone="violet" size={16} />
                    {lang === 'zh' ? '添加标签' : 'Add Tag'}
                  </button>
                </div>
                
                {editingBook && (
                  <button
                    onClick={() => handleGenerateTags(editingBook.id, newBookName, newBookAuthor, newBookDesc)}
                    className="text-xs text-[var(--accent)] hover:underline mt-3 block"
                    disabled={generatingTags}
                  >
                    <AppIcon name="sparkles" size={14} />{generatingTags ? t(lang, 'bookshelf.tags.generating') : (lang === 'zh' ? 'AI 生成标签' : 'AI Generate Tags')}
                  </button>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={editingBook ? handleUpdateBook : handleAddBook}
                className="btn-primary flex-1"
                disabled={savingBook || !newBookName.trim()}
              >
                {savingBook
                  ? (lang === 'zh' ? '保存中...' : 'Saving...')
                  : editingBook ? (lang === 'zh' ? '保存' : 'Save') : t(lang, 'bookshelf.add')}
              </button>
              <button
                onClick={() => { setShowAddModal(false); setEditingBook(null); resetForm() }}
                className="btn-secondary flex-1"
                disabled={savingBook}
              >
                {t(lang, 'bookshelf.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Upload Modal */}
      {showDocumentUpload && (
        <DocumentUpload
          lang={lang}
          onBookAdded={() => setBooks(getBooks())}
          onClose={() => setShowDocumentUpload(false)}
        />
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirmBook && (
        <div className="modal-overlay" onClick={() => { if (!mutatingBooks) setDeleteConfirmBook(null) }}>
          <div className="modal-content max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <AppIcon name="alert" tone="red" size={46} className="mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">
                {lang === 'zh' ? '确认删除' : 'Confirm Delete'}
              </h2>
              <p className="text-[var(--text-secondary)] mb-2">
                {lang === 'zh' ? '确定要删除这本书吗？' : 'Are you sure you want to delete this book?'}
              </p>
              <p className="font-medium text-lg mb-4">《{deleteConfirmBook.name}》</p>
              <p className="text-sm text-red-400 mb-6">
                {lang === 'zh'
                  ? '可在当前页面撤销；刷新或关闭页面后将无法恢复'
                  : 'You can undo on this page until it is refreshed or closed'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirmBook(null)}
                  disabled={mutatingBooks}
                  className="btn-secondary flex-1"
                >
                  {lang === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={mutatingBooks}
                  className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {mutatingBooks ? (lang === 'zh' ? '删除中...' : 'Deleting...') : (lang === 'zh' ? '确认删除' : 'Delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirm Modal */}
      {showBatchDeleteConfirm && (
        <div className="modal-overlay" onClick={() => { if (!mutatingBooks) setShowBatchDeleteConfirm(false) }}>
          <div className="modal-content max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <AppIcon name="alert" tone="red" size={46} className="mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">
                {lang === 'zh' ? '批量删除确认' : 'Batch Delete Confirm'}
              </h2>
              <p className="text-[var(--text-secondary)] mb-2">
                {lang === 'zh' 
                  ? `确定要删除选中的 ${selectedBooks.size} 本书吗？` 
                  : `Delete ${selectedBooks.size} selected books?`}
              </p>
              <p className="text-sm text-red-400 mb-6">
                {lang === 'zh'
                  ? '可在当前页面撤销；刷新或关闭页面后将无法恢复'
                  : 'You can undo on this page until it is refreshed or closed'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowBatchDeleteConfirm(false)}
                  disabled={mutatingBooks}
                  className="btn-secondary flex-1"
                >
                  {lang === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button
                  onClick={confirmBatchDelete}
                  disabled={mutatingBooks}
                  className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {mutatingBooks ? (lang === 'zh' ? '删除中...' : 'Deleting...') : (lang === 'zh' ? '确认删除' : 'Delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tag Management Modal */}
      {showTagManagement && (
        <div className="modal-overlay" onClick={() => setShowTagManagement(false)}>
          <div className="modal-content max-w-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">
                <AppIcon name="tag" tone="violet" size={22} />{lang === 'zh' ? '标签管理' : 'Tag Management'}
              </h2>
              <button 
                onClick={() => setShowTagManagement(false)}
                className="text-2xl text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <AppIcon name="close" size={20} />
              </button>
            </div>

            {/* Warning */}
            <div className="bg-yellow-500/10 border-2 border-yellow-500/30 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <AppIcon name="alert" tone="amber" size={22} />
                <div>
                  <h3 className="font-bold text-yellow-600 dark:text-yellow-400 mb-1">
                    {lang === 'zh' ? '重要提示' : 'Important Notice'}
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {lang === 'zh' 
                      ? '标签和分类是重要的索引信息。修改或删除标签会影响所有使用该标签的书籍，请谨慎操作。' 
                      : 'Tags and categories are important index information. Modifying or deleting tags will affect all books using them. Please proceed with caution.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Tags by Category */}
            <div className="space-y-6">
              {allCategories.map(category => {
                const categoryTags = allTags.filter(tag => tag.category === category)
                return (
                  <div key={category} className="card p-4">
                    <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                      <AppIcon name="folder" tone="accent" size={18} />
                      {getCategoryLabel(category)}
                      <span className="text-xs text-[var(--text-secondary)] font-normal">
                        ({categoryTags.length} {lang === 'zh' ? '个标签' : 'tags'})
                      </span>
                    </h3>
                    
                    <div className="space-y-2">
                      {categoryTags.map(tag => {
                        const bookCount = countBooksWithTag(tag)
                        const isEditing = editingGlobalTag?.name === tag.name && editingGlobalTag?.category === tag.category
                        
                        return (
                          <div 
                            key={`${tag.category}:${tag.name}`}
                            className={`p-3 bg-[var(--bg-secondary)] rounded-lg ${isEditing ? 'border-2 border-[var(--accent)]' : ''}`}
                          >
                            {isEditing ? (
                              <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs text-[var(--text-secondary)] mb-1">
                                      {lang === 'zh' ? '分类' : 'Category'}
                                    </label>
                                    <input
                                      type="text"
                                      value={newGlobalTagCategory}
                                      onChange={e => setNewGlobalTagCategory(e.target.value)}
                                      placeholder={lang === 'zh' ? '如：社科' : 'e.g., Science'}
                                      className="input-field text-sm w-full"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-[var(--text-secondary)] mb-1">
                                      {lang === 'zh' ? '标签名' : 'Tag Name'}
                                    </label>
                                    <input
                                      type="text"
                                      value={newGlobalTagName}
                                      onChange={e => setNewGlobalTagName(e.target.value)}
                                      placeholder={lang === 'zh' ? '如：心理学' : 'e.g., Psychology'}
                                      className="input-field text-sm w-full"
                                    />
                                  </div>
                                </div>
                                <div className="flex gap-2 justify-end">
                                  <button
                                    onClick={() => {
                                      setEditingGlobalTag(null)
                                      setNewGlobalTagName('')
                                      setNewGlobalTagCategory('')
                                    }}
                                    className="px-4 py-2 text-sm bg-[var(--bg-card)] rounded-lg hover:bg-[var(--border)] transition-colors"
                                  >
                                    {lang === 'zh' ? '取消' : 'Cancel'}
                                  </button>
                                  <button
                                    onClick={handleUpdateGlobalTag}
                                    disabled={mutatingBooks || !newGlobalTagName.trim() || !newGlobalTagCategory.trim()}
                                    className="px-4 py-2 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                  >
                                    {mutatingBooks ? (lang === 'zh' ? '保存中...' : 'Saving...') : (lang === 'zh' ? '保存' : 'Save')}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <span className="font-medium">{tag.name}</span>
                                  <span className="text-xs px-2 py-1 bg-[var(--accent)]/10 text-[var(--accent)] rounded">
                                    {bookCount} {lang === 'zh' ? '本书' : 'books'}
                                  </span>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleEditGlobalTag(tag)}
                                    className="inline-flex items-center gap-1 text-sm text-[var(--accent)] hover:underline"
                                  >
                                    <AppIcon name="edit" tone="amber" size={14} />
                                    {lang === 'zh' ? '编辑' : 'Edit'}
                                  </button>
                                  <button
                                    onClick={() => handleDeleteGlobalTag(tag)}
                                    className="text-sm text-red-400 hover:underline"
                                  >
                                    <AppIcon name="trash" size={14} />{lang === 'zh' ? '删除' : 'Delete'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {allTags.length === 0 && (
              <div className="text-center py-12 text-[var(--text-secondary)]">
                <AppIcon name="tag" tone="violet" size={46} className="mx-auto mb-3" />
                <p>{lang === 'zh' ? '暂无标签' : 'No tags yet'}</p>
                <p className="text-sm mt-2">
                  {lang === 'zh' ? '在书籍编辑页面添加标签，或使用 AI 生成标签' : 'Add tags in book edit page or use AI to generate tags'}
                </p>
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-[var(--border)]">
              <button 
                onClick={() => setShowTagManagement(false)}
                className="btn-primary w-full"
              >
                {lang === 'zh' ? '完成' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Tag Confirm Modal */}
      {tagToDelete && (
        <div className="modal-overlay" onClick={() => { if (!mutatingBooks) setTagToDelete(null) }}>
          <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <AppIcon name="alert" tone="red" size={46} className="mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2 text-red-500">
                {lang === 'zh' ? '确认删除标签' : 'Confirm Delete Tag'}
              </h2>
              <div className="my-4 p-4 bg-[var(--bg-secondary)] rounded-xl">
                <div className="text-sm text-[var(--text-secondary)] mb-1">
                  {tagToDelete.category}
                </div>
                <div className="text-lg font-bold">
                  {tagToDelete.name}
                </div>
              </div>
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
                <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-2">
                  <AppIcon name="alert" size={16} />{lang === 'zh' ? '此操作将影响以下内容：' : 'This action will affect:'}
                </p>
                <ul className="text-sm text-[var(--text-secondary)] text-left space-y-1">
                  <li>• {countBooksWithTag(tagToDelete)} {lang === 'zh' ? '本书将失去此标签' : 'books will lose this tag'}</li>
                  <li>• {lang === 'zh' ? '无法撤销此操作' : 'This action cannot be undone'}</li>
                  <li>• {lang === 'zh' ? '可能影响书籍的分类和检索' : 'May affect book categorization and search'}</li>
                </ul>
              </div>
              <p className="text-sm text-[var(--text-secondary)] mb-6">
                {lang === 'zh' ? '确定要删除这个标签吗？' : 'Are you sure you want to delete this tag?'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setTagToDelete(null)}
                  disabled={mutatingBooks}
                  className="btn-secondary flex-1"
                >
                  {lang === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button
                  onClick={confirmDeleteGlobalTag}
                  disabled={mutatingBooks}
                  className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors font-bold disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {mutatingBooks ? (lang === 'zh' ? '删除中...' : 'Deleting...') : (lang === 'zh' ? '确认删除' : 'Confirm Delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
