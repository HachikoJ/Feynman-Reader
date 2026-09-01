import {
  isDeepSeekOfficialEnabled,
  isDeepSeekOfficialSupported,
  isTokenDanceEnabled,
  isTokenDanceOnly,
  resolveAIProvider,
  migrateToTokenDanceAfterSunset
} from '../aiProviderPolicy'

describe('environment-driven AI channel policy', () => {
  const previous = {
    watcha: process.env.FEYNMAN_WATCHA_OAUTH_ENABLED,
    tokenDance: process.env.FEYNMAN_TOKENDANCE_ENABLED,
    deepSeek: process.env.FEYNMAN_DEEPSEEK_OFFICIAL_ENABLED,
  }

  afterEach(() => {
    for (const [key, value] of Object.entries({
      FEYNMAN_WATCHA_OAUTH_ENABLED: previous.watcha,
      FEYNMAN_TOKENDANCE_ENABLED: previous.tokenDance,
      FEYNMAN_DEEPSEEK_OFFICIAL_ENABLED: previous.deepSeek,
    })) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('keeps the official channel during filing and hides TokenDance when configured', () => {
    process.env.FEYNMAN_WATCHA_OAUTH_ENABLED = 'false'
    process.env.FEYNMAN_TOKENDANCE_ENABLED = 'false'
    process.env.FEYNMAN_DEEPSEEK_OFFICIAL_ENABLED = 'true'
    expect(isTokenDanceEnabled()).toBe(false)
    expect(isDeepSeekOfficialEnabled()).toBe(true)
    expect(isDeepSeekOfficialSupported(new Date('2099-01-01T00:00:00.000Z'))).toBe(true)
    expect(isTokenDanceOnly()).toBe(false)
    expect(resolveAIProvider('tokendance')).toBe('deepseek')
  })

  it('switches to TokenDance after the deployment enables the post-filing mode', () => {
    process.env.FEYNMAN_WATCHA_OAUTH_ENABLED = 'true'
    process.env.FEYNMAN_TOKENDANCE_ENABLED = 'true'
    process.env.FEYNMAN_DEEPSEEK_OFFICIAL_ENABLED = 'false'
    expect(migrateToTokenDanceAfterSunset({
      apiKey: 'deepseek-official-key',
      aiProvider: 'deepseek' as const,
      aiDataConsent: true
    })).toEqual({
      apiKey: '',
      aiProvider: 'tokendance',
      aiDataConsent: false
    })
    expect(isTokenDanceOnly()).toBe(true)
    expect(resolveAIProvider('deepseek')).toBe('tokendance')
  })

  it('moves a stale TokenDance selection back to DeepSeek during filing', () => {
    process.env.FEYNMAN_WATCHA_OAUTH_ENABLED = 'false'
    process.env.FEYNMAN_TOKENDANCE_ENABLED = 'false'
    process.env.FEYNMAN_DEEPSEEK_OFFICIAL_ENABLED = 'true'
    expect(migrateToTokenDanceAfterSunset({
      apiKey: 'tokendance-key',
      aiProvider: 'tokendance',
      aiDataConsent: true,
    })).toEqual({
      apiKey: '',
      aiProvider: 'deepseek',
      aiDataConsent: false,
    })
  })
})
