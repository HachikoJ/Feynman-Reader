import type { AuthProvider } from './auth'

export interface AuthConfig {
  tokendanceAuthorizationUrl: string
  enabledProviders: AuthProvider[]
}

export const TOKENDANCE_OAUTH_AUTHORIZE_URL = 'https://watcha.cn/oauth/authorize'
export const TOKENDANCE_OAUTH_TOKEN_URL = 'https://watcha.cn/oauth/api/token'
export const TOKENDANCE_OAUTH_USERINFO_URL = 'https://watcha.cn/oauth/api/userinfo'
export const TOKENDANCE_OAUTH_CALLBACK_PATH = '/api/auth/tokendance/callback'
export const TOKENDANCE_OAUTH_SCOPE = 'read'

export function getTokendanceCallbackUrl(request?: Request): string {
  const configured = process.env.TOKENDANCE_OAUTH_REDIRECT_URI?.trim()
  if (configured) return configured
  if (request) {
    const url = new URL(request.url)
    const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
    const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
    if (forwardedProto && forwardedHost) return `${forwardedProto}://${forwardedHost}${TOKENDANCE_OAUTH_CALLBACK_PATH}`
    return `${url.origin}${TOKENDANCE_OAUTH_CALLBACK_PATH}`
  }
  return `https://reader.deline.top${TOKENDANCE_OAUTH_CALLBACK_PATH}`
}

export function getAuthConfig(): AuthConfig {
  const tokendanceAuthorizationUrl = process.env.TOKENDANCE_OAUTH_AUTHORIZE_URL?.trim() || TOKENDANCE_OAUTH_AUTHORIZE_URL
  const watchaEnabled = isWatchaOAuthEnabled()
  return {
    tokendanceAuthorizationUrl,
    enabledProviders: watchaEnabled ? ['tokendance', 'password'] : ['password'],
  }
}

export function isWatchaOAuthEnabled(): boolean {
  return process.env.FEYNMAN_WATCHA_OAUTH_ENABLED?.trim().toLowerCase() !== 'false'
}
