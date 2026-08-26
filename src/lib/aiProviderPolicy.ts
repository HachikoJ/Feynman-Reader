export type ConfiguredAIProvider = 'tokendance' | 'deepseek'

export interface AIProviderSettings {
  apiKey: string
  aiProvider?: ConfiguredAIProvider
  aiDataConsent?: boolean
}

// Midnight on 2026-10-01 in Asia/Shanghai (UTC+08:00).
export const DEEPSEEK_OFFICIAL_SUNSET_AT = new Date('2026-10-01T00:00:00+08:00')

export function isDeepSeekOfficialSupported(now = new Date()): boolean {
  return now.getTime() < DEEPSEEK_OFFICIAL_SUNSET_AT.getTime()
}

export function isTokenDanceOnly(now = new Date()): boolean {
  return !isDeepSeekOfficialSupported(now)
}

export function isOfficialDeepSeekProvider(provider: ConfiguredAIProvider | undefined): boolean {
  return provider !== 'tokendance'
}

export function migrateToTokenDanceAfterSunset<T extends AIProviderSettings>(settings: T, now = new Date()): T {
  if (!isTokenDanceOnly(now) || !isOfficialDeepSeekProvider(settings.aiProvider)) return settings
  return {
    ...settings,
    apiKey: '',
    aiProvider: 'tokendance',
    aiDataConsent: false
  }
}

export function deepSeekSunsetMessage(lang: 'zh' | 'en'): string {
  return lang === 'zh'
    ? 'DeepSeek 官方配置渠道已于 2026 年 10 月 1 日下线，已配置的旧 Key 不再支持。请自行保存相关配置后，改用 TokenDance API Key。'
    : 'The official DeepSeek configuration channel ended on October 1, 2026. Previously configured keys are no longer supported. Save any relevant configuration and set up a TokenDance API key.'
}
