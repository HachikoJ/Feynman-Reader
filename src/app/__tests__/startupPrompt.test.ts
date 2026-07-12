import { getActiveStartupPrompt } from '../../lib/startupPrompt'

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
