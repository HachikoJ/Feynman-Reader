/**
 * 书籍关系管理模块
 * 支持书籍关联、书单、前置/后续阅读等功能
 */

import { Book } from './store'
import { logger } from './logger'

// 书籍关系类型
export type BookRelationType = 'series' | 'related' | 'prerequisite' | 'sequel' | 'prequel'

// 书籍关系
export interface BookRelation {
  id: string
  fromBookId: string
  toBookId: string
  type: BookRelationType
  note?: string // 关联说明
  createdAt: number
}

// 书单
export interface BookList {
  id: string
  name: string
  description?: string
  cover?: string
  bookIds: string[]
  tags?: string[]
  isPublic: boolean
  createdAt: number
  updatedAt: number
}

// 书籍扩展（包含关系信息）
export interface ExtendedBook extends Book {
  relations?: BookRelation[]
  relatedBooks?: Book[]
  lists?: string[] // 所属书单 ID
}

const RELATIONS_KEY = 'feynman-book-relations'
const LISTS_KEY = 'feynman-book-lists'

/**
 * 获取所有书籍关系
 */
export function getBookRelations(): BookRelation[] {
  if (typeof window === 'undefined') return []
  const saved = localStorage.getItem(RELATIONS_KEY)
  if (saved) {
    try {
      return JSON.parse(saved)
    } catch (e) {
      logger.error('Failed to parse book relations:', e)
      return []
    }
  }
  return []
}

/**
 * 保存书籍关系
 */
function saveBookRelations(relations: BookRelation[]): void {
  localStorage.setItem(RELATIONS_KEY, JSON.stringify(relations))
}

/**
 * 添加书籍关系
 */
export function addBookRelation(
  fromBookId: string,
  toBookId: string,
  type: BookRelationType,
  note?: string
): BookRelation {
  const relations = getBookRelations()

  // 检查是否已存在相同关系
  const exists = relations.some(
    r => r.fromBookId === fromBookId && r.toBookId === toBookId && r.type === type
  )
  if (exists) {
    throw new Error('该关系已存在')
  }

  const relation: BookRelation = {
    id: Date.now().toString(),
    fromBookId,
    toBookId,
    type,
    note,
    createdAt: Date.now()
  }

  relations.push(relation)
  saveBookRelations(relations)

  return relation
}

/**
 * 删除书籍关系
 */
export function removeBookRelation(relationId: string): boolean {
  const relations = getBookRelations()
  const index = relations.findIndex(r => r.id === relationId)
  if (index === -1) return false

  relations.splice(index, 1)
  saveBookRelations(relations)
  return true
}

/**
 * 删除书籍的所有关系
 */
export function removeBookRelations(bookId: string): void {
  const relations = getBookRelations()
  const filtered = relations.filter(r => r.fromBookId !== bookId && r.toBookId !== bookId)
  saveBookRelations(filtered)
}

/**
 * 获取书籍的关联关系
 */
export function getBookRelationsFor(bookId: string): {
  outgoing: BookRelation[] // 从该书出发的关系
  incoming: BookRelation[] // 指向该书的关系
} {
  const relations = getBookRelations()
  return {
    outgoing: relations.filter(r => r.fromBookId === bookId),
    incoming: relations.filter(r => r.toBookId === bookId)
  }
}

/**
 * 获取书籍的相关书籍列表
 */
export function getRelatedBooks(bookId: string, allBooks: Book[]): Book[] {
  const { outgoing } = getBookRelationsFor(bookId)
  const relatedIds = outgoing.map(r => r.toBookId)
  return allBooks.filter(b => relatedIds.includes(b.id))
}

/**
 * 获取书籍的前置书籍
 */
export function getPrerequisiteBooks(bookId: string, allBooks: Book[]): Book[] {
  const { incoming } = getBookRelationsFor(bookId)
  const prerequisiteIds = incoming
    .filter(r => r.type === 'prerequisite')
    .map(r => r.fromBookId)
  return allBooks.filter(b => prerequisiteIds.includes(b.id))
}

/**
 * 获取书籍的后续书籍
 */
export function getSequelBooks(bookId: string, allBooks: Book[]): Book[] {
  const { outgoing } = getBookRelationsFor(bookId)
  const sequelIds = outgoing
    .filter(r => r.type === 'sequel')
    .map(r => r.toBookId)
  return allBooks.filter(b => sequelIds.includes(b.id))
}

/**
 * 获取同系列书籍
 */
export function getSeriesBooks(bookId: string, allBooks: Book[]): Book[] {
  const relations = getBookRelations()
  const seriesRelations = relations.filter(r =>
    (r.fromBookId === bookId || r.toBookId === bookId) && r.type === 'series'
  )

  const seriesIds = new Set<string>()
  seriesIds.add(bookId)

  seriesRelations.forEach(r => {
    seriesIds.add(r.fromBookId)
    seriesIds.add(r.toBookId)
  })

  return allBooks.filter(b => seriesIds.has(b.id) && b.id !== bookId)
}

// ==================== 书单管理 ====================

/**
 * 获取所有书单
 */
export function getBookLists(): BookList[] {
  if (typeof window === 'undefined') return []
  const saved = localStorage.getItem(LISTS_KEY)
  if (saved) {
    try {
      return JSON.parse(saved)
    } catch (e) {
      logger.error('Failed to parse book lists:', e)
      return []
    }
  }
  return []
}

/**
 * 保存书单
 */
function saveBookLists(lists: BookList[]): void {
  localStorage.setItem(LISTS_KEY, JSON.stringify(lists))
}

/**
 * 创建书单
 */
export function createBookList(
  name: string,
  description?: string,
  cover?: string
): BookList {
  const lists = getBookLists()

  const newList: BookList = {
    id: Date.now().toString(),
    name,
    description,
    cover,
    bookIds: [],
    isPublic: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }

  lists.push(newList)
  saveBookLists(lists)

  return newList
}

/**
 * 更新书单
 */
export function updateBookList(
  listId: string,
  updates: Partial<Omit<BookList, 'id' | 'createdAt'>>
): BookList | null {
  const lists = getBookLists()
  const index = lists.findIndex(l => l.id === listId)
  if (index === -1) return null

  lists[index] = {
    ...lists[index],
    ...updates,
    updatedAt: Date.now()
  }

  saveBookLists(lists)
  return lists[index]
}

/**
 * 删除书单
 */
export function deleteBookList(listId: string): boolean {
  const lists = getBookLists()
  const index = lists.findIndex(l => l.id === listId)
  if (index === -1) return false

  lists.splice(index, 1)
  saveBookLists(lists)
  return true
}

/**
 * 添加书籍到书单
 */
export function addBookToList(listId: string, bookId: string): boolean {
  const lists = getBookLists()
  const list = lists.find(l => l.id === listId)
  if (!list) return false

  if (list.bookIds.includes(bookId)) return false // 已存在

  list.bookIds.push(bookId)
  list.updatedAt = Date.now()
  saveBookLists(lists)
  return true
}

/**
 * 从书单中移除书籍
 */
export function removeBookFromList(listId: string, bookId: string): boolean {
  const lists = getBookLists()
  const list = lists.find(l => l.id === listId)
  if (!list) return false

  const index = list.bookIds.indexOf(bookId)
  if (index === -1) return false

  list.bookIds.splice(index, 1)
  list.updatedAt = Date.now()
  saveBookLists(lists)
  return true
}

/**
 * 获取书单中的书籍
 */
export function getBooksInList(listId: string, allBooks: Book[]): Book[] {
  const lists = getBookLists()
  const list = lists.find(l => l.id === listId)
  if (!list) return []

  return allBooks.filter(b => list.bookIds.includes(b.id))
}

/**
 * 获取书籍所在的书单
 */
export function getListsForBook(bookId: string): BookList[] {
  const lists = getBookLists()
  return lists.filter(l => l.bookIds.includes(bookId))
}

/**
 * 获取推荐阅读路径（基于前置关系）
 */
export function getReadingPath(bookId: string, allBooks: Book[]): Book[] {
  const path: Book[] = []
  const visited = new Set<string>()

  const traverse = (id: string) => {
    if (visited.has(id)) return
    visited.add(id)

    // 先添加前置书籍
    const prerequisites = getPrerequisiteBooks(id, allBooks)
    prerequisites.forEach(book => traverse(book.id))

    // 再添加当前书籍
    const book = allBooks.find(b => b.id === id)
    if (book && !path.find(p => p.id === id)) {
      path.push(book)
    }
  }

  traverse(bookId)
  return path
}

/**
 * 获取关系类型的中文名称
 */
export function getRelationTypeName(type: BookRelationType): string {
  const names: Record<BookRelationType, string> = {
    series: '系列',
    related: '相关',
    prerequisite: '前置必读',
    sequel: '续作',
    prequel: '前作'
  }
  return names[type] || type
}

/**
 * 获取关系类型的描述
 */
export function getRelationTypeDescription(type: BookRelationType): string {
  const descriptions: Record<BookRelationType, string> = {
    series: '同一系列的书籍，建议按顺序阅读',
    related: '内容相关的书籍，可以互相参考',
    prerequisite: '阅读本书前建议先阅读的书籍',
    sequel: '本书的后续作品',
    prequel: '本书的前作'
  }
  return descriptions[type] || ''
}
