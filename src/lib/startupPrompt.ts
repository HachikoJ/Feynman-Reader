export type StartupPrompt = 'data-risk' | 'onboarding' | 'api-key' | null

export function isAIConfigurationComplete(settings: { apiKey: string; aiDataConsent?: boolean }): boolean {
  return settings.apiKey.trim().length > 0 && settings.aiDataConsent === true
}

export function shouldShowOnboarding(completedVersion: string | null, currentVersion: string): boolean {
  return completedVersion !== currentVersion
}

export function getActiveStartupPrompt({
  showDataLossWarning,
  showOnboarding,
  showApiKeyAlert
}: {
  showDataLossWarning: boolean
  showOnboarding: boolean
  showApiKeyAlert: boolean
}): StartupPrompt {
  if (showDataLossWarning) return 'data-risk'
  if (showOnboarding) return 'onboarding'
  if (showApiKeyAlert) return 'api-key'
  return null
}
