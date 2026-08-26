export type StartupPrompt = 'data-risk' | 'tokendance-welcome' | 'onboarding' | 'api-key' | null

export function isAIConfigurationComplete(settings: { apiKey: string; aiDataConsent?: boolean }): boolean {
  return settings.apiKey.trim().length > 0 && settings.aiDataConsent === true
}

export function shouldShowOnboarding(
  completedVersion: string | null,
  currentVersion: string,
  suppressForCurrentVisit = false
): boolean {
  return !suppressForCurrentVisit && completedVersion !== currentVersion
}

export function shouldShowTokenDanceWelcome(
  completedVersion: string | null,
  currentVersion: string,
  isOAuthCallback: boolean,
  aiConfigured: boolean
): boolean {
  return !isOAuthCallback && !aiConfigured && completedVersion !== currentVersion
}

export function getActiveStartupPrompt({
  showDataLossWarning,
  showTokenDanceWelcome,
  showOnboarding,
  showApiKeyAlert
}: {
  showDataLossWarning: boolean
  showTokenDanceWelcome: boolean
  showOnboarding: boolean
  showApiKeyAlert: boolean
}): StartupPrompt {
  if (showDataLossWarning) return 'data-risk'
  if (showTokenDanceWelcome) return 'tokendance-welcome'
  if (showOnboarding) return 'onboarding'
  if (showApiKeyAlert) return 'api-key'
  return null
}
