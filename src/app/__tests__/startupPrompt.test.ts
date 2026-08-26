import { getActiveStartupPrompt, isAIConfigurationComplete, shouldShowOnboarding } from '../../lib/startupPrompt'

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
  })
})

describe('startup prompt priority', () => {
  it('shows only the data-risk acknowledgement when every prompt is pending', () => {
    expect(getActiveStartupPrompt({
      showDataLossWarning: true,
      showOnboarding: true,
      showApiKeyAlert: true
    })).toBe('data-risk')
  })

  it('shows onboarding after the data-risk acknowledgement is complete', () => {
    expect(getActiveStartupPrompt({
      showDataLossWarning: false,
      showOnboarding: true,
      showApiKeyAlert: true
    })).toBe('onboarding')
  })

  it('shows the API key reminder only after higher-priority prompts are complete', () => {
    expect(getActiveStartupPrompt({
      showDataLossWarning: false,
      showOnboarding: false,
      showApiKeyAlert: true
    })).toBe('api-key')
  })

  it('renders no startup prompt when none is pending', () => {
    expect(getActiveStartupPrompt({
      showDataLossWarning: false,
      showOnboarding: false,
      showApiKeyAlert: false
    })).toBeNull()
  })
})
