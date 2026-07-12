export type StartupPrompt = 'data-risk' | 'onboarding' | 'api-key' | null

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
