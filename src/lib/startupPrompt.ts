export type StartupPrompt = 'data-risk' | 'tokendance-welcome' | 'tokendance-migration' | 'onboarding' | 'api-key' | null

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

export function hasUserHistory(books: Array<{ isSample?: boolean }>): boolean {
  return books.some(book => book.isSample !== true)
}

export function shouldShowTokenDanceWelcome(
  completedVersion: string | null,
  currentVersion: string,
  isOAuthCallback: boolean,
  aiConfigured: boolean,
  userHasHistory = false
): boolean {
  return !isOAuthCallback && !aiConfigured && !userHasHistory && completedVersion !== currentVersion
}

export function shouldShowTokenDanceMigration(
  completedVersion: string | null,
  currentVersion: string,
  isOAuthCallback: boolean,
  userHasHistory: boolean
): boolean {
  return !isOAuthCallback && userHasHistory && completedVersion !== currentVersion
}

export function getActiveStartupPrompt({
  showDataLossWarning,
  showTokenDanceWelcome,
  showTokenDanceMigration = false,
  showOnboarding,
  showApiKeyAlert
}: {
  showDataLossWarning: boolean
  showTokenDanceWelcome: boolean
  showTokenDanceMigration?: boolean
  showOnboarding: boolean
  showApiKeyAlert: boolean
}): StartupPrompt {
  if (showDataLossWarning) return 'data-risk'
  if (showTokenDanceWelcome) return 'tokendance-welcome'
  if (showTokenDanceMigration) return 'tokendance-migration'
  if (showOnboarding) return 'onboarding'
  if (showApiKeyAlert) return 'api-key'
  return null
}
