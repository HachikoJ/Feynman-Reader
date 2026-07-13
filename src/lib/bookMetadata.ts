import type { Book, BookTag } from './store'

export interface BookMetadataCandidate {
  author?: string
  description?: string
  tags: BookTag[]
}

type MetadataBook = Pick<Book, 'status' | 'author' | 'description' | 'tags'>

export function needsBookMetadataEnrichment(book: MetadataBook): boolean {
  if (book.status === 'unread') return false
  return !book.author?.trim() || !book.description?.trim() || !book.tags?.length
}

export function buildMissingBookMetadataUpdates(
  book: MetadataBook,
  candidate: BookMetadataCandidate
): Pick<Partial<Book>, 'author' | 'description' | 'tags'> {
  const updates: Pick<Partial<Book>, 'author' | 'description' | 'tags'> = {}

  if (!book.author?.trim() && candidate.author?.trim()) updates.author = candidate.author.trim()
  if (!book.description?.trim() && candidate.description?.trim()) updates.description = candidate.description.trim()
  if (!book.tags?.length && candidate.tags.length > 0) updates.tags = candidate.tags

  return updates
}
