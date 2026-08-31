import { APP_ROUTES } from './appRoutes'

export const TOKENDANCE_BASE_URL = 'https://tokendance.space'
export const TOKENDANCE_GATEWAY_URL = `${TOKENDANCE_BASE_URL}/gateway/v1`
// Keep the originally registered product URL for TokenDance attribution. This
// identifier is independent from the OAuth callback URL below.
export const TOKENDANCE_APP_URL = 'https://reader.deline.top'
export const TOKENDANCE_CALLBACK_ORIGIN = 'https://reader.deline.top'
export type TokendanceRecoveryAction = 'top_up_balance' | 'reauthorize_api_key' | 'api_key_quota'
export const TOKENDANCE_RECOVERY_PREFIX = 'TOKENDANCE_RECOVERY:'

const verifierKey = 'feynman-tokendance-pkce-verifier'
const stateKey = 'feynman-tokendance-oauth-state'
const SERVER_MANAGED_API_KEY = 'server-managed'

async function accountTokendanceRequest<T>(method: 'GET' | 'POST' | 'PATCH', body?: unknown): Promise<T> {
  const response = await fetch('/api/account/tokendance/', {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(data.error || `TokenDance account request failed (${response.status})`)
  return data
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function getTokendanceRecoveryAction(error: unknown): TokendanceRecoveryAction | null {
  if (!error || typeof error !== 'object') return null
  const candidate = error as { headers?: unknown }
  const headers = candidate.headers
  let rawAction: unknown = null
  if (headers && typeof headers === 'object' && 'get' in headers && typeof headers.get === 'function') {
    rawAction = headers.get('TokenDance-Recovery-Action')
  } else if (headers && typeof headers === 'object') {
    const headerMap = headers as Record<string, unknown>
    rawAction = headerMap['TokenDance-Recovery-Action'] ?? headerMap['tokendance-recovery-action']
  }
  return rawAction === 'top_up_balance' || rawAction === 'reauthorize_api_key' || rawAction === 'api_key_quota'
    ? rawAction
    : null
}

export function tokendanceRecoveryError(action: TokendanceRecoveryAction, cause?: unknown): Error {
  return new Error(`${TOKENDANCE_RECOVERY_PREFIX}${action}`, { cause })
}

export function getTokendanceRecoveryActionFromError(error: unknown): TokendanceRecoveryAction | null {
  if (!(error instanceof Error) || !error.message.startsWith(TOKENDANCE_RECOVERY_PREFIX)) return null
  const action = error.message.slice(TOKENDANCE_RECOVERY_PREFIX.length)
  return action === 'top_up_balance' || action === 'reauthorize_api_key' || action === 'api_key_quota' ? action : null
}

export function tokendanceRecoveryMessage(error: unknown, lang: 'zh' | 'en'): string | null {
  const action = getTokendanceRecoveryActionFromError(error)
  if (!action) return null
  if (lang === 'zh') {
    if (action === 'top_up_balance') return 'TokenDance 余额不足，请前往设置创建充值会话后重试。'
    if (action === 'reauthorize_api_key') return 'TokenDance API Key 已失效，请前往设置重新授权。'
    return 'TokenDance API Key 已达到周期额度，请前往设置查看额度或重新授权。'
  }
  if (action === 'top_up_balance') return 'Your TokenDance balance is insufficient. Open Settings to create a top-up session, then retry.'
  if (action === 'reauthorize_api_key') return 'Your TokenDance API key is no longer valid. Open Settings to authorize again.'
  return 'Your TokenDance API key has reached its periodic quota. Open Settings to review the quota or authorize again.'
}

export async function createTokendanceAuthorizationUrl(): Promise<string> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    throw new Error('OAuth authorization requires a browser with Web Crypto support.')
  }
  const verifier = `${crypto.randomUUID()}${crypto.randomUUID()}`
  const state = crypto.randomUUID()
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  sessionStorage.setItem(verifierKey, verifier)
  sessionStorage.setItem(stateKey, state)

  const callback = `${TOKENDANCE_CALLBACK_ORIGIN}${APP_ROUTES.home}?view=settings&tokendance_callback=1&state=${encodeURIComponent(state)}`
  const params = new URLSearchParams({
    callback_url: callback,
    code_challenge: base64Url(new Uint8Array(digest)),
    code_challenge_method: 'S256',
    app_url: TOKENDANCE_APP_URL,
    key_name: '费曼读书助手'
  })
  return `${TOKENDANCE_BASE_URL}/auth?${params.toString()}`
}

export async function exchangeTokendanceCode(code: string, state: string | null): Promise<string> {
  if (typeof window === 'undefined') throw new Error('OAuth exchange requires a browser.')
  const expectedState = sessionStorage.getItem(stateKey)
  const verifier = sessionStorage.getItem(verifierKey)
  if (!expectedState || !state || state !== expectedState || !verifier) {
    throw new Error('Tokendance OAuth state expired or did not match.')
  }

  const response = await fetch(`${TOKENDANCE_BASE_URL}/portal/api/v1/auth/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' })
  })
  if (!response.ok) throw new Error(`Tokendance OAuth exchange failed (${response.status}).`)
  const data = await response.json() as { key?: unknown }
  if (typeof data.key !== 'string' || data.key.length < 20) throw new Error('Tokendance did not return a valid API key.')
  sessionStorage.removeItem(verifierKey)
  sessionStorage.removeItem(stateKey)
  return data.key
}

async function tokendanceRequest<T>(path: string, apiKey: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${TOKENDANCE_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers
    }
  })
  if (!response.ok) {
    const action = response.headers.get('TokenDance-Recovery-Action')
    if (action === 'top_up_balance' || action === 'reauthorize_api_key' || action === 'api_key_quota') {
      throw tokendanceRecoveryError(action)
    }
    throw new Error(`Tokendance request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

export interface TokendanceBalance {
  credits: number
  credits_used: number
  balance: number
}

export async function fetchTokendanceBalance(apiKey: string): Promise<TokendanceBalance> {
  if (apiKey === SERVER_MANAGED_API_KEY) return accountTokendanceRequest<TokendanceBalance>('GET')
  const data = await tokendanceRequest<{ balance: TokendanceBalance }>('/portal/api/v1/user/balance', apiKey)
  return data.balance
}

export interface TokendancePaymentSession {
  id: string
  amount: number
  status: 'pending' | 'paid' | 'failed' | 'closed' | 'refunded'
  payment_url: string
  status_url: string
  expired_at: number
}

function validateTokendancePaymentSession(session: TokendancePaymentSession): TokendancePaymentSession {
  let paymentUrl: URL
  let statusUrl: URL
  try {
    paymentUrl = new URL(session.payment_url)
    statusUrl = new URL(session.status_url)
  } catch {
    throw new Error('Tokendance returned an invalid payment session URL.')
  }

  if (paymentUrl.protocol !== 'https:') {
    throw new Error('Tokendance returned an insecure payment URL.')
  }
  if (statusUrl.origin !== TOKENDANCE_BASE_URL || !statusUrl.pathname.startsWith('/portal/api/v1/payment/sessions/')) {
    throw new Error('Tokendance returned an invalid payment status URL.')
  }
  return session
}

export async function createTokendancePaymentSession(apiKey: string, amount: number): Promise<TokendancePaymentSession> {
  if (apiKey === SERVER_MANAGED_API_KEY) {
    return validateTokendancePaymentSession(await accountTokendanceRequest<TokendancePaymentSession>('POST', { amount }))
  }
  const data = await tokendanceRequest<{ session: TokendancePaymentSession }>('/portal/api/v1/payment/sessions', apiKey, {
    method: 'POST',
    body: JSON.stringify({ amount })
  })
  return validateTokendancePaymentSession(data.session)
}

export async function getTokendancePaymentSession(apiKey: string, statusUrl: string): Promise<TokendancePaymentSession> {
  let validatedStatusUrl: URL
  try {
    validatedStatusUrl = new URL(statusUrl)
  } catch {
    throw new Error('Tokendance payment status URL is invalid.')
  }
  if (validatedStatusUrl.origin !== TOKENDANCE_BASE_URL || !validatedStatusUrl.pathname.startsWith('/portal/api/v1/payment/sessions/')) {
    throw new Error('Tokendance payment status URL is invalid.')
  }

  if (apiKey === SERVER_MANAGED_API_KEY) {
    return validateTokendancePaymentSession(await accountTokendanceRequest<TokendancePaymentSession>('PATCH', { statusUrl: validatedStatusUrl.toString() }))
  }

  const response = await fetch(validatedStatusUrl.toString(), { headers: { Authorization: `Bearer ${apiKey}` } })
  if (!response.ok) throw new Error(`Tokendance payment status failed (${response.status}).`)
  const data = await response.json() as { session?: TokendancePaymentSession }
  return validateTokendancePaymentSession(data.session || data as unknown as TokendancePaymentSession)
}
