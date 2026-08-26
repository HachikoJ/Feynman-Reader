import { createSampleBook, SAMPLE_BOOK_DATA_VERSION, SAMPLE_BOOK_ID } from '../sampleBook'

describe('bundled sample book', () => {
  it('contains the complete human-reviewed learning record', () => {
    const book = createSampleBook()

    expect(book.id).toBe(SAMPLE_BOOK_ID)
    expect(book.sampleDataVersion).toBe(SAMPLE_BOOK_DATA_VERSION)
    expect(book.cover).toBe('/kite-runner-cover.png')
    expect(Object.keys(book.responses)).toHaveLength(6)
    expect(book.noteRecords).toHaveLength(1)
    expect(book.practiceRecords[0]).toMatchObject({ bookId: SAMPLE_BOOK_ID, scores: { overall: 83 } })
    expect(book.qaPracticeRecords[0].questions).toHaveLength(3)
    expect(book.qaPracticeRecords[0].questions.every(question => question.passed)).toBe(true)
    expect(book.bestScore).toBe(86)
  })

  it('returns an independent copy for each seed operation', () => {
    const first = createSampleBook()
    const second = createSampleBook()

    first.noteRecords[0].content = 'changed'
    expect(second.noteRecords[0].content).not.toBe('changed')
  })
})
