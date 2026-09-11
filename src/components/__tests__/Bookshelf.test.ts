import { getBookReadingPercentage, getBookshelfProgressPercentage, scoreReviewPriority } from '../Bookshelf'
import type { Book } from '@/lib/store'

function reviewBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 'book',
    name: 'Book',
    status: 'reading',
    currentPhase: 3,
    noteRecords: [],
    responses: {},
    practiceRecords: [],
    qaPracticeRecords: [],
    bestScore: 75,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('bookshelf progress', () => {
  it('always uses the actual completed phase count', () => {
    expect(getBookshelfProgressPercentage({ currentPhase: 5 })).toBeCloseTo(83.33, 1)
  })

  it('keeps in-progress books based on their completed learning phases', () => {
    expect(getBookshelfProgressPercentage({ currentPhase: 3 })).toBe(50)
  })
})

describe('bookshelf reading progress', () => {
  it('shows nothing for books without imported source text', () => {
    expect(getBookReadingPercentage({})).toBeNull()
  })

  it('treats an untouched reader as not started', () => {
    expect(getBookReadingPercentage({ readingProgress: { currentPage: 0, totalPages: 12, percentage: 0 } })).toBeNull()
  })

  it('rounds and clamps the stored reading percentage', () => {
    expect(getBookReadingPercentage({ readingProgress: { currentPage: 3, totalPages: 12, percentage: 25 } })).toBe(25)
    expect(getBookReadingPercentage({ readingProgress: { currentPage: 2, totalPages: 3, percentage: 66.6 } })).toBe(67)
    expect(getBookReadingPercentage({ readingProgress: { currentPage: 3, totalPages: 3, percentage: 140 } })).toBe(100)
  })

  it('counts a stored page position as started even when the percentage rounds to zero', () => {
    expect(getBookReadingPercentage({ readingProgress: { currentPage: 1, totalPages: 240, percentage: 0.4 } })).toBe(0)
  })

  it('ignores a corrupt percentage instead of rendering NaN', () => {
    expect(getBookReadingPercentage({ readingProgress: { currentPage: 0, totalPages: 12, percentage: Number.NaN } })).toBeNull()
  })
})

describe('Feynman review priority', () => {
  const now = Date.parse('2026-08-30T00:00:00Z')

  it('prioritizes a weak role-based answer over a recently active book', () => {
    const weak = reviewBook({
      qaPracticeRecords: [{ id: 'qa', bookId: 'book', allPassed: false, createdAt: now, updatedAt: now, questions: [{ persona: 'professional', personaName: '专业人士', question: 'Why?', score: 55 }] }],
      updatedAt: now,
    })
    const recent = reviewBook({ updatedAt: now, currentPhase: 1, bestScore: 70 })
    expect(scoreReviewPriority(weak, now)).toBeGreaterThan(scoreReviewPriority(recent, now))
  })

  it('gives unread books a lower review score than active reading', () => {
    expect(scoreReviewPriority(reviewBook({ status: 'reading' }), now)).toBeGreaterThan(scoreReviewPriority(reviewBook({ status: 'unread' }), now))
  })
})
