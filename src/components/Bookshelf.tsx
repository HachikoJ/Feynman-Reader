'use client'

import { useState, useEffect, useRef } from 'react'
import { Book, BookStatus, BookTag, getBooks, addBook, updateBook, deleteBook, getAllTags, getAllCategories, getSettings } from '@/lib/store'
import { logger } from '@/lib/logger'
import { Language, t } from '@/lib/i18n'
import { LEARNING_PHASES } from '@/lib/feynman-prompts'
import { createDeepSeekClient, generateBookTags } from '@/lib/deepseek'
import DocumentUpload from './DocumentUpload'
import { validateBookName, validateAuthorName, validateContent, sanitizeTextInput, detectMaliciousContent } from '@/lib/validation'
import { undoRedoManager, createDeleteBookAction, createAddBookAction, createUpdateBookAction, createBatchDeleteBooksAction } from '@/lib/undoRedo'

interface Props {
  lang: Language
  onSelectBook: (book: Book) => void
}

type TabFilter = 'all' | BookStatus
type ViewMode = 'grid' | 'list'

// 简单的进度条组件
function MiniProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  )
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
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [generatingTags, setGeneratingTags] = useState(false)
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
  const [tagToDelete, setTagToDelete] = useState<BookTag | null>(null)
  
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

    setGeneratingTags(true)
    try {
      const client = await createDeepSeekClient(settings.apiKey)
      const tags = await generateBookTags(client, bookName, author, description)
      if (tags.length > 0) {
        updateBook(bookId, { tags })
        setBooks(getBooks())
        
        // 如果正在编辑这本书，同时更新编辑状态
        if (editingBook && editingBook.id === bookId) {
          setEditingTags(tags)
        }
      }
    } catch (error) {
      logger.error('生成标签失败:', error)
    } finally {
      setGeneratingTags(false)
    }
  }

  const handleAddBook = async () => {
    // P0 新增：输入验证
    const nameValidation = validateBookName(newBookName)
    if (!nameValidation.valid) {
      alert(nameValidation.error || '书名无效')
      return
    }

    const authorValidation = validateAuthorName(newBookAuthor)
    if (!authorValidation.valid) {
      alert(authorValidation.error || '作者名无效')
      return
    }

    const descValidation = validateContent(newBookDesc, 500)
    if (!descValidation.valid) {
      alert(descValidation.error || '描述过长')
      return
    }

    // 检测恶意内容
    if (detectMaliciousContent(newBookName) || detectMaliciousContent(newBookAuthor) || detectMaliciousContent(newBookDesc)) {
      alert('输入包含不安全的内容')
      return
    }

    // 清理输入
    const cleanName = sanitizeTextInput(newBookName, 200)
    const cleanAuthor = newBookAuthor ? sanitizeTextInput(newBookAuthor, 100) : undefined
    const cleanDesc = newBookDesc ? sanitizeTextInput(newBookDesc, 500) : undefined

    const book = addBook(cleanName, cleanAuthor)
    if (cleanDesc) {
      updateBook(book.id, { description: cleanDesc })
      book.description = cleanDesc
    }
    if (newBookCover) {
      updateBook(book.id, { cover: newBookCover })
      book.cover = newBookCover
    }
    setBooks([book, ...books])
    resetForm()
    setShowAddModal(false)

    // 自动生成标签
    const settings = getSettings()
    if (settings.apiKey) {
      handleGenerateTags(book.id, book.name, book.author, book.description)
    }
  }

  const handleUpdateBook = () => {
    if (!editingBook) return

    // P0 新增：输入验证
    const nameValidation = validateBookName(newBookName)
    if (!nameValidation.valid) {
      alert(nameValidation.error || '书名无效')
      return
    }

    const authorValidation = validateAuthorName(newBookAuthor)
    if (!authorValidation.valid) {
      alert(authorValidation.error || '作者名无效')
      return
    }

    const descValidation = validateContent(newBookDesc, 500)
    if (!descValidation.valid) {
      alert(descValidation.error || '描述过长')
      return
    }

    // 检测恶意内容
    if (detectMaliciousContent(newBookName) || detectMaliciousContent(newBookAuthor) || detectMaliciousContent(newBookDesc)) {
      alert('输入包含不安全的内容')
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
    updateBook(editingBook.id, updates)
    setBooks(books.map(b => b.id === editingBook.id ? { ...b, ...updates } : b))
    resetForm()
    setEditingBook(null)
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

  // 全局标签管理函数
  const handleEditGlobalTag = (tag: BookTag) => {
    setEditingGlobalTag(tag)
    setNewGlobalTagName(tag.name)
    setNewGlobalTagCategory(tag.category)
  }

  const handleUpdateGlobalTag = () => {
    if (!editingGlobalTag || !newGlobalTagName.trim() || !newGlobalTagCategory.trim()) return
    
    const oldTag = editingGlobalTag
    const newTag: BookTag = {
      name: newGlobalTagName.trim(),
      category: newGlobalTagCategory.trim()
    }
    
    // 更新所有使用该标签的书籍
    const updatedBooks = books.map(book => {
      if (!book.tags) return book
      
      const hasTag = book.tags.some(t => 
        t.name === oldTag.name && t.category === oldTag.category
      )
      
      if (hasTag) {
        const newTags = book.tags.map(t => 
          (t.name === oldTag.name && t.category === oldTag.category) ? newTag : t
        )
        updateBook(book.id, { tags: newTags })
        return { ...book, tags: newTags }
      }
      
      return book
    })
    
    setBooks(updatedBooks)
    setEditingGlobalTag(null)
    setNewGlobalTagName('')
    setNewGlobalTagCategory('')
  }

  const handleDeleteGlobalTag = (tag: BookTag) => {
    setTagToDelete(tag)
  }

  const confirmDeleteGlobalTag = () => {
    if (!tagToDelete) return
    
    // 从所有书籍中移除该标签
    const updatedBooks = books.map(book => {
      if (!book.tags) return book
      
      const hasTag = book.tags.some(t => 
        t.name === tagToDelete.name && t.category === tagToDelete.category
      )
      
      if (hasTag) {
        const newTags = book.tags.filter(t => 
          !(t.name === tagToDelete.name && t.category === tagToDelete.category)
        )
        updateBook(book.id, { tags: newTags.length > 0 ? newTags : undefined })
        return { ...book, tags: newTags.length > 0 ? newTags : undefined }
      }
      
      return book
    })
    
    setBooks(updatedBooks)
    setTagToDelete(null)
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

  const confirmDelete = () => {
    if (deleteConfirmBook) {
      // P1 新增：使用撤销/重做管理器
      const action = createDeleteBookAction(
        deleteConfirmBook.id,
        deleteConfirmBook,
        deleteBook,
        (book) => {
          // 重新添加书籍到状态
          setBooks(prevBooks => [book, ...prevBooks])
        }
      )
      undoRedoManager.execute(action)

      // 执行删除
      deleteBook(deleteConfirmBook.id)
      setBooks(books.filter(b => b.id !== deleteConfirmBook.id))
      setDeleteConfirmBook(null)
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
  
  const confirmBatchDelete = () => {
    // P1 新增：使用撤销/重做管理器
    const booksToDelete = books.filter(b => selectedBooks.has(b.id))
    const action = createBatchDeleteBooksAction(
      booksToDelete.map(b => ({ id: b.id, data: b })),
      (ids) => {
        ids.forEach(id => deleteBook(id))
      },
      (restoredBooks) => {
        // 恢复书籍
        restoredBooks.forEach(book => {
          addBook(book.name, book.author, book.cover, book.description, book.tags, book.documentContent)
        })
        setBooks(getBooks())
      }
    )
    undoRedoManager.execute(action)

    selectedBooks.forEach(id => deleteBook(id))
    setBooks(getBooks())
    setSelectedBooks(new Set())
    setShowBatchDeleteConfirm(false)
    setBatchMode(false)
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

  const getStatusClass = (status: BookStatus) => {
    switch (status) {
      case 'unread': return 'status-unread'
      case 'reading': return 'status-reading'
      case 'finished': return 'status-finished'
    }
  }

  const getStatusIcon = (status: BookStatus) => {
    switch (status) {
      case 'unread': return '📚'
      case 'reading': return '📖'
      case 'finished': return '✅'
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

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header with Stats */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex-1 w-full">
          <h1 className="text-3xl font-bold">{t(lang, 'bookshelf.title')}</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">
            {lang === 'zh'
              ? `共 ${stats.total} 本书，已读 ${stats.finished} 本`
              : `${stats.total} books, ${stats.finished} finished`}
          </p>

          {/* P0 新增：搜索框 */}
          {books.length > 0 && (
            <div className="relative mt-3 max-w-md">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => setShowSearchHistory(searchHistory.length > 0 && !searchQuery)}
                placeholder={lang === 'zh' ? '🔍 搜索书名、作者、标签...' : '🔍 Search books, authors, tags...'}
                className="input-field w-full pl-10 pr-10"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  ✕
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
                        <span className="text-[var(--text-secondary)]">🕐</span>
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {books.length > 0 && (
            <button
              onClick={toggleBatchMode}
              className={batchMode ? "btn-primary" : "btn-secondary"}
            >
              {batchMode ? '✓ ' : '☑️ '}
              {lang === 'zh' ? (batchMode ? '退出批量' : '批量管理') : (batchMode ? 'Exit Batch' : 'Batch')}
            </button>
          )}
          <button onClick={() => setShowDocumentUpload(true)} className="btn-secondary">
            📄 {lang === 'zh' ? '上传文档' : 'Upload Doc'}
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn-primary">
            + {t(lang, 'bookshelf.addBook')}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {books.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="card p-4 text-center">
              <div className="text-3xl mb-1">📚</div>
              <div className="text-2xl font-bold text-[var(--accent)]">{stats.total}</div>
              <div className="text-xs text-[var(--text-secondary)]">{lang === 'zh' ? '总计' : 'Total'}</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-3xl mb-1">📖</div>
              <div className="text-2xl font-bold text-yellow-400">{stats.reading}</div>
              <div className="text-xs text-[var(--text-secondary)]">{lang === 'zh' ? '在读' : 'Reading'}</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-3xl mb-1">✅</div>
              <div className="text-2xl font-bold text-green-400">{stats.finished}</div>
              <div className="text-xs text-[var(--text-secondary)]">{lang === 'zh' ? '已读' : 'Finished'}</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-3xl mb-1">🎯</div>
              <div className="text-2xl font-bold text-[var(--accent)]">{Math.round(stats.avgScore) || '-'}</div>
              <div className="text-xs text-[var(--text-secondary)]">{lang === 'zh' ? '平均分' : 'Avg Score'}</div>
            </div>
          </div>

          {/* Charts Toggle */}
          <div className="mb-6">
            <button 
              onClick={() => setShowCharts(!showCharts)}
              className="text-sm text-[var(--accent)] hover:underline flex items-center gap-1"
            >
              {showCharts ? '▼' : '▶'} {lang === 'zh' ? '查看详细分析' : 'View Analytics'}
            </button>
            
            {showCharts && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 animate-fade-in">
                {/* 阅读状态分布 */}
                <div className="card p-4">
                  <h4 className="font-semibold mb-3 text-sm">{lang === 'zh' ? '📊 阅读状态分布' : '📊 Reading Status'}</h4>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>{lang === 'zh' ? '未读' : 'Unread'}</span>
                        <span>{stats.unread}</span>
                      </div>
                      <MiniProgressBar value={stats.unread} max={stats.total} color="#94a3b8" />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>{lang === 'zh' ? '在读' : 'Reading'}</span>
                        <span>{stats.reading}</span>
                      </div>
                      <MiniProgressBar value={stats.reading} max={stats.total} color="#eab308" />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>{lang === 'zh' ? '已读' : 'Finished'}</span>
                        <span>{stats.finished}</span>
                      </div>
                      <MiniProgressBar value={stats.finished} max={stats.total} color="#22c55e" />
                    </div>
                  </div>
                </div>

                {/* 得分分布 */}
                <div className="card p-4">
                  <h4 className="font-semibold mb-3 text-sm">{lang === 'zh' ? '🎯 得分分布' : '🎯 Score Distribution'}</h4>
                  {(() => {
                    const scoredBooks = books.filter(b => b.bestScore > 0)
                    const excellent = scoredBooks.filter(b => b.bestScore >= 80).length
                    const good = scoredBooks.filter(b => b.bestScore >= 60 && b.bestScore < 80).length
                    const needsWork = scoredBooks.filter(b => b.bestScore < 60).length
                    const total = scoredBooks.length || 1
                    
                    return scoredBooks.length > 0 ? (
                      <div className="space-y-3">
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span>⭐ {lang === 'zh' ? '优秀 (≥80)' : 'Excellent (≥80)'}</span>
                            <span>{excellent}</span>
                          </div>
                          <MiniProgressBar value={excellent} max={total} color="#22c55e" />
                        </div>
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span>✓ {lang === 'zh' ? '合格 (60-79)' : 'Passed (60-79)'}</span>
                            <span>{good}</span>
                          </div>
                          <MiniProgressBar value={good} max={total} color="#3b82f6" />
                        </div>
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span>📝 {lang === 'zh' ? '待提升 (<60)' : 'Needs Work (<60)'}</span>
                            <span>{needsWork}</span>
                          </div>
                          <MiniProgressBar value={needsWork} max={total} color="#f97316" />
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-[var(--text-secondary)] text-center py-4">
                        {lang === 'zh' ? '暂无得分数据' : 'No score data yet'}
                      </p>
                    )
                  })()}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Tabs & View Toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2 p-1 bg-[var(--bg-secondary)] rounded-xl">
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
            className={`p-2 rounded ${viewMode === 'grid' ? 'bg-[var(--accent)] text-white' : ''}`}
            title={lang === 'zh' ? '网格视图' : 'Grid view'}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
              <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"/>
            </svg>
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded ${viewMode === 'list' ? 'bg-[var(--accent)] text-white' : ''}`}
            title={lang === 'zh' ? '列表视图' : 'List view'}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
              <path fillRule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z"/>
            </svg>
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
                  🗑️ {lang === 'zh' ? '批量删除' : 'Delete'}
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
              {showTagFilter ? '▼' : '▶'} 🏷️ {t(lang, 'bookshelf.tags.title')}
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
              ⚙️ {lang === 'zh' ? '管理标签' : 'Manage Tags'}
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
                <div className="text-xs text-[var(--text-secondary)] mb-2">🏷️ {lang === 'zh' ? '标签' : 'Tags'}</div>
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
          <div className="text-6xl mb-4">📚</div>
          <p className="text-[var(--text-secondary)] text-lg">{t(lang, 'bookshelf.empty')}</p>
          <button onClick={() => setShowAddModal(true)} className="btn-primary mt-4">
            + {t(lang, 'bookshelf.addBook')}
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        // Grid View
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredBooks.map(book => (
            <div key={book.id} className="card card-hover p-0 overflow-hidden group relative">
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
                {book.cover ? (
                  <img src={book.cover} alt={book.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-4">
                    <span className="text-5xl mb-2">{getStatusIcon(book.status)}</span>
                    <span className="text-sm text-center text-[var(--text-secondary)] line-clamp-2">{book.name}</span>
                  </div>
                )}
                
                {/* Status Badge - 左上角，带阴影和边框 */}
                <div className={`absolute ${batchMode ? 'top-2 left-9' : 'top-2 left-2'} px-2 py-1 rounded-lg text-xs font-bold shadow-lg border-2 ${
                  book.status === 'unread' 
                    ? 'bg-gray-500 text-white border-gray-600' 
                    : book.status === 'reading'
                      ? 'bg-yellow-500 text-white border-yellow-600'
                      : 'bg-green-500 text-white border-green-600'
                }`}>
                  {getStatusIcon(book.status)} {t(lang, `bookshelf.status.${book.status}`)}
                </div>

                {/* Score Badge - 左上角状态下方，带阴影 */}
                {book.bestScore > 0 && (
                  <div className={`absolute ${batchMode ? 'top-12 left-9' : 'top-12 left-2'} w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-lg border-2 ${
                    book.bestScore >= 60 
                      ? 'bg-green-500 text-white border-green-600' 
                      : 'bg-yellow-500 text-white border-yellow-600'
                  }`}>
                    {book.bestScore}
                  </div>
                )}

                {/* Hover Actions - 右上角小图标 */}
                {!batchMode && (
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSelectBook(book) }}
                      className="w-8 h-8 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-sm hover:scale-110 transition-transform"
                      title={lang === 'zh' ? '阅读' : 'Read'}
                    >
                      📖
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditModal(book) }}
                      className="w-8 h-8 rounded-full bg-white/90 text-gray-700 flex items-center justify-center text-sm hover:scale-110 transition-transform"
                      title={lang === 'zh' ? '编辑' : 'Edit'}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteBook(book) }}
                      className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center text-sm hover:scale-110 transition-transform"
                      title={lang === 'zh' ? '删除' : 'Delete'}
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-3">
                <h3 className="font-semibold text-sm truncate">{book.name}</h3>
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
                    <div className="progress-fill" style={{ width: `${(book.currentPhase / LEARNING_PHASES.length) * 100}%` }} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // List View
        <div className="space-y-3">
          {filteredBooks.map(book => (
            <div key={book.id} className="card card-hover flex gap-4 relative">
              {/* 批量选择复选框 */}
              {batchMode && (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedBooks.has(book.id)}
                    onChange={() => toggleBookSelection(book.id)}
                    className="w-5 h-5 cursor-pointer accent-[var(--accent)]"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}
              
              {/* Cover Thumbnail */}
              <div 
                className="w-20 h-28 flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent-secondary)]/20 cursor-pointer"
                onClick={() => handleSelectBook(book)}
              >
                {book.cover ? (
                  <img src={book.cover} alt={book.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-3xl">{getStatusIcon(book.status)}</span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-lg">{book.name}</h3>
                    {book.author && <p className="text-sm text-[var(--text-secondary)]">{book.author}</p>}
                  </div>
                  <span className={`px-3 py-1 rounded-lg text-xs font-bold shadow-md border-2 flex-shrink-0 ${
                    book.status === 'unread' 
                      ? 'bg-gray-500 text-white border-gray-600' 
                      : book.status === 'reading'
                        ? 'bg-yellow-500 text-white border-yellow-600'
                        : 'bg-green-500 text-white border-green-600'
                  }`}>
                    {getStatusIcon(book.status)} {t(lang, `bookshelf.status.${book.status}`)}
                  </span>
                </div>
                
                {book.description && (
                  <p className="text-sm text-[var(--text-secondary)] mt-1 line-clamp-1">{book.description}</p>
                )}

                {/* Tags */}
                <div className="flex flex-wrap items-center gap-1 mt-2">
                  {book.tags && book.tags.length > 0 ? (
                    <>
                      {book.tags.map(tag => (
                        <span 
                          key={`${tag.category}:${tag.name}`}
                          className="px-2 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] rounded text-xs"
                        >
                          {tag.name}
                        </span>
                      ))}
                      <button
                        onClick={() => handleGenerateTags(book.id, book.name, book.author, book.description)}
                        className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] ml-1"
                        disabled={generatingTags}
                        title={t(lang, 'bookshelf.tags.regenerate')}
                      >
                        🔄
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleGenerateTags(book.id, book.name, book.author, book.description)}
                      className="text-xs text-[var(--accent)] hover:underline"
                      disabled={generatingTags}
                    >
                      {generatingTags ? t(lang, 'bookshelf.tags.generating') : `🏷️ ${lang === 'zh' ? '生成标签' : 'Generate Tags'}`}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-4 mt-3">
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-[var(--text-secondary)]">{t(lang, 'bookshelf.progress')}</span>
                      <span>{book.currentPhase}/{LEARNING_PHASES.length}</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${(book.currentPhase / LEARNING_PHASES.length) * 100}%` }} />
                    </div>
                  </div>
                  
                  {book.bestScore > 0 && (
                    <div className={`text-lg font-bold ${book.bestScore >= 60 ? 'text-green-400' : 'text-yellow-400'}`}>
                      {book.bestScore}分
                    </div>
                  )}
                </div>

                <div className="flex gap-2 mt-3">
                  {!batchMode && (
                    <>
                      <button onClick={() => handleSelectBook(book)} className="btn-primary text-sm py-1.5">
                        📖 {book.status === 'unread' ? t(lang, 'bookshelf.startReading') : t(lang, 'bookshelf.continueReading')}
                      </button>
                      <button onClick={() => openEditModal(book)} className="btn-secondary text-sm py-1.5">
                        ✏️ {lang === 'zh' ? '编辑' : 'Edit'}
                      </button>
                      <button 
                        onClick={() => handleDeleteBook(book)}
                        className="btn-secondary text-sm py-1.5 text-red-400 border-red-400/30 hover:border-red-400"
                      >
                        🗑️ {lang === 'zh' ? '删除' : 'Del'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Book Modal */}
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
                    {newBookCover ? (
                      <img src={newBookCover} alt="Cover" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl">📷</span>
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
                  🏷️ {lang === 'zh' ? '标签' : 'Tags'}
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
                          ×
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
                          <option key={cat} value={cat}>{cat}</option>
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
                    + {lang === 'zh' ? '添加标签' : 'Add Tag'}
                  </button>
                </div>
                
                {editingBook && (
                  <button
                    onClick={() => handleGenerateTags(editingBook.id, newBookName, newBookAuthor, newBookDesc)}
                    className="text-xs text-[var(--accent)] hover:underline mt-3 block"
                    disabled={generatingTags}
                  >
                    {generatingTags ? t(lang, 'bookshelf.tags.generating') : `🤖 ${lang === 'zh' ? 'AI 生成标签' : 'AI Generate Tags'}`}
                  </button>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button 
                onClick={editingBook ? handleUpdateBook : handleAddBook} 
                className="btn-primary flex-1"
                disabled={!newBookName.trim()}
              >
                {editingBook ? (lang === 'zh' ? '保存' : 'Save') : t(lang, 'bookshelf.add')}
              </button>
              <button 
                onClick={() => { setShowAddModal(false); setEditingBook(null); resetForm() }} 
                className="btn-secondary flex-1"
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
        <div className="modal-overlay" onClick={() => setDeleteConfirmBook(null)}>
          <div className="modal-content max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="text-5xl mb-4">⚠️</div>
              <h2 className="text-xl font-bold mb-2">
                {lang === 'zh' ? '确认删除' : 'Confirm Delete'}
              </h2>
              <p className="text-[var(--text-secondary)] mb-2">
                {lang === 'zh' ? '确定要删除这本书吗？' : 'Are you sure you want to delete this book?'}
              </p>
              <p className="font-medium text-lg mb-4">《{deleteConfirmBook.name}》</p>
              <p className="text-sm text-red-400 mb-6">
                {lang === 'zh' ? '删除后无法恢复，所有阅读记录将丢失' : 'This action cannot be undone'}
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeleteConfirmBook(null)}
                  className="btn-secondary flex-1"
                >
                  {lang === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button 
                  onClick={confirmDelete}
                  className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors"
                >
                  {lang === 'zh' ? '确认删除' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirm Modal */}
      {showBatchDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowBatchDeleteConfirm(false)}>
          <div className="modal-content max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="text-5xl mb-4">⚠️</div>
              <h2 className="text-xl font-bold mb-2">
                {lang === 'zh' ? '批量删除确认' : 'Batch Delete Confirm'}
              </h2>
              <p className="text-[var(--text-secondary)] mb-2">
                {lang === 'zh' 
                  ? `确定要删除选中的 ${selectedBooks.size} 本书吗？` 
                  : `Delete ${selectedBooks.size} selected books?`}
              </p>
              <p className="text-sm text-red-400 mb-6">
                {lang === 'zh' ? '删除后无法恢复，所有阅读记录将丢失' : 'This action cannot be undone'}
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowBatchDeleteConfirm(false)}
                  className="btn-secondary flex-1"
                >
                  {lang === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button 
                  onClick={confirmBatchDelete}
                  className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors"
                >
                  {lang === 'zh' ? '确认删除' : 'Delete'}
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
                🏷️ {lang === 'zh' ? '标签管理' : 'Tag Management'}
              </h2>
              <button 
                onClick={() => setShowTagManagement(false)}
                className="text-2xl text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                ×
              </button>
            </div>

            {/* Warning */}
            <div className="bg-yellow-500/10 border-2 border-yellow-500/30 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⚠️</span>
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
                      <span className="text-[var(--accent)]">📁</span>
                      {category}
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
                                    disabled={!newGlobalTagName.trim() || !newGlobalTagCategory.trim()}
                                    className="px-4 py-2 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                  >
                                    ✓ {lang === 'zh' ? '保存' : 'Save'}
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
                                    className="text-sm text-[var(--accent)] hover:underline"
                                  >
                                    ✏️ {lang === 'zh' ? '编辑' : 'Edit'}
                                  </button>
                                  <button
                                    onClick={() => handleDeleteGlobalTag(tag)}
                                    className="text-sm text-red-400 hover:underline"
                                  >
                                    🗑️ {lang === 'zh' ? '删除' : 'Delete'}
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
                <div className="text-5xl mb-3">🏷️</div>
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
        <div className="modal-overlay" onClick={() => setTagToDelete(null)}>
          <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="text-5xl mb-4">⚠️</div>
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
                  ⚠️ {lang === 'zh' ? '此操作将影响以下内容：' : 'This action will affect:'}
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
                  className="btn-secondary flex-1"
                >
                  {lang === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button 
                  onClick={confirmDeleteGlobalTag}
                  className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors font-bold"
                >
                  {lang === 'zh' ? '确认删除' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
