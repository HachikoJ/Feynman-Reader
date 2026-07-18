import { getBookshelfProgressPercentage } from '../Bookshelf'

describe('bookshelf progress', () => {
  it('always uses the actual completed phase count', () => {
    expect(getBookshelfProgressPercentage({ currentPhase: 5 })).toBeCloseTo(83.33, 1)
  })

  it('keeps in-progress books based on their completed learning phases', () => {
    expect(getBookshelfProgressPercentage({ currentPhase: 3 })).toBe(50)
  })
})
