export type ConfiguredAIProvider = 'tokendance' | 'deepseek'

export interface AIProviderSettings {
  apiKey: string
  aiProvider?: ConfiguredAIProvider
  aiDataConsent?: boolean
}

function readFlag(serverKey: string, publicKey: string, fallback: boolean): boolean {
  const value = typeof window === 'undefined' ? process.env[serverKey] : readPublicFlag(publicKey)
  if (value === undefined || value.trim() === '') return fallback
  return value.trim().toLowerCase() === 'true'
}

// Keep NEXT_PUBLIC accesses literal so Next.js embeds them in browser bundles.
function readPublicFlag(key: string): string | undefined {
  if (key === 'NEXT_PUBLIC_FEYNMAN_WATCHA_OAUTH_ENABLED') return process.env.NEXT_PUBLIC_FEYNMAN_WATCHA_OAUTH_ENABLED
  if (key === 'NEXT_PUBLIC_FEYNMAN_TOKENDANCE_ENABLED') return process.env.NEXT_PUBLIC_FEYNMAN_TOKENDANCE_ENABLED
  if (key === 'NEXT_PUBLIC_FEYNMAN_DEEPSEEK_OFFICIAL_ENABLED') return process.env.NEXT_PUBLIC_FEYNMAN_DEEPSEEK_OFFICIAL_ENABLED
  return undefined
}

/** Whether the TokenDance AI configuration and gateway are available. */
export function isTokenDanceEnabled(): boolean {
  // Keep existing local deployments working when they have not received the
  // new flag yet. deploy.sh always emits an explicit value for production.
  return readFlag('FEYNMAN_TOKENDANCE_ENABLED', 'NEXT_PUBLIC_FEYNMAN_TOKENDANCE_ENABLED', true)
}

/** Whether the direct official DeepSeek channel is available. */
export function isDeepSeekOfficialEnabled(): boolean {
  // During filing the direct channel remains available. Once Watcha is
  // enabled, TokenDance is the sole supported AI configuration channel.
  return readFlag('FEYNMAN_DEEPSEEK_OFFICIAL_ENABLED', 'NEXT_PUBLIC_FEYNMAN_DEEPSEEK_OFFICIAL_ENABLED', true)
}

/** Kept for compatibility with existing callers; policy is now env-driven. */
export function isDeepSeekOfficialSupported(_now = new Date()): boolean {
  return isDeepSeekOfficialEnabled()
}

export function isTokenDanceOnly(): boolean {
  return isTokenDanceEnabled() && !isDeepSeekOfficialEnabled()
}

/** Resolve a persisted provider against the channels enabled by this deployment. */
export function resolveAIProvider(preferred?: ConfiguredAIProvider): ConfiguredAIProvider | null {
  const tokenDanceEnabled = isTokenDanceEnabled()
  const deepSeekEnabled = isDeepSeekOfficialEnabled()
  if (preferred === 'tokendance' && tokenDanceEnabled) return 'tokendance'
  if (preferred === 'deepseek' && deepSeekEnabled) return 'deepseek'
  if (tokenDanceEnabled) return 'tokendance'
  if (deepSeekEnabled) return 'deepseek'
  return null
}

export function isOfficialDeepSeekProvider(provider: ConfiguredAIProvider | undefined): boolean {
  return provider === 'deepseek'
}

/**
 * Normalizes a persisted provider after a deployment mode switch. The name is
 * retained so older backup/store callers remain source-compatible.
 */
export function migrateToTokenDanceAfterSunset<T extends AIProviderSettings>(settings: T, _now = new Date()): T {
  if (settings.aiProvider === 'deepseek' && !isDeepSeekOfficialEnabled() && isTokenDanceEnabled()) {
    return { ...settings, apiKey: '', aiProvider: 'tokendance', aiDataConsent: false }
  }
  if (settings.aiProvider === 'tokendance' && !isTokenDanceEnabled() && isDeepSeekOfficialEnabled()) {
    return { ...settings, apiKey: '', aiProvider: 'deepseek', aiDataConsent: false }
  }
  return settings
}

export function deepSeekSunsetMessage(lang: 'zh' | 'en'): string {
  return lang === 'zh'
    ? '当前部署已关闭 DeepSeek 官方配置渠道，请改用 TokenDance AI 配置。'
    : 'The official DeepSeek configuration channel is disabled for this deployment. Use the TokenDance AI configuration instead.'
}

export function tokenDanceUnavailableMessage(lang: 'zh' | 'en'): string {
  return lang === 'zh'
    ? 'TokenDance 配置正在等待备案完成后恢复。现有 TokenDance 能力和配置不会删除，恢复后可继续使用。'
    : 'TokenDance configuration will return after filing is complete. Existing TokenDance support and saved configuration are preserved.'
}
