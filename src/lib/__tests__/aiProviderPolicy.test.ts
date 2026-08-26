import {
  DEEPSEEK_OFFICIAL_SUNSET_AT,
  isDeepSeekOfficialSupported,
  migrateToTokenDanceAfterSunset
} from '../aiProviderPolicy'

describe('official DeepSeek sunset policy', () => {
  it('uses the explicit Asia/Shanghai cutoff instant', () => {
    expect(DEEPSEEK_OFFICIAL_SUNSET_AT.toISOString()).toBe('2026-09-30T16:00:00.000Z')
    expect(isDeepSeekOfficialSupported(new Date('2026-09-30T15:59:59.999Z'))).toBe(true)
    expect(isDeepSeekOfficialSupported(new Date('2026-09-30T16:00:00.000Z'))).toBe(false)
  })

  it('clears official DeepSeek credentials without repurposing them as TokenDance keys', () => {
    expect(migrateToTokenDanceAfterSunset({
      apiKey: 'deepseek-official-key',
      aiProvider: 'deepseek' as const,
      aiDataConsent: true
    }, new Date('2026-09-30T16:00:00.000Z'))).toEqual({
      apiKey: '',
      aiProvider: 'tokendance',
      aiDataConsent: false
    })
  })
})
