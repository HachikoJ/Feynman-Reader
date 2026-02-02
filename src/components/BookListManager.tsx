'use client'

import { useState, useEffect } from 'react'
import { Book, getBooks } from '@/lib/store'
import { Language, t } from '@/lib/i18n'
import {
  BookList,
  getBookLists,
  createBookList,
  updateBookList,
  deleteBookList,
  addBookToList,
  removeBookFromList,
  getBooksInList,
  getListsForBook,
  getRelationTypeName
} from '@/lib/bookRelations'

interface Props {
  lang: Language
  book?: Book // 如果指定书籍，则显示该书所在的书单
  onBookAdded?: (listId: string) => void
}

export default function BookListManager({ lang, book, onBookAdded }: Props) {
  const [lists, setLists] = useState<BookList[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [newListDesc, setNewListDesc] = useState('')
  const [editingList, setEditingList] = useState<BookList | null>(null)
  const [viewingList, setViewingList] = useState<BookList | null>(null)
  const [allBooks] = useState<Book[]>(getBooks())

  useEffect(() => {
    loadLists()
  }, [book])

  const loadLists = () => {
    if (book) {
      // 显示该书所在的书单
      const bookLists = getListsForBook(book.id)
      setLists(bookLists)
    } else {
      // 显示所有书单
      setLists(getBookLists())
    }
  }

  const handleCreateList = () => {
    if (!newListName.trim()) return

    const newList = createBookList(
      newListName.trim(),
      newListDesc.trim() || undefined
    )

    // 如果指定了书籍，添加到新书单
    if (book) {
      addBookToList(newList.id, book.id)
    }

    setLists([...lists, newList])
    setNewListName('')
    setNewListDesc('')
    setShowCreateModal(false)

    if (book && onBookAdded) {
      onBookAdded(newList.id)
    }
  }

  const handleEditList = (list: BookList) => {
    setEditingList(list)
    setNewListName(list.name)
    setNewListDesc(list.description || '')
  }

  const handleUpdateList = () => {
    if (!editingList || !newListName.trim()) return

    const updated = updateBookList(editingList.id, {
      name: newListName.trim(),
      description: newListDesc.trim() || undefined
    })

    if (updated) {
      setLists(lists.map(l => l.id === updated.id ? updated : l))
      setEditingList(null)
      setNewListName('')
      setNewListDesc('')
    }
  }

  const handleDeleteList = (listId: string) => {
    if (confirm(lang === 'zh' ? '确定要删除这个书单吗？' : 'Delete this list?')) {
      deleteBookList(listId)
      setLists(lists.filter(l => l.id !== listId))
    }
  }

  const handleRemoveBook = (listId: string) => {
    if (!book) return

    removeBookFromList(listId, book.id)
    setLists(lists.filter(l => l.id !== listId))
  }

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">
          {book
            ? (lang === 'zh' ? '📚 书单' : '📚 Book Lists')
            : (lang === 'zh' ? '📚 我的书单' : '📚 My Lists')
          }
        </h3>
        {!book && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary text-sm py-2"
          >
            + {lang === 'zh' ? '新建书单' : 'New List'}
          </button>
        )}
      </div>

      {/* 书单列表 */}
      {lists.length === 0 ? (
        <div className="card text-center py-8">
          <div className="text-4xl mb-2">📚</div>
          <p className="text-[var(--text-secondary)]">
            {book
              ? (lang === 'zh' ? '这本书还没有添加到任何书单' : 'This book is not in any list yet')
              : (lang === 'zh' ? '还没有创建书单' : 'No lists yet')
            }
          </p>
          {!book && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-secondary mt-4"
            >
              + {lang === 'zh' ? '创建第一个书单' : 'Create first list'}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lists.map(list => (
            <div key={list.id} className="card p-4 hover:border-[var(--accent)] transition-colors">
              <div className="flex items-start justify-between mb-3">
                <h4 className="font-semibold flex-1">{list.name}</h4>
                <div className="flex gap-1">
                  {!book && (
                    <button
                      onClick={() => setViewingList(list)}
                      className="text-[var(--accent)] hover:bg-[var(--accent)]/10 p-1.5 rounded"
                      title={lang === 'zh' ? '查看' : 'View'}
                    >
                      👁️
                    </button>
                  )}
                  <button
                    onClick={() => handleEditList(list)}
                    className="text-[var(--accent)] hover:bg-[var(--accent)]/10 p-1.5 rounded"
                    title={lang === 'zh' ? '编辑' : 'Edit'}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDeleteList(list.id)}
                    className="text-red-400 hover:bg-red-400/10 p-1.5 rounded"
                    title={lang === 'zh' ? '删除' : 'Delete'}
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {list.description && (
                <p className="text-sm text-[var(--text-secondary)] mb-3 line-clamp-2">
                  {list.description}
                </p>
              )}

              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-secondary)]">
                  {list.bookIds.length} {lang === 'zh' ? '本书' : 'books'}
                </span>
                {book && (
                  <button
                    onClick={() => handleRemoveBook(list.id)}
                    className="text-red-400 hover:underline text-xs"
                  >
                    {lang === 'zh' ? '移出' : 'Remove'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 创建书单模态框 */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">
              {lang === 'zh' ? '📚 新建书单' : '📚 Create New List'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  {lang === 'zh' ? '书单名称' : 'List Name'} *
                </label>
                <input
                  type="text"
                  value={newListName}
                  onChange={e => setNewListName(e.target.value)}
                  placeholder={lang === 'zh' ? '例如：必读经典' : 'e.g., Must-read Classics'}
                  className="input-field"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  {lang === 'zh' ? '描述（选填）' : 'Description (optional)'}
                </label>
                <textarea
                  value={newListDesc}
                  onChange={e => setNewListDesc(e.target.value)}
                  placeholder={lang === 'zh' ? '这个书单的主题...' : 'Theme of this list...'}
                  className="input-field min-h-[80px] resize-y"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setNewListName('')
                  setNewListDesc('')
                }}
                className="btn-secondary flex-1"
              >
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={handleCreateList}
                className="btn-primary flex-1"
                disabled={!newListName.trim()}
              >
                {lang === 'zh' ? '创建' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑书单模态框 */}
      {editingList && (
        <div className="modal-overlay" onClick={() => setEditingList(null)}>
          <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">
              {lang === 'zh' ? '✏️ 编辑书单' : '✏️ Edit List'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  {lang === 'zh' ? '书单名称' : 'List Name'} *
                </label>
                <input
                  type="text"
                  value={newListName}
                  onChange={e => setNewListName(e.target.value)}
                  className="input-field"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  {lang === 'zh' ? '描述' : 'Description'}
                </label>
                <textarea
                  value={newListDesc}
                  onChange={e => setNewListDesc(e.target.value)}
                  className="input-field min-h-[80px] resize-y"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setEditingList(null)
                  setNewListName('')
                  setNewListDesc('')
                }}
                className="btn-secondary flex-1"
              >
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={handleUpdateList}
                className="btn-primary flex-1"
                disabled={!newListName.trim()}
              >
                {lang === 'zh' ? '保存' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 查看书单详情 */}
      {viewingList && (
        <BookListViewer
          lang={lang}
          list={viewingList}
          allBooks={allBooks}
          onClose={() => setViewingList(null)}
          onUpdate={loadLists}
        />
      )}
    </div>
  )
}

// 书单详情查看器
interface BookListViewerProps {
  lang: Language
  list: BookList
  allBooks: Book[]
  onClose: () => void
  onUpdate: () => void
}

function BookListViewer({ lang, list, allBooks, onClose, onUpdate }: BookListViewerProps) {
  const [booksInList] = useState<Book[]>(getBooksInList(list.id, allBooks))
  const [showAddBooks, setShowAddBooks] = useState(false)

  const handleRemoveBook = (bookId: string) => {
    removeBookFromList(list.id, bookId)
    onUpdate()
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">{list.name}</h2>
          <button
            onClick={onClose}
            className="text-2xl text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            ×
          </button>
        </div>

        {list.description && (
          <p className="text-[var(--text-secondary)] mb-4">{list.description}</p>
        )}

        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-[var(--text-secondary)]">
            {booksInList.length} {lang === 'zh' ? '本书' : 'books'}
          </span>
          <button
            onClick={() => setShowAddBooks(true)}
            className="btn-secondary text-sm py-2"
          >
            + {lang === 'zh' ? '添加书籍' : 'Add Books'}
          </button>
        </div>

        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {booksInList.map(book => (
            <div
              key={book.id}
              className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <h4 className="font-medium truncate">{book.name}</h4>
                {book.author && (
                  <p className="text-sm text-[var(--text-secondary)] truncate">{book.author}</p>
                )}
              </div>
              <button
                onClick={() => handleRemoveBook(book.id)}
                className="text-red-400 hover:bg-red-400/10 p-2 rounded"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>

        {booksInList.length === 0 && (
          <div className="text-center py-8 text-[var(--text-secondary)]">
            <div className="text-4xl mb-2">📚</div>
            <p>{lang === 'zh' ? '书单是空的' : 'List is empty'}</p>
          </div>
        )}
      </div>
    </div>
  )
}
