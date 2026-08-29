import type { Book } from './store'

export type BookRelationType = 'series' | 'related' | 'prerequisite' | 'sequel' | 'prequel'

export interface BookRelation {
  id: string
  fromBookId: string
  toBookId: string
  type: BookRelationType
  note?: string
  createdAt: number
  updatedAt?: number
}

export interface BookList {
  id: string
  name: string
  description?: string
  bookIds: string[]
  createdAt: number
  updatedAt: number
}

export interface BookOrganizationData {
  lists: BookList[]
  relations: BookRelation[]
}

export interface BookOrganizationSnapshot {
  listIds: string[]
  relations: BookRelation[]
}

export const EMPTY_BOOK_ORGANIZATION: BookOrganizationData = {
  lists: [],
  relations: []
}

export const BOOK_RELATION_TYPES: BookRelationType[] = [
  'related',
  'prerequisite',
  'series',
  'sequel',
  'prequel'
]

export function getRelationTypeName(type: BookRelationType, lang: 'zh' | 'en' = 'zh'): string {
  const names: Record<BookRelationType, { zh: string; en: string }> = {
    related: { zh: '主题相关', en: 'Related topic' },
    prerequisite: { zh: '前置阅读', en: 'Prerequisite' },
    series: { zh: '同一系列', en: 'Same series' },
    sequel: { zh: '后续作品', en: 'Sequel' },
    prequel: { zh: '前作', en: 'Prequel' }
  }
  return names[type][lang]
}

export function getRelationTypeDescription(type: BookRelationType, lang: 'zh' | 'en' = 'zh'): string {
  const descriptions: Record<BookRelationType, { zh: string; en: string }> = {
    related: { zh: '两本书讨论相近主题，可对照阅读', en: 'The books cover related topics and work well together' },
    prerequisite: { zh: '建议先读目标书，再阅读当前书', en: 'Read the target book before this one' },
    series: { zh: '属于同一套书或同一系列', en: 'Books in the same series' },
    sequel: { zh: '目标书是当前书的后续作品', en: 'The target book follows this one' },
    prequel: { zh: '目标书是当前书的前作', en: 'The target book precedes this one' }
  }
  return descriptions[type][lang]
}

export function getBooksInList(list: BookList, books: Book[]): Book[] {
  const byId = new Map(books.map(book => [book.id, book]))
  return list.bookIds.flatMap(bookId => {
    const book = byId.get(bookId)
    return book ? [book] : []
  })
}

export function getRelationsForBook(bookId: string, relations: BookRelation[]): BookRelation[] {
  return relations.filter(relation => relation.fromBookId === bookId || relation.toBookId === bookId)
}

export function getRelatedBookId(bookId: string, relation: BookRelation): string {
  return relation.fromBookId === bookId ? relation.toBookId : relation.fromBookId
}

export function getBookRelationIdentity(
  fromBookId: string,
  toBookId: string,
  type: BookRelationType
): string {
  if (type === 'related' || type === 'series') {
    return [fromBookId, toBookId].sort().join('\u0000') + `\u0000${type}`
  }
  return `${fromBookId}\u0000${toBookId}\u0000${type}`
}

export function getRelationTypeNameForBook(
  bookId: string,
  relation: BookRelation,
  lang: 'zh' | 'en' = 'zh'
): string {
  if (relation.fromBookId === bookId || relation.type === 'related' || relation.type === 'series') {
    return getRelationTypeName(relation.type, lang)
  }

  const inverseType: Record<Exclude<BookRelationType, 'related' | 'series'>, BookRelationType> = {
    prerequisite: 'sequel',
    sequel: 'prequel',
    prequel: 'sequel'
  }
  return getRelationTypeName(inverseType[relation.type], lang)
}
