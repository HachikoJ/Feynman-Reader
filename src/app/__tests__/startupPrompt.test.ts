import {
  getActiveStartupPrompt,
  isAIConfigurationComplete,
  shouldShowOnboarding,
  shouldShowTokenDanceWelcome
} from '../../lib/startupPrompt'

describe('AI configuration readiness', () => {
  it('requires both a saved key and data-transfer consent', () => {
    expect(isAIConfigurationComplete({ apiKey: '', aiDataConsent: false })).toBe(false)
    expect(isAIConfigurationComplete({ apiKey: 'sk-test', aiDataConsent: false })).toBe(false)
    expect(isAIConfigurationComplete({ apiKey: '  sk-test  ', aiDataConsent: true })).toBe(true)
  })
})

describe('onboarding visibility', () => {
  it('shows onboarding until the current version is completed', () => {
    expect(shouldShowOnboarding(null, '5')).toBe(true)
    expect(shouldShowOnboarding('4', '5')).toBe(true)
    expect(shouldShowOnboarding('5', '5')).toBe(false)
    expect(shouldShowOnboarding(null, '5', true)).toBe(false)
  })
})

describe('TokenDance welcome visibility', () => {
  it('shows once per version and stays out of the OAuth callback flow', () => {
    expect(shouldShowTokenDanceWelcome(null, '1', false, false)).toBe(true)
    expect(shouldShowTokenDanceWelcome('1', '1', false, false)).toBe(false)
    expect(shouldShowTokenDanceWelcome(null, '1', true, false)).toBe(false)
    expect(shouldShowTokenDanceWelcome(null, '1', false, true)).toBe(false)
  })
})

describe('startup prompt priority', () => {
  it('shows only the data-risk acknowledgement when every prompt is pending', () => {
    expect(getActiveStartupPrompt({
      showDataLossWarning: true,
      showTokenDanceWelcome: true,
      showOnboarding: true,
      showApiKeyAlert: true
    })).toBe('data-risk')
  })

  it('shows the one-time TokenDance welcome after the data-risk acknowledgement', () => {
    expect(getActiveStartupPrompt({
      showDataLossWarning: false,
      showTokenDanceWelcome: true,
      showOnboarding: true,
      showApiKeyAlert: true
    })).toBe('tokendance-welcome')
  })

  it('shows onboarding after the TokenDance welcome is complete', () => {
    expect(getActiveStartupPrompt({
      showDataLossWarning: false,
      showTokenDanceWelcome: false,
      showOnboarding: true,
      showApiKeyAlert: true
    })).toBe('onboarding')
  })

  it('shows the API key reminder only after higher-priority prompts are complete', () => {
    expect(getActiveStartupPrompt({
      showDataLossWarning: false,
      showTokenDanceWelcome: false,
      showOnboarding: false,
      showApiKeyAlert: true
    })).toBe('api-key')
  })

  it('renders no startup prompt when none is pending', () => {
    expect(getActiveStartupPrompt({
      showDataLossWarning: false,
      showTokenDanceWelcome: false,
      showOnboarding: false,
      showApiKeyAlert: false
    })).toBeNull()
  })
})
