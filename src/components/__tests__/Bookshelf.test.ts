import { getBookshelfProgressPercentage } from '../Bookshelf'

describe('bookshelf progress', () => {
  it('shows a finished book as fully complete even when its current phase was not updated', () => {
    expect(getBookshelfProgressPercentage({ status: 'finished', currentPhase: 5 })).toBe(100)
  })

  it('keeps in-progress books based on their completed learning phases', () => {
    expect(getBookshelfProgressPercentage({ status: 'reading', currentPhase: 3 })).toBe(50)
  })
})
