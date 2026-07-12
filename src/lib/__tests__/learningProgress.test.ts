import {
  clampCompletedPhaseCount,
  completePhase,
  getInitialPhaseIndex,
  isPhaseCompleted,
  isPhaseUnlocked
} from '../learningProgress'

describe('learning phase progress', () => {
  it('stores completed phase count from zero through all six phases', () => {
    expect(completePhase(0, 0, 6)).toBe(1)
    expect(completePhase(5, 5, 6)).toBe(6)
    expect(clampCompletedPhaseCount(6, 6)).toBe(6)
  })

  it('does not advance when revisiting an already completed phase', () => {
    expect(completePhase(2, 4, 6)).toBe(4)
  })

  it('unlocks only the next phase and marks only completed phases complete', () => {
    expect(isPhaseCompleted(2, 3)).toBe(true)
    expect(isPhaseCompleted(3, 3)).toBe(false)
    expect(isPhaseUnlocked(3, 3)).toBe(true)
    expect(isPhaseUnlocked(4, 3)).toBe(false)
  })

  it('uses a valid phase index when all phases are complete', () => {
    expect(getInitialPhaseIndex(6, 6, false)).toBe(5)
    expect(getInitialPhaseIndex(3, 6, false)).toBe(3)
    expect(getInitialPhaseIndex(3, 6, true)).toBe(0)
  })
})
