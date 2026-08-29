import { getRecommendedPersonas } from '../practiceEnhancement'

describe('recommended persona combinations', () => {
  it.each([undefined, 'beginner', 'balanced', 'challenging'] as const)(
    'returns three roles from three different categories for %s preference',
    preference => {
      const recommended = getRecommendedPersonas(preference)

      expect(recommended).toHaveLength(3)
      expect(new Set(recommended.map(persona => persona.category)).size).toBe(3)
      expect(new Set(recommended.map(persona => persona.id)).size).toBe(3)
    }
  )

  it('keeps simple recommendations away from critical personas', () => {
    const recommended = getRecommendedPersonas('beginner')

    expect(recommended.map(persona => persona.category).sort()).toEqual(['beginner', 'expert', 'peer'])
  })

  it('keeps challenging recommendations away from beginner personas', () => {
    const recommended = getRecommendedPersonas('challenging')

    expect(recommended.map(persona => persona.category).sort()).toEqual(['critical', 'expert', 'peer'])
    expect(recommended.some(persona => persona.id === 'elementary')).toBe(false)
  })

  it('does not keep the default recommendation fixed', () => {
    let calls = 0
    const randomSpy = jest.spyOn(Math, 'random').mockImplementation(() => {
      calls += 1
      return calls <= 6 ? 0 : 0.999999
    })

    const combinations = new Set([
      getRecommendedPersonas('balanced').map(persona => persona.id).join(','),
      getRecommendedPersonas('balanced').map(persona => persona.id).join(',')
    ])

    randomSpy.mockRestore()

    expect(combinations.size).toBe(2)
  })
})
