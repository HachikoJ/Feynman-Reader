'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  addBookRelation,
  Book,
  createBookList,
  deleteBookList,
  deleteBookRelation,
  flushPendingStoreWrites,
  getBookLists,
  getBookRelations,
  getBooks,
  reloadBookOrganizationFromPersistence,
  setBookListMembership,
  updateBookList
} from '@/lib/store'
import {
  BOOK_RELATION_TYPES,
  BookList,
  BookRelation,
  BookRelationType,
  getBooksInList,
  getRelatedBookId,
  getRelationTypeDescription,
  getRelationTypeName,
  getRelationTypeNameForBook,
  getRelationsForBook
} from '@/lib/bookRelations'
import {
  MAX_BOOK_LIST_DESCRIPTION_LENGTH,
  MAX_BOOK_LIST_NAME_LENGTH,
  MAX_BOOK_RELATION_NOTE_LENGTH
} from '@/lib/dataLimits'
import { Language } from '@/lib/i18n'
import { showAppConfirm } from '@/lib/appDialog'
import AppIcon from './AppIcon'

interface Props {
  lang: Language
  book?: Book
  onBookAdded?: (listId: string) => void
  onOpenBook?: (book: Book) => void
}

type ListFormMode = 'create' | 'edit' | null

export default function BookListManager({ lang, book, onBookAdded, onOpenBook }: Props) {
  const [lists, setLists] = useState<BookList[]>([])
  const [relations, setRelations] = useState<BookRelation[]>([])
  const [books, setBooks] = useState<Book[]>([])
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [listFormMode, setListFormMode] = useState<ListFormMode>(null)
  const [listName, setListName] = useState('')
  const [listDescription, setListDescription] = useState('')
  const [bookSearch, setBookSearch] = useState('')
  const [relationBookId, setRelationBookId] = useState('')
  const [relationType, setRelationType] = useState<BookRelationType>('related')
  const [relationNote, setRelationNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmingListId, setConfirmingListId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = () => {
    const nextLists = getBookLists()
    setLists(nextLists)
    setRelations(getBookRelations())
    setBooks(getBooks())
    setSelectedListId(current => {
      if (current && nextLists.some(list => list.id === current)) return current
      return nextLists[0]?.id || null
    })
  }

  useEffect(() => {
    refresh()
  }, [book?.id])

  const selectedList = lists.find(list => list.id === selectedListId) || null
  const currentBookRelations = book ? getRelationsForBook(book.id, relations) : []

  const filteredBooks = useMemo(() => {
    const query = bookSearch.trim().toLowerCase()
    if (!query) return books
    return books.filter(candidate => [candidate.name, candidate.author || '']
      .join(' ')
      .toLowerCase()
      .includes(query))
  }, [bookSearch, books])

  const persistMutation = async (mutation: () => void): Promise<boolean> => {
    if (busy) return false
    setBusy(true)
    setError(null)
    try {
      await flushPendingStoreWrites()
      mutation()
      await flushPendingStoreWrites()
      refresh()
      return true
    } catch {
      await reloadBookOrganizationFromPersistence().catch(() => undefined)
      refresh()
      setError(lang === 'zh'
        ? '书单或书籍关系未能保存到本地，请检查浏览器存储后重试。'
        : 'The list or relationship could not be saved locally. Check browser storage and try again.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const openCreateForm = () => {
    setListName('')
    setListDescription('')
    setListFormMode('create')
    setError(null)
  }

  const openEditForm = (list: BookList) => {
    setSelectedListId(list.id)
    setListName(list.name)
    setListDescription(list.description || '')
    setListFormMode('edit')
    setError(null)
  }

  const closeListForm = () => {
    setListFormMode(null)
    setListName('')
    setListDescription('')
  }

  const saveList = async () => {
    const cleanName = listName.trim()
    if (!cleanName) {
      setError(lang === 'zh' ? '请填写书单名称。' : 'Enter a list name.')
      return
    }

    let savedListId = selectedListId
    const succeeded = await persistMutation(() => {
      if (listFormMode === 'edit' && selectedListId) {
        updateBookList(selectedListId, {
          name: cleanName,
          description: listDescription.trim() || undefined
        })
        return
      }

      const created = createBookList(cleanName, listDescription.trim() || undefined)
      savedListId = created.id
      if (book) setBookListMembership(created.id, book.id, true)
    })

    if (!succeeded) return
    if (savedListId) setSelectedListId(savedListId)
    if (book && savedListId) onBookAdded?.(savedListId)
    closeListForm()
  }

  const removeList = async (list: BookList) => {
    if (busy || confirmingListId) return
    setConfirmingListId(list.id)
    try {
      const confirmed = await showAppConfirm({
        title: lang === 'zh' ? '确认删除书单' : 'Confirm list deletion',
        message: lang === 'zh'
          ? `确定删除书单“${list.name}”吗？书籍本身及其学习记录不会被删除。`
          : `Delete "${list.name}"? Its books and learning records will be kept.`,
        confirmText: lang === 'zh' ? '确认删除' : 'Delete',
        cancelText: lang === 'zh' ? '取消' : 'Cancel',
        tone: 'danger'
      })
      if (!confirmed) return
      await persistMutation(() => deleteBookList(list.id))
    } finally {
      setConfirmingListId(null)
    }
  }

  const toggleMembership = async (listId: string, bookId: string, included: boolean) => {
    const succeeded = await persistMutation(() => setBookListMembership(listId, bookId, included))
    if (succeeded && book && included) onBookAdded?.(listId)
  }

  const createRelation = async () => {
    if (!book || !relationBookId) {
      setError(lang === 'zh' ? '请选择要关联的书籍。' : 'Choose a related book.')
      return
    }
    const succeeded = await persistMutation(() => {
      addBookRelation(book.id, relationBookId, relationType, relationNote.trim() || undefined)
    })
    if (succeeded) {
      setRelationBookId('')
      setRelationNote('')
      setRelationType('related')
    }
  }

  const removeRelation = async (relationId: string) => {
    await persistMutation(() => deleteBookRelation(relationId))
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <AppIcon name={book ? 'bookMarked' : 'library'} tone="blue" size={22} />
            {book
              ? (lang === 'zh' ? `整理《${book.name}》` : `Organize "${book.name}"`)
              : (lang === 'zh' ? '自定义书单' : 'Custom Book Lists')}
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {book
              ? (lang === 'zh' ? '管理书单归属，并建立与书架中其他书籍的阅读关系。' : 'Manage list membership and reading relationships with other books.')
              : (lang === 'zh' ? '创建主题书单，并直接调整每个书单包含的书籍。' : 'Create themed lists and manage their books directly.')}
          </p>
        </div>
        <button type="button" onClick={openCreateForm} className="btn-primary text-sm py-2" disabled={busy}>
          <AppIcon name="plus" size={16} />
          {lang === 'zh' ? '新建书单' : 'New List'}
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <AppIcon name="alert" tone="red" size={17} className="mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {listFormMode && (
        <div className="rounded-lg border border-[var(--accent)]/35 bg-[var(--accent)]/5 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-semibold">
              {listFormMode === 'create'
                ? (lang === 'zh' ? '新建书单' : 'Create list')
                : (lang === 'zh' ? '编辑书单' : 'Edit list')}
            </h3>
            <button type="button" onClick={closeListForm} className="icon-button" aria-label={lang === 'zh' ? '关闭表单' : 'Close form'}>
              <AppIcon name="close" size={18} />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-end">
            <label className="text-sm">
              <span className="mb-1 block font-medium">{lang === 'zh' ? '名称' : 'Name'}</span>
              <input
                value={listName}
                onChange={event => setListName(event.target.value)}
                maxLength={MAX_BOOK_LIST_NAME_LENGTH}
                className="input-field"
                autoFocus
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">{lang === 'zh' ? '描述（选填）' : 'Description (optional)'}</span>
              <input
                value={listDescription}
                onChange={event => setListDescription(event.target.value)}
                maxLength={MAX_BOOK_LIST_DESCRIPTION_LENGTH}
                className="input-field"
              />
            </label>
            <button type="button" onClick={saveList} className="btn-primary h-11" disabled={busy || !listName.trim()}>
              <AppIcon name="check" size={17} />
              {lang === 'zh' ? '保存' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {book ? (
        <BookOrganizer
          lang={lang}
          book={book}
          lists={lists}
          books={books}
          relations={currentBookRelations}
          relationBookId={relationBookId}
          relationType={relationType}
          relationNote={relationNote}
          busy={busy || Boolean(confirmingListId)}
          onToggleMembership={toggleMembership}
          onRelationBookChange={setRelationBookId}
          onRelationTypeChange={setRelationType}
          onRelationNoteChange={setRelationNote}
          onCreateRelation={createRelation}
          onDeleteRelation={removeRelation}
          onOpenBook={onOpenBook}
        />
      ) : (
        <LibraryListEditor
          lang={lang}
          lists={lists}
          books={books}
          filteredBooks={filteredBooks}
          selectedList={selectedList}
          selectedListId={selectedListId}
          bookSearch={bookSearch}
          busy={busy || Boolean(confirmingListId)}
          onSelectList={setSelectedListId}
          onBookSearch={setBookSearch}
          onEditList={openEditForm}
          onDeleteList={removeList}
          onToggleMembership={toggleMembership}
          onOpenBook={onOpenBook}
        />
      )}
    </div>
  )
}

interface LibraryListEditorProps {
  lang: Language
  lists: BookList[]
  books: Book[]
  filteredBooks: Book[]
  selectedList: BookList | null
  selectedListId: string | null
  bookSearch: string
  busy: boolean
  onSelectList: (listId: string) => void
  onBookSearch: (value: string) => void
  onEditList: (list: BookList) => void
  onDeleteList: (list: BookList) => void
  onToggleMembership: (listId: string, bookId: string, included: boolean) => void
  onOpenBook?: (book: Book) => void
}

function LibraryListEditor({
  lang,
  lists,
  books,
  filteredBooks,
  selectedList,
  selectedListId,
  bookSearch,
  busy,
  onSelectList,
  onBookSearch,
  onEditList,
  onDeleteList,
  onToggleMembership,
  onOpenBook
}: LibraryListEditorProps) {
  if (lists.length === 0) {
    return (
      <div className="py-12 text-center text-[var(--text-secondary)]">
        <AppIcon name="library" tone="muted" size={38} className="mx-auto mb-3" />
        <p>{lang === 'zh' ? '还没有书单，先创建一个主题书单。' : 'No lists yet. Create a themed list first.'}</p>
      </div>
    )
  }

  const booksInList = selectedList ? getBooksInList(selectedList, books) : []

  return (
    <div className="grid min-h-[390px] gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
      <div className="space-y-2 border-b border-[var(--border)] pb-4 md:border-b-0 md:border-r md:pb-0 md:pr-4">
        {lists.map(list => (
          <button
            key={list.id}
            type="button"
            onClick={() => onSelectList(list.id)}
            className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
              selectedListId === list.id
                ? 'bg-[var(--accent)] text-white'
                : 'hover:bg-[var(--bg-secondary)]'
            }`}
          >
            <span className="min-w-0 flex-1 truncate font-medium">{list.name}</span>
            <span className="shrink-0 text-xs opacity-75">{list.bookIds.length}</span>
          </button>
        ))}
      </div>

      {selectedList && (
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold">{selectedList.name}</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {selectedList.description || (lang === 'zh' ? '暂无描述' : 'No description')}
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {lang === 'zh' ? `已收录 ${booksInList.length} 本书` : `${booksInList.length} books included`}
              </p>
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={() => onEditList(selectedList)} className="icon-button" title={lang === 'zh' ? '编辑书单' : 'Edit list'}>
                <AppIcon name="edit" tone="amber" size={18} />
              </button>
              <button type="button" onClick={() => onDeleteList(selectedList)} className="icon-button" title={lang === 'zh' ? '删除书单' : 'Delete list'}>
                <AppIcon name="trash" tone="red" size={18} />
              </button>
            </div>
          </div>

          <div className="relative mb-3">
            <input
              value={bookSearch}
              onChange={event => onBookSearch(event.target.value)}
              placeholder={lang === 'zh' ? '搜索书名或作者' : 'Search title or author'}
              className="input-field"
            />
          </div>

          <div className="max-h-[330px] space-y-2 overflow-y-auto pr-1">
            {filteredBooks.map(candidate => {
              const included = selectedList.bookIds.includes(candidate.id)
              return (
                <div key={candidate.id} className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={included}
                    onChange={event => onToggleMembership(selectedList.id, candidate.id, event.target.checked)}
                    disabled={busy}
                    aria-label={included
                      ? (lang === 'zh' ? `从“${selectedList.name}”移出《${candidate.name}》` : `Remove ${candidate.name} from ${selectedList.name}`)
                      : (lang === 'zh' ? `将《${candidate.name}》加入“${selectedList.name}”` : `Add ${candidate.name} to ${selectedList.name}`)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  <button type="button" onClick={() => onOpenBook?.(candidate)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium">{candidate.name}</span>
                    {candidate.author && <span className="block truncate text-xs text-[var(--text-secondary)]">{candidate.author}</span>}
                  </button>
                  <span className={`text-xs ${included ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text-secondary)]'}`}>
                    {included ? (lang === 'zh' ? '已加入' : 'Included') : (lang === 'zh' ? '未加入' : 'Not included')}
                  </span>
                </div>
              )
            })}
            {filteredBooks.length === 0 && (
              <p className="py-8 text-center text-sm text-[var(--text-secondary)]">
                {lang === 'zh' ? '没有匹配的书籍。' : 'No matching books.'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface BookOrganizerProps {
  lang: Language
  book: Book
  lists: BookList[]
  books: Book[]
  relations: BookRelation[]
  relationBookId: string
  relationType: BookRelationType
  relationNote: string
  busy: boolean
  onToggleMembership: (listId: string, bookId: string, included: boolean) => void
  onRelationBookChange: (bookId: string) => void
  onRelationTypeChange: (type: BookRelationType) => void
  onRelationNoteChange: (note: string) => void
  onCreateRelation: () => void
  onDeleteRelation: (relationId: string) => void
  onOpenBook?: (book: Book) => void
}

function BookOrganizer({
  lang,
  book,
  lists,
  books,
  relations,
  relationBookId,
  relationType,
  relationNote,
  busy,
  onToggleMembership,
  onRelationBookChange,
  onRelationTypeChange,
  onRelationNoteChange,
  onCreateRelation,
  onDeleteRelation,
  onOpenBook
}: BookOrganizerProps) {
  const otherBooks = books.filter(candidate => candidate.id !== book.id)

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <AppIcon name="library" tone="blue" size={18} />
          {lang === 'zh' ? '所属书单' : 'List membership'}
        </h3>
        <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {lists.map(list => {
            const included = list.bookIds.includes(book.id)
            return (
              <label key={list.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--border)] p-3 hover:bg-[var(--bg-secondary)]">
                <input
                  type="checkbox"
                  checked={included}
                  onChange={event => onToggleMembership(list.id, book.id, event.target.checked)}
                  disabled={busy}
                  aria-label={included
                    ? (lang === 'zh' ? `从“${list.name}”移出《${book.name}》` : `Remove ${book.name} from ${list.name}`)
                    : (lang === 'zh' ? `将《${book.name}》加入“${list.name}”` : `Add ${book.name} to ${list.name}`)}
                  className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{list.name}</span>
                  <span className="block text-xs text-[var(--text-secondary)]">
                    {list.description || (lang === 'zh' ? `${list.bookIds.length} 本书` : `${list.bookIds.length} books`)}
                  </span>
                </span>
              </label>
            )
          })}
          {lists.length === 0 && (
            <p className="rounded-lg border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
              {lang === 'zh' ? '还没有书单，可使用上方按钮创建并自动加入当前书。' : 'No lists yet. Create one above to include this book automatically.'}
            </p>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <AppIcon name="route" tone="violet" size={18} />
          {lang === 'zh' ? '书籍关系' : 'Book relationships'}
        </h3>

        <div className="mb-4 space-y-2">
          {relations.map(relation => {
            const relatedBook = books.find(candidate => candidate.id === getRelatedBookId(book.id, relation))
            if (!relatedBook) return null
            return (
              <div key={relation.id} className="flex items-start gap-3 rounded-lg border border-[var(--border)] p-3">
                <AppIcon name="bookOpen" tone="violet" size={18} className="mt-0.5" />
                <button type="button" onClick={() => onOpenBook?.(relatedBook)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-medium">{relatedBook.name}</span>
                  <span className="block text-xs text-[var(--accent)]">
                    {getRelationTypeNameForBook(book.id, relation, lang)}
                  </span>
                  {relation.note && <span className="mt-1 block text-xs text-[var(--text-secondary)]">{relation.note}</span>}
                </button>
                <button type="button" onClick={() => onDeleteRelation(relation.id)} disabled={busy} className="icon-button" title={lang === 'zh' ? '删除关系' : 'Delete relationship'}>
                  <AppIcon name="trash" tone="red" size={17} />
                </button>
              </div>
            )
          })}
          {relations.length === 0 && (
            <p className="rounded-lg border border-dashed border-[var(--border)] px-4 py-5 text-center text-sm text-[var(--text-secondary)]">
              {lang === 'zh' ? '暂未建立书籍关系。' : 'No relationships yet.'}
            </p>
          )}
        </div>

        {otherBooks.length > 0 ? (
          <div className="space-y-3 rounded-lg bg-[var(--bg-secondary)] p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium">{lang === 'zh' ? '关联书籍' : 'Related book'}</span>
                <select value={relationBookId} onChange={event => onRelationBookChange(event.target.value)} className="input-field">
                  <option value="">{lang === 'zh' ? '请选择' : 'Choose'}</option>
                  {otherBooks.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">{lang === 'zh' ? '关系类型' : 'Relationship'}</span>
                <select value={relationType} onChange={event => onRelationTypeChange(event.target.value as BookRelationType)} className="input-field">
                  {BOOK_RELATION_TYPES.map(type => (
                    <option key={type} value={type}>{getRelationTypeName(type, lang)}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">{getRelationTypeDescription(relationType, lang)}</p>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{lang === 'zh' ? '备注（选填）' : 'Note (optional)'}</span>
              <input
                value={relationNote}
                onChange={event => onRelationNoteChange(event.target.value)}
                maxLength={MAX_BOOK_RELATION_NOTE_LENGTH}
                className="input-field"
              />
            </label>
            <button type="button" onClick={onCreateRelation} disabled={busy || !relationBookId} className="btn-primary w-full">
              <AppIcon name="plus" size={17} />
              {lang === 'zh' ? '添加关系' : 'Add relationship'}
            </button>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">
            {lang === 'zh' ? '书架中至少需要两本书才能建立关系。' : 'Add at least two books to create a relationship.'}
          </p>
        )}
      </section>
    </div>
  )
}
