import { getBookshelfProgressPercentage, scoreReviewPriority } from '../Bookshelf'
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
